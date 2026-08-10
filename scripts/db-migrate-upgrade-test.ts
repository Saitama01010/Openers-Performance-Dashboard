import "dotenv/config";

import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type RowDataPacket } from "mysql2/promise";

const PRE_HARDENING_MIGRATION_COUNT = 20;
const DEFAULT_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
const ids = {
  profile: "10000000-0000-4000-8000-000000000001",
  team: "10000000-0000-4000-8000-000000000002",
  batch: "10000000-0000-4000-8000-000000000003",
  userBatch: "10000000-0000-4000-8000-000000000004",
  version: "10000000-0000-4000-8000-000000000005",
  metric: "10000000-0000-4000-8000-000000000006",
  actorAudit: "10000000-0000-4000-8000-000000000007",
  targetAudit: "10000000-0000-4000-8000-000000000008",
  systemAudit: "10000000-0000-4000-8000-000000000009",
};
const scopeKey = "dialer:agent_hours_performance:2026-07-01:all:all";

function upgradeDatabaseUrl() {
  const raw = process.env.UPGRADE_TEST_DATABASE_URL;
  if (!raw) throw new Error("UPGRADE_TEST_DATABASE_URL is required.");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\/+/, "").toLowerCase();
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DATABASE_ENVIRONMENT !== "test" ||
    process.env.ALLOW_UPGRADE_MIGRATION_TEST !== "true" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase()) ||
    !/(^|[_-])upgrade($|[_-])/.test(database) ||
    !/(^|[_-])test($|[_-])/.test(database)
  ) {
    throw new Error(
      "Upgrade rehearsal requires an explicitly allowed local database with standalone upgrade and test markers.",
    );
  }
  return raw;
}

async function resetSchema(pool: mysql.Pool) {
  const [tables] = await pool.query<RowDataPacket[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of tables) {
      const name = String(Object.values(table)[0]);
      await pool.query(`DROP TABLE IF EXISTS \`${name.replaceAll("`", "``")}\``);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function legacyMigrationFolder() {
  const directory = await mkdtemp(join(tmpdir(), "openers-upgrade-"));
  await mkdir(join(directory, "meta"));
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string }>;
    [key: string]: unknown;
  };
  const legacyEntries = journal.entries.slice(0, PRE_HARDENING_MIGRATION_COUNT);
  await writeFile(
    join(directory, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: legacyEntries }, null, 2),
  );
  for (const entry of legacyEntries) {
    await copyFile(`drizzle/${entry.tag}.sql`, join(directory, `${entry.tag}.sql`));
  }
  return directory;
}

async function insertLegacyFixture(pool: mysql.Pool) {
  await pool.execute(
    "INSERT INTO profiles (id, organization_id, email, name, role, active, account_status) VALUES (?, ?, ?, ?, 'admin', true, 'active')",
    [ids.profile, DEFAULT_ORGANIZATION_ID, "upgrade-admin@example.test", "Upgrade Admin"],
  );
  await pool.execute(
    "INSERT INTO teams (id, organization_id, name, active) VALUES (?, ?, ?, true)",
    [ids.team, DEFAULT_ORGANIZATION_ID, "Upgrade Team"],
  );
  await pool.execute(
    "INSERT INTO dialer_import_batches (id, source, import_type, file_name, file_hash, raw_file_content, import_status, uploaded_by_id, published_by_id, published_at, reporting_start_date, reporting_end_date, row_count) VALUES (?, 'dialer', 'agent_hours_performance', 'legacy.csv', ?, ?, 'active', ?, ?, '2026-07-02 00:00:00', '2026-07-01', '2026-07-01', 1)",
    [ids.batch, "a".repeat(64), "Agent,Date,Calls\nUpgrade Admin,2026-07-01,5\n", ids.profile, ids.profile],
  );
  await pool.execute(
    "INSERT INTO user_import_batches (id, file_name, file_hash, user_import_status, uploaded_by_id, raw_file_content, row_count, expires_at) VALUES (?, 'legacy-users.csv', ?, 'confirmed', ?, 'Name,Email\\nUpgrade Admin,upgrade-admin@example.test\\n', 1, '2026-07-03 00:00:00')",
    [ids.userBatch, "b".repeat(64), ids.profile],
  );
  await pool.execute(
    "INSERT INTO dialer_dataset_scopes (scope_key, source, import_type, reporting_date, team_id, revision) VALUES (?, 'dialer', 'agent_hours_performance', '2026-07-01', ?, 1)",
    [scopeKey, ids.team],
  );
  await pool.execute(
    "INSERT INTO dialer_dataset_versions (id, import_batch_id, scope_key, source, import_type, reporting_date, team_id, version_number, dataset_version_status, row_count, matched_agent_count, total_calls, activated_at) VALUES (?, ?, ?, 'dialer', 'agent_hours_performance', '2026-07-01', ?, 1, 'active', 1, 1, 5, '2026-07-02 00:00:00')",
    [ids.version, ids.batch, scopeKey, ids.team],
  );
  await pool.execute(
    "UPDATE dialer_dataset_scopes SET active_version_id = ? WHERE scope_key = ?",
    [ids.version, scopeKey],
  );
  await pool.execute(
    "INSERT INTO dialer_agent_hourly_metrics (id, source, source_agent_name, agent_profile_id, batch_id, version_id, metric_date, metric_hour, metric_key, calls, row_hash, team_id_snapshot, team_name_snapshot) VALUES (?, 'dialer', 'Upgrade Admin', ?, ?, ?, '2026-07-01', 9, '2026-07-01T09', 5, ?, ?, 'Upgrade Team')",
    [ids.metric, ids.profile, ids.batch, ids.version, "c".repeat(64), ids.team],
  );
  await pool.execute(
    "INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, metadata) VALUES (?, ?, 'legacy.actor', 'dialer_import_batch', ?, JSON_OBJECT('fixture', true)), (?, NULL, 'legacy.target', 'profile', ?, JSON_OBJECT('fixture', true)), (?, NULL, 'legacy.system', 'system', NULL, JSON_OBJECT('fixture', true))",
    [ids.actorAudit, ids.profile, ids.batch, ids.targetAudit, ids.profile, ids.systemAudit],
  );
}

