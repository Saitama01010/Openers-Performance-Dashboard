import "dotenv/config";

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { hashPassword } from "../src/auth/password";
import { validatePassword } from "../src/auth/security";
import {
  encryptTemporaryPassword,
} from "../src/auth/temporary-password-core";
import { newId } from "../src/lib/ids";

const REQUIRED_EXECUTE_FLAG = "--execute";
const REQUIRED_CONFIRM_FLAG = "--confirm-delete-all-local-users";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_NAME = "Local Administrator";
const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type DatabaseIdentity = {
  url: URL;
  databaseName: string;
  maskedDatabaseName: string;
};

type CountSummary = Record<string, number>;

type BackupStatus = {
  ok: boolean;
  path: string | null;
  bytes: number;
  checkedAt: string;
  reason: string;
};

function hasArg(name: string) {
  return process.argv.slice(2).includes(name);
}

function maskedDatabaseName(databaseName: string) {
  if (databaseName.length <= 4) return "*".repeat(databaseName.length);
  return `${databaseName.slice(0, 3)}***${databaseName.slice(-4)}`;
}

function parseDatabaseUrl(): DatabaseIdentity {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (url.protocol !== "mysql:") {
    throw new Error("Local user reset currently supports MySQL only.");
  }

  const databaseName = url.pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  return {
    url,
    databaseName,
    maskedDatabaseName: maskedDatabaseName(databaseName),
  };
}

function assertSafeDevelopmentDatabase(identity: DatabaseIdentity) {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "development") {
    throw new Error(
      `Refusing local reset because NODE_ENV is ${nodeEnv}; expected development.`,
    );
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(identity.url.hostname)) {
    throw new Error("Refusing local reset because DATABASE_URL is not local.");
  }

  const unsafePattern = /(prod|production|preview|staging)/i;
  if (
    unsafePattern.test(identity.url.hostname) ||
    unsafePattern.test(identity.databaseName)
  ) {
    throw new Error(
      "Refusing local reset because DATABASE_URL contains a production-like identifier.",
    );
  }

  if (/test/i.test(identity.databaseName)) {
    throw new Error(
      "Refusing local reset because DATABASE_URL appears to point at a test database.",
    );
  }

  if (process.env.TEST_DATABASE_URL) {
    const testUrl = new URL(process.env.TEST_DATABASE_URL);
    if (
      testUrl.hostname === identity.url.hostname &&
      (testUrl.port || "3306") === (identity.url.port || "3306") &&
      testUrl.pathname === identity.url.pathname
    ) {
      throw new Error(
        "Refusing local reset because DATABASE_URL equals TEST_DATABASE_URL.",
      );
    }
  }

  if (!process.env.TEMP_PASSWORD_ENCRYPTION_KEY) {
    throw new Error(
      "TEMP_PASSWORD_ENCRYPTION_KEY is required to create a recoverable temporary admin password.",
    );
  }
  const resetPassword = process.env.LOCAL_RESET_ADMIN_PASSWORD ?? "";
  if (validatePassword(resetPassword).length > 0 || resetPassword.length > 256) {
    throw new Error(
      "LOCAL_RESET_ADMIN_PASSWORD must be a private valid password no longer than 256 characters.",
    );
  }
}

function backupDirectory() {
  return path.join(
    path.dirname(process.cwd()),
    `${path.basename(process.cwd())}_DB_Backups`,
  );
}