async function scalar(pool: mysql.Pool, query: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(query);
  return Number(Object.values(rows[0] ?? { value: 0 })[0]);
}

async function verifyUpgrade(pool: mysql.Pool) {
  const expectedCounts = {
    organizations: 1,
    profiles: 1,
    teams: 1,
    dialer_import_batches: 1,
    user_import_batches: 1,
    dialer_dataset_versions: 1,
    dialer_agent_hourly_metrics: 1,
    audit_logs: 3,
    import_jobs: 0,
    email_outbox: 0,
  };
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = await scalar(pool, `SELECT COUNT(*) FROM \`${table}\``);
    if (actual !== expected) throw new Error(`${table} count changed: expected ${expected}, received ${actual}.`);
  }

  const [batchRows] = await pool.execute<RowDataPacket[]>(
    "SELECT organization_id, raw_file_content, import_status FROM dialer_import_batches WHERE id = ?",
    [ids.batch],
  );
  const [userBatchRows] = await pool.execute<RowDataPacket[]>(
    "SELECT organization_id, user_import_status FROM user_import_batches WHERE id = ?",
    [ids.userBatch],
  );
  if (
    batchRows[0]?.organization_id !== DEFAULT_ORGANIZATION_ID ||
    userBatchRows[0]?.organization_id !== DEFAULT_ORGANIZATION_ID ||
    batchRows[0]?.import_status !== "active" ||
    userBatchRows[0]?.user_import_status !== "confirmed" ||
    !String(batchRows[0]?.raw_file_content ?? "").includes("Upgrade Admin")
  ) {
    throw new Error("Legacy import ownership, status, or raw content was not preserved.");
  }

  const [scopeRows] = await pool.execute<RowDataPacket[]>(
    "SELECT scopes.active_version_id, versions.import_batch_id, versions.dataset_version_status FROM dialer_dataset_scopes scopes JOIN dialer_dataset_versions versions ON versions.id = scopes.active_version_id WHERE scopes.scope_key = ?",
    [scopeKey],
  );
  if (
    scopeRows[0]?.active_version_id !== ids.version ||
    scopeRows[0]?.import_batch_id !== ids.batch ||
    scopeRows[0]?.dataset_version_status !== "active"
  ) {
    throw new Error("The active import/version invariant changed during upgrade.");
  }

  const [auditRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, organization_id, actor_display_name FROM audit_logs ORDER BY id",
  );
  if (
    auditRows.some((row) => row.organization_id !== DEFAULT_ORGANIZATION_ID) ||
    auditRows.find((row) => row.id === ids.actorAudit)?.actor_display_name !== "Upgrade Admin"
  ) {
    throw new Error("Audit organization or actor-history backfill failed.");
  }

  const [foreignKeys] = await pool.execute<RowDataPacket[]>(
    "SELECT constraint_name AS constraintName, delete_rule AS deleteRule FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name IN ('audit_logs_actor_profile_id_profiles_id_fk', 'email_outbox_organization_id_organizations_id_fk')",
  );
  const rules = new Map(foreignKeys.map((row) => [row.constraintName, row.deleteRule]));
  if (
    rules.get("audit_logs_actor_profile_id_profiles_id_fk") !== "SET NULL" ||
    rules.get("email_outbox_organization_id_organizations_id_fk") !== "CASCADE"
  ) {
    throw new Error(
      `The reviewed audit/outbox deletion semantics were not installed: ${JSON.stringify(Object.fromEntries(rules))}.`,
    );
  }
}

async function main() {
  const pool = mysql.createPool({ uri: upgradeDatabaseUrl(), connectionLimit: 2 });
  const legacyFolder = await legacyMigrationFolder();
  try {
    await resetSchema(pool);
    const database = drizzle(pool);
    await migrate(database, { migrationsFolder: legacyFolder });
    await insertLegacyFixture(pool);
    await migrate(database, { migrationsFolder: "drizzle" });
    await verifyUpgrade(pool);
    console.info(JSON.stringify({
      action: "database.upgrade_rehearsal",
      fromMigration: "0019_handy_terrax",
      throughMigration: "0025_wise_prism",
      result: "passed",
    }));
  } finally {
    await pool.end();
    await rm(legacyFolder, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  console.error(
    error instanceof Error ? error.message : "Upgrade migration rehearsal failed.",
    cause instanceof Error ? cause.message : "",
  );
  process.exitCode = 1;
});