function latestBackup(identity: DatabaseIdentity): BackupStatus {
  const checkedAt = new Date().toISOString();
  const directory = backupDirectory();
  if (!existsSync(directory)) {
    return {
      ok: false,
      path: null,
      bytes: 0,
      checkedAt,
      reason: `Backup directory was not found: ${directory}`,
    };
  }

  const backupPrefix = `${identity.databaseName}-reset-`;
  const backups = readdirSync(directory)
    .filter((name) => name.startsWith(backupPrefix) && name.endsWith(".sql"))
    .map((name) => path.join(directory, name))
    .map((backupPath) => ({ path: backupPath, stat: statSync(backupPath) }))
    .filter((backup) => backup.stat.isFile())
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  const backup = backups[0];
  if (!backup) {
    return {
      ok: false,
      path: null,
      bytes: 0,
      checkedAt,
      reason: `No reset backup found in ${directory}`,
    };
  }

  const ageMs = Date.now() - backup.stat.mtimeMs;
  if (ageMs > BACKUP_MAX_AGE_MS) {
    return {
      ok: false,
      path: backup.path,
      bytes: backup.stat.size,
      checkedAt,
      reason: "Latest reset backup is older than 24 hours.",
    };
  }

  const dumpContent = readFileSync(backup.path, { encoding: "utf8" });
  if (!dumpContent.includes("CREATE TABLE `profiles`")) {
    return {
      ok: false,
      path: backup.path,
      bytes: backup.stat.size,
      checkedAt,
      reason: "Latest reset backup does not include the profiles table.",
    };
  }

  return {
    ok: true,
    path: backup.path,
    bytes: backup.stat.size,
    checkedAt,
    reason: "Latest reset backup is recent and includes profiles.",
  };
}

async function countTable(connection: mysql.Connection, tableName: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `select count(*) as count from \`${tableName}\``,
  );
  return Number(rows[0]?.count ?? 0);
}

async function collectCounts(connection: mysql.Connection) {
  const tables = [
    "profiles",
    "sessions",
    "account_invitation_tokens",
    "password_reset_tokens",
    "email_delivery_attempts",
    "user_permission_overrides",
    "team_memberships",
    "source_user_mappings",
    "user_import_batches",
    "dialer_import_batches",
    "dialer_agent_hourly_metrics",
    "dialer_import_rows",
    "audit_logs",
    "teams",
    "roles",
    "permissions",
    "role_permissions",
    "rate_limit_records",
  ];
  const counts: CountSummary = {};
  for (const table of tables) {
    counts[table] = await countTable(connection, table);
  }
  const [visibleRows] = await connection.query<RowDataPacket[]>(
    "select count(*) as count from profiles where account_status <> 'deleted'",
  );
  return {
    tableCounts: counts,
    visibleUsers: Number(visibleRows[0]?.count ?? 0),
  };
}

async function collectProfileBreakdown(connection: mysql.Connection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `select account_status as status, role, active, count(*) as count
     from profiles
     group by account_status, role, active
     order by account_status, role, active`,
  );
  return rows.map((row) => ({
    status: String(row.status),
    role: String(row.role),
    active: Boolean(row.active),
    count: Number(row.count),
  }));
}

async function deleteAll(connection: mysql.Connection, tableName: string) {
  const [result] = await connection.query<ResultSetHeader>(
    `delete from \`${tableName}\``,
  );
  return result.affectedRows;
}

async function executeReset(connection: mysql.Connection) {
  const adminId = newId();
  const temporaryPassword = process.env.LOCAL_RESET_ADMIN_PASSWORD!;
  const passwordHash = await hashPassword(temporaryPassword);
  const encryptedTemporaryPassword =
    encryptTemporaryPassword(temporaryPassword);
  const now = new Date();
  const nowSql = now.toISOString().slice(0, 19).replace("T", " ");

  await connection.beginTransaction();
  try {
    const [profileRows] = await connection.query<RowDataPacket[]>(
      `select id, name, email, shift, role, account_status as accountStatus
       from profiles
       for update`,
    );
    const oldUserIds = profileRows.map((row) => String(row.id));

    const deleted = {
      sessions: await deleteAll(connection, "sessions"),
      accountInvitationTokens: await deleteAll(
        connection,
        "account_invitation_tokens",
      ),
      passwordResetTokens: await deleteAll(connection, "password_reset_tokens"),
      emailDeliveryAttempts: await deleteAll(
        connection,
        "email_delivery_attempts",
      ),
      userPermissionOverrides: await deleteAll(
        connection,
        "user_permission_overrides",
      ),
      rateLimitRecords: await deleteAll(connection, "rate_limit_records"),
    };

    let membershipsEnded = 0;
    let mappingsDeactivated = 0;
    let profilesScrubbed = 0;

    if (oldUserIds.length > 0) {
      const [membershipResult] = await connection.query<ResultSetHeader>(
        `update team_memberships
         set active = false, ended_at = coalesce(ended_at, ?)
         where profile_id in (?) and ended_at is null`,
        [nowSql, oldUserIds],
      );
      membershipsEnded = membershipResult.affectedRows;

      const [mappingResult] = await connection.query<ResultSetHeader>(
        `update source_user_mappings
         set active = false,
             is_primary = false,
             active_mapping_key = null,
             primary_mapping_key = null,
             deactivated_by_id = null,
             deactivated_at = coalesce(deactivated_at, ?)
         where profile_id in (?) and active = true`,
        [nowSql, oldUserIds],
      );
      mappingsDeactivated = mappingResult.affectedRows;

      const [profileResult] = await connection.query<ResultSetHeader>(
        `update profiles
         set email = null,
             password_hash = null,
             encrypted_temporary_password = null,
             password_state = 'permanent',
             active = false,
             account_status = 'deleted',
             must_reset_password = false,
             last_login_at = null,
             access_revoked_at = coalesce(access_revoked_at, ?),
             deleted_at = coalesce(deleted_at, ?)
         where id in (?)`,
        [nowSql, nowSql, oldUserIds],
      );
      profilesScrubbed = profileResult.affectedRows;
    }

    await connection.query(
      `insert into profiles (
        id,
        email,
        name,
        shift,
        role,
        password_hash,
        password_state,
        encrypted_temporary_password,
        active,
        account_status,
        must_reset_password,
        password_changed_at
      ) values (?, ?, ?, null, 'admin', ?, 'temporary', ?, true, 'active', true, null)`,
      [
        adminId,
        ADMIN_EMAIL,
        ADMIN_NAME,
        passwordHash,
        encryptedTemporaryPassword,
      ],
    );

    await connection.query(
      `insert into audit_logs (
        id,
        actor_profile_id,
        action,
        entity_type,
        entity_id,
        metadata
      ) values (?, ?, 'local.users_reset', 'profile_batch', ?, cast(? as json))`,
      [
        newId(),
        adminId,
        adminId,
        JSON.stringify({
          oldProfileCount: oldUserIds.length,
          replacementAdmin: {
            id: adminId,
            email: ADMIN_EMAIL,
            name: ADMIN_NAME,
            role: "admin",
          },
          authRecordsDeleted: deleted,
          membershipsEnded,
          mappingsDeactivated,
          profilesScrubbed,
          resetAt: now.toISOString(),
        }),
      ],
    );

    await connection.commit();

    return {
      adminId,
      adminEmail: ADMIN_EMAIL,
      adminName: ADMIN_NAME,
      oldProfileCount: oldUserIds.length,
      deleted,
      membershipsEnded,
      mappingsDeactivated,
      profilesScrubbed,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function printSummary(input: {
  identity: DatabaseIdentity;
  backup: BackupStatus;
  before: Awaited<ReturnType<typeof collectCounts>>;
  breakdown: Awaited<ReturnType<typeof collectProfileBreakdown>>;
  execute: boolean;
}) {
  const { identity, backup, before, breakdown, execute } = input;
  const authDeleteCount =
    before.tableCounts.sessions +
    before.tableCounts.account_invitation_tokens +
    before.tableCounts.password_reset_tokens +
    before.tableCounts.email_delivery_attempts +
    before.tableCounts.user_permission_overrides +
    before.tableCounts.rate_limit_records;

  console.log(`Mode: ${execute ? "execute" : "dry-run"}`);
  console.log("Database: mysql");
  console.log(`Host: ${identity.url.hostname}:${identity.url.port || "3306"}`);
  console.log(`Database name: ${identity.maskedDatabaseName}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`Backup status: ${backup.ok ? "ok" : "not ok"} - ${backup.reason}`);
  if (backup.path) {
    console.log(`Backup path: ${backup.path}`);
    console.log(`Backup size: ${backup.bytes} bytes`);
  }
  console.log(`User table: profiles`);
  console.log(`Current total profile rows: ${before.tableCounts.profiles}`);
  console.log(`Current visible user rows: ${before.visibleUsers}`);
  console.log("Profile breakdown:");
  for (const item of breakdown) {
    console.log(
      `  ${item.status} ${item.role} active=${item.active}: ${item.count}`,
    );
  }
  console.log("Authentication/user-owned records that will be deleted:");
  console.log(`  sessions: ${before.tableCounts.sessions}`);
  console.log(
    `  account_invitation_tokens: ${before.tableCounts.account_invitation_tokens}`,
  );
  console.log(`  password_reset_tokens: ${before.tableCounts.password_reset_tokens}`);
  console.log(
    `  email_delivery_attempts: ${before.tableCounts.email_delivery_attempts}`,
  );
  console.log(
    `  user_permission_overrides: ${before.tableCounts.user_permission_overrides}`,
  );
  console.log(`  rate_limit_records: ${before.tableCounts.rate_limit_records}`);
  console.log(`  total auth/user-owned deletions: ${authDeleteCount}`);
  console.log("Profile-linked records that will be preserved but deactivated/scrubbed:");
  console.log(`  profiles marked deleted/auth-scrubbed: ${before.tableCounts.profiles}`);
  console.log(`  team_memberships preserved: ${before.tableCounts.team_memberships}`);
  console.log(`  source_user_mappings preserved: ${before.tableCounts.source_user_mappings}`);
  console.log("Business/shared records that will be preserved:");
  console.log(`  teams: ${before.tableCounts.teams}`);
  console.log(`  user_import_batches: ${before.tableCounts.user_import_batches}`);
  console.log(`  dialer_import_batches: ${before.tableCounts.dialer_import_batches}`);
  console.log(
    `  dialer_agent_hourly_metrics: ${before.tableCounts.dialer_agent_hourly_metrics}`,
  );
  console.log(`  dialer_import_rows: ${before.tableCounts.dialer_import_rows}`);
  console.log(`  audit_logs: ${before.tableCounts.audit_logs}`);
  console.log(`Replacement administrator: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);
  console.log(
    `Dry-run only: ${execute ? "no" : "yes; no database changes were made."}`,
  );
}

async function main() {
  const execute = hasArg(REQUIRED_EXECUTE_FLAG);
  if (execute && !hasArg(REQUIRED_CONFIRM_FLAG)) {
    throw new Error(
      `Execution requires ${REQUIRED_EXECUTE_FLAG} ${REQUIRED_CONFIRM_FLAG}.`,
    );
  }

  const identity = parseDatabaseUrl();
  assertSafeDevelopmentDatabase(identity);
  const backup = latestBackup(identity);
  if (execute && !backup.ok) {
    throw new Error(`Refusing execution because backup is not valid: ${backup.reason}`);
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const before = await collectCounts(connection);
    const breakdown = await collectProfileBreakdown(connection);
    printSummary({ identity, backup, before, breakdown, execute });

    if (!execute) return;

    const result = await executeReset(connection);
    const after = await collectCounts(connection);

    console.log("Execution complete.");
    console.log(`Old profile rows reset: ${result.oldProfileCount}`);
    console.log(`Profiles auth-scrubbed/marked deleted: ${result.profilesScrubbed}`);
    console.log(`Team memberships ended: ${result.membershipsEnded}`);
    console.log(`Source mappings deactivated: ${result.mappingsDeactivated}`);
    console.log(`Final total profile rows: ${after.tableCounts.profiles}`);
    console.log(`Final visible user rows: ${after.visibleUsers}`);
    console.log(`Replacement admin id: ${result.adminId}`);
    console.log(`Replacement admin email: ${result.adminEmail}`);
    console.log("The replacement admin must change the caller-supplied temporary password on first login.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
