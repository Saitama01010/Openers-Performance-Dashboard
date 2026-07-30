import "dotenv/config";
import mysql, { type ResultSetHeader } from "mysql2/promise";

type Role = "admin" | "manager" | "agent";

type ProfileRow = {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  account_status: string;
  active: number | boolean;
  created_at: Date;
  metric_rows: number;
  import_batch_refs: number;
};

type Candidate = ProfileRow & {
  patternKeys: string[];
  reasons: string[];
};

type ProtectedUser = ProfileRow & {
  protectionReasons: string[];
};

type RelatedCounts = {
  accountInvitationTokens: number;
  emailDeliveryAttempts: number;
  passwordResetTokens: number;
  sessions: number;
  sourceUserMappings: number;
  teamMemberships: number;
  userPermissionOverrides: number;
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SEED_ADMIN_IDS = new Set(["00000000-0000-4000-8000-000000000001"]);
const SEED_ADMIN_EMAILS = new Set(["admin@example.com"]);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const UUID8 = "[0-9a-f]{8}";

const TEST_DOMAINS = new Set([
  "dashboard-scope.example.test",
  "delete-agent.example.test",
  "delete.example.test",
  "example.test",
  "lifecycle-agent.example.test",
  "lifecycle.example.test",
  "updated.example.test",
]);

const FIXED_TEST_EMAILS = new Set([
  "after@example.test",
  "before@example.test",
  "bulk.one@example.test",
  "bulk.two@example.test",
  "first@example.test",
  "historical.agent@example.test",
  "second@example.test",
  "temporary.agent@example.test",
]);

const IMPORT_SERVICE_AGENT_NAMES =
  /^Agent (Daily Date Agent|Daily Version Agent|Mixed Granularity Agent|Draft Agent|Publish Agent|Supersede Agent|Rollback Agent|Restore Agent|Isolation A|Isolation B|Duplicate Agent|Duplicate Scope Agent|Manager Warning Agent|Authorization Agent|Blocking Agent|Warning Agent|Concurrency Agent|Transaction Failure Agent|Query Agent|Malformed Agent|Reject Agent)\b/;

function parseDatabaseUrl() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  try {
    return new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }
}

function databaseIdentity(url: URL) {
  return [
    url.protocol,
    url.hostname.toLowerCase(),
    url.port || "3306",
    url.pathname.replace(/^\/+/, "").toLowerCase(),
  ].join("|");
}

function assertLocalDevelopmentDatabase(url: URL) {
  const database = url.pathname.replace(/^\/+/, "").toLowerCase();

  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Refusing cleanup because DATABASE_URL is not local.");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing cleanup with NODE_ENV=production.");
  }

  if (/prod|production/i.test(database) || /prod|production/i.test(url.hostname)) {
    throw new Error("Refusing cleanup against a production-like database.");
  }

  if (process.env.TEST_DATABASE_URL) {
    const testUrl = new URL(process.env.TEST_DATABASE_URL);

    if (databaseIdentity(testUrl) === databaseIdentity(url)) {
      throw new Error("Refusing cleanup because DATABASE_URL equals TEST_DATABASE_URL.");
    }
  }
}

function splitEmail(email: string | null) {
  if (!email) return { local: "", domain: "" };
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  return { local, domain };
}

function addMatch(
  matches: Map<string, string>,
  key: string,
  reason: string,
) {
  matches.set(key, reason);
}

function exactFixtureMatches(row: ProfileRow) {
  const matches = new Map<string, string>();
  const { local, domain } = splitEmail(row.email);
  const email = row.email?.toLowerCase() ?? "";

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    new RegExp(`^Import (admin|manager|agent) ${UUID8}$`, "i").test(row.name)
  ) {
    addMatch(matches, "import-service-actor", "Import service actor helper name plus UUID email.");
  }

  if (
    domain === "example.test" &&
    /^import-admin-[0-9a-f-]{36}$/i.test(local) &&
    row.name === "Import Admin"
  ) {
    addMatch(matches, "user-import-admin", "User-import integration admin fixture.");
  }

  if (
    domain === "example.test" &&
    /^imported-[0-9a-f-]{36}$/i.test(local) &&
    row.name === "Imported User"
  ) {
    addMatch(matches, "user-import-created-user", "User-import integration created user fixture.");
  }

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    /^Provisioning (admin|manager|agent)$/.test(row.name)
  ) {
    addMatch(matches, "admin-provisioning-actor", "Admin provisioning actor fixture.");
  }

  if (FIXED_TEST_EMAILS.has(email)) {
    addMatch(matches, "fixed-admin-management-email", "Exact fixed integration-test email.");
  }

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    /^Admin Data [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "admin-data-profile", "Admin data integration profile fixture.");
  }

  if (
    domain === "updated.example.test" &&
    UUID_RE.test(local) &&
    /^Updated [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "admin-data-updated-profile", "Admin data updated profile fixture.");
  }

  if (
    domain === "dashboard-scope.example.test" &&
    UUID_RE.test(local) &&
    /^(Daily Dashboard Admin|Daily Dashboard Agent|Dashboard Admin|East Manager|East Agent|East No Data|West Agent|Comparison Admin|Comparison Agent)$/.test(
      row.name,
    )
  ) {
    addMatch(matches, "dashboard-scope-profile", "Dashboard integration scoped profile fixture.");
  }

  if (
    domain === "lifecycle.example.test" &&
    UUID_RE.test(local) &&
    /^Lifecycle (admin|manager)$/.test(row.name)
  ) {
    addMatch(matches, "active-lifecycle-actor", "Active lifecycle actor fixture.");
  }

  if (
    domain === "lifecycle-agent.example.test" &&
    UUID_RE.test(local) &&
    row.name === "Lifecycle Agent"
  ) {
    addMatch(matches, "active-lifecycle-agent", "Active lifecycle agent fixture.");
  }

  if (
    domain === "delete.example.test" &&
    UUID_RE.test(local) &&
    /^Delete (admin|manager|agent) [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "delete-service-actor", "Delete service actor fixture.");
  }

  if (
    domain === "delete-agent.example.test" &&
    UUID_RE.test(local) &&
    /^Deletion Agent [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "delete-service-agent", "Delete service agent fixture.");
  }

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    IMPORT_SERVICE_AGENT_NAMES.test(row.name)
  ) {
    addMatch(matches, "import-service-mapped-agent", "Import service mapped-agent fixture.");
  }

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    /^Lifecycle [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "auth-token-lifecycle-profile", "Auth token lifecycle profile fixture.");
  }

  if (
    domain === "example.test" &&
    UUID_RE.test(local) &&
    /^(admin|manager|agent) [0-9a-f]{8}$/i.test(row.name)
  ) {
    addMatch(matches, "inline-admin-management-profile", "Inline admin management profile fixture.");
  }

  return matches;
}

function uncertainReasons(row: ProfileRow) {
  const reasons: string[] = [];
  const { local, domain } = splitEmail(row.email);

  if (TEST_DOMAINS.has(domain) && UUID_RE.test(local)) {
    reasons.push("Synthetic-looking UUID email, but no exact repository fixture name matched.");
  }

  if (/Import admin|Agent Isolation|Transaction Failure Agent/i.test(row.name)) {
    reasons.push("Fixture-looking name, but exact email/name combination did not match active criteria.");
  }

  return reasons;
}

function maskEmail(email: string | null) {
  if (!email) return "(null)";
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 3)}***@${domain}`;
}

function formatDate(value: Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function loadProfiles(connection: mysql.Connection) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(`
    select
      p.id,
      p.email,
      p.name,
      p.role,
      p.account_status,
      p.active,
      p.created_at,
      (select count(*) from dialer_agent_hourly_metrics m where m.agent_profile_id = p.id) as metric_rows,
      (select count(*) from dialer_import_batches b where b.uploaded_by_id = p.id or b.confirmed_by_id = p.id or b.published_by_id = p.id or b.rejected_by_id = p.id or b.rolled_back_by_id = p.id) as import_batch_refs
    from profiles p
    where p.account_status <> 'deleted'
    order by p.created_at desc, p.id asc
  `);

  return rows as ProfileRow[];
}

function protectUsers(profiles: ProfileRow[], currentAdminId: string | null) {
  const protectedUsers: ProtectedUser[] = [];

  for (const profile of profiles) {
    const protectionReasons: string[] = [];
    const email = profile.email?.toLowerCase() ?? "";

    if (profile.role === "admin" && profile.account_status !== "deleted") {
      protectionReasons.push("active administrator");
    }

    if (SEED_ADMIN_IDS.has(profile.id) || SEED_ADMIN_EMAILS.has(email)) {
      protectionReasons.push("configured seed administrator");
    }

    if (currentAdminId && profile.id === currentAdminId) {
      protectionReasons.push("current administrator");
    }

    if (Number(profile.metric_rows) > 0) {
      protectionReasons.push("referenced by historical performance metrics");
    }

    if (protectionReasons.length > 0) {
      protectedUsers.push({ ...profile, protectionReasons });
    }
  }

  return protectedUsers;
}

function candidateUsers(profiles: ProfileRow[], protectedIds: Set<string>) {
  return profiles.flatMap((profile) => {
    if (protectedIds.has(profile.id)) return [];

    const matches = exactFixtureMatches(profile);
    if (matches.size === 0) return [];

    return [
      {
        ...profile,
        patternKeys: Array.from(matches.keys()),
        reasons: Array.from(matches.values()),
      },
    ];
  });
}

function uncertainUsers(
  profiles: ProfileRow[],
  candidates: Candidate[],
  protectedIds: Set<string>,
) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return profiles
    .filter((profile) => !candidateIds.has(profile.id) && !protectedIds.has(profile.id))
    .map((profile) => ({ ...profile, reasons: uncertainReasons(profile) }))
    .filter((profile) => profile.reasons.length > 0);
}

function groupCandidates(candidates: Candidate[]) {
  const groups = new Map<string, number>();

  for (const candidate of candidates) {
    for (const key of candidate.patternKeys) {
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  }

  return Array.from(groups.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

async function relatedCounts(
  connection: mysql.Connection,
  ids: string[],
): Promise<RelatedCounts> {
  if (ids.length === 0) {
    return {
      accountInvitationTokens: 0,
      emailDeliveryAttempts: 0,
      passwordResetTokens: 0,
      sessions: 0,
      sourceUserMappings: 0,
      teamMemberships: 0,
      userPermissionOverrides: 0,
    };
  }

  const count = async (sql: string, params: unknown[]) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(sql, params);
    return Number(rows[0]?.count ?? 0);
  };

  return {
    accountInvitationTokens: await count(
      "select count(*) as count from account_invitation_tokens where profile_id in (?) or created_by_id in (?)",
      [ids, ids],
    ),
    emailDeliveryAttempts: await count(
      "select count(*) as count from email_delivery_attempts where profile_id in (?)",
      [ids],
    ),
    passwordResetTokens: await count(
      "select count(*) as count from password_reset_tokens where profile_id in (?) or created_by_id in (?)",
      [ids, ids],
    ),
    sessions: await count(
      "select count(*) as count from sessions where profile_id in (?)",
      [ids],
    ),
    sourceUserMappings: await count(
      "select count(*) as count from source_user_mappings where profile_id in (?)",
      [ids],
    ),
    teamMemberships: await count(
      "select count(*) as count from team_memberships where profile_id in (?)",
      [ids],
    ),
    userPermissionOverrides: await count(
      "select count(*) as count from user_permission_overrides where profile_id in (?)",
      [ids],
    ),
  };
}

function printReport(input: {
  candidates: Candidate[];
  protectedUsers: ProtectedUser[];
  related: RelatedCounts;
  totalUsers: number;
  uncertain: Array<ProfileRow & { reasons: string[] }>;
  visibleUsers: number;
}) {
  console.log(`Total database users: ${input.totalUsers}`);
  console.log(`Visible/non-deleted users: ${input.visibleUsers}`);
  console.log(`Confirmed test-user candidates: ${input.candidates.length}`);
  console.log(`Protected users: ${input.protectedUsers.length}`);
  console.log(`Uncertain users: ${input.uncertain.length}`);

  console.log("Candidate counts by fixture pattern:");
  for (const [pattern, count] of groupCandidates(input.candidates)) {
    console.log(`  ${pattern}: ${count}`);
  }

  console.log("Related records targeted for cleanup:");
  for (const [key, value] of Object.entries(input.related)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log("Protected administrators:");
  for (const user of input.protectedUsers.filter((profile) => profile.role === "admin")) {
    console.log(
      `  ${user.id} | ${user.name} | ${maskEmail(user.email)} | ${user.protectionReasons.join("; ")}`,
    );
  }

  console.log("Candidate users:");
  for (const candidate of input.candidates) {
    console.log(
      [
        candidate.id,
        candidate.name,
        maskEmail(candidate.email),
        candidate.role,
        formatDate(candidate.created_at),
        `metricRows=${candidate.metric_rows}`,
        `importBatchRefs=${candidate.import_batch_refs}`,
        candidate.patternKeys.join(","),
        candidate.reasons.join("; "),
      ].join(" | "),
    );
  }

  if (input.uncertain.length > 0) {
    console.log("Uncertain users not selected for cleanup:");
    for (const user of input.uncertain) {
      console.log(
        [
          user.id,
          user.name,
          maskEmail(user.email),
          user.role,
          formatDate(user.created_at),
          user.reasons.join("; "),
        ].join(" | "),
      );
    }
  }
}

async function executeCleanup(connection: mysql.Connection, candidates: Candidate[]) {
  const ids = candidates.map((candidate) => candidate.id);
  const now = new Date();
  const counts = {
    accountInvitationTokens: 0,
    emailDeliveryAttempts: 0,
    passwordResetTokens: 0,
    sessions: 0,
    sourceUserMappingsUpdated: 0,
    teamMembershipsUpdated: 0,
    userPermissionOverrides: 0,
    usersScrubbed: 0,
  };

  await connection.beginTransaction();
  try {
    let result: ResultSetHeader;

    [result] = await connection.query<ResultSetHeader>(
      "delete from email_delivery_attempts where profile_id in (?)",
      [ids],
    );
    counts.emailDeliveryAttempts = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "delete from account_invitation_tokens where profile_id in (?) or created_by_id in (?)",
      [ids, ids],
    );
    counts.accountInvitationTokens = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "delete from password_reset_tokens where profile_id in (?) or created_by_id in (?)",
      [ids, ids],
    );
    counts.passwordResetTokens = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "delete from sessions where profile_id in (?)",
      [ids],
    );
    counts.sessions = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "delete from user_permission_overrides where profile_id in (?)",
      [ids],
    );
    counts.userPermissionOverrides = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "update team_memberships set active = false, ended_at = coalesce(ended_at, ?) where profile_id in (?) and ended_at is null",
      [now, ids],
    );
    counts.teamMembershipsUpdated = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
      "update source_user_mappings set active = false, is_primary = false, active_mapping_key = null, primary_mapping_key = null, deactivated_at = coalesce(deactivated_at, ?) where profile_id in (?) and active = true",
      [now, ids],
    );
    counts.sourceUserMappingsUpdated = result.affectedRows;

    [result] = await connection.query<ResultSetHeader>(
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
      [now, now, ids],
    );
    counts.usersScrubbed = result.affectedRows;

    await connection.commit();
    return counts;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function currentCounts(connection: mysql.Connection) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "select count(*) as total, sum(account_status <> 'deleted') as visible from profiles",
  );

  return {
    totalUsers: Number(rows[0]?.total ?? 0),
    visibleUsers: Number(rows[0]?.visible ?? 0),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const currentAdminArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--current-admin-id="));
  const currentAdminId = currentAdminArg?.split("=", 2)[1] ?? null;

  if (!args.has("--local-cleanup")) {
    throw new Error("Pass --local-cleanup to confirm this is an intentional local maintenance task.");
  }

  if (execute && !args.has("--confirm-local-only")) {
    throw new Error("Pass --confirm-local-only with --execute.");
  }

  if (execute && args.has("--dry-run")) {
    throw new Error("Use either --dry-run or --execute, not both.");
  }

  const databaseUrl = parseDatabaseUrl();
  assertLocalDevelopmentDatabase(databaseUrl);

  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const counts = await currentCounts(connection);
    const profiles = await loadProfiles(connection);
    const activeAdmins = profiles.filter(
      (profile) => profile.role === "admin" && profile.account_status !== "deleted",
    );

    if (activeAdmins.length === 0) {
      throw new Error("Refusing cleanup because no active administrator could be identified.");
    }

    if (activeAdmins.length > 1 && !currentAdminId) {
      throw new Error(
        "Multiple active administrators exist. Pass --current-admin-id=<id> to identify the signed-in administrator.",
      );
    }

    const inferredCurrentAdminId =
      currentAdminId ?? (activeAdmins.length === 1 ? activeAdmins[0].id : null);
    const protectedUsers = protectUsers(profiles, inferredCurrentAdminId);
    const protectedIds = new Set(protectedUsers.map((profile) => profile.id));
    const candidates = candidateUsers(profiles, protectedIds);
    const uncertain = uncertainUsers(profiles, candidates, protectedIds);
    const related = await relatedCounts(
      connection,
      candidates.map((candidate) => candidate.id),
    );

    if (candidates.some((candidate) => protectedIds.has(candidate.id))) {
      throw new Error("Refusing cleanup because a protected administrator matched cleanup criteria.");
    }

    printReport({
      candidates,
      protectedUsers,
      related,
      totalUsers: counts.totalUsers,
      uncertain,
      visibleUsers: counts.visibleUsers,
    });

    if (!execute) {
      console.log("Dry-run only. No database changes were made.");
      return;
    }

    if (uncertain.length > 0) {
      throw new Error("Refusing cleanup while uncertain fixture-like users remain.");
    }

    if (candidates.length === 0) {
      console.log("No matching test-generated users found.");
      return;
    }

    const deleted = await executeCleanup(connection, candidates);
    console.log(`Cleaned ${deleted.usersScrubbed} confirmed test-generated user profile(s).`);
    console.log(`Deleted dependent records: ${JSON.stringify(deleted)}`);
    console.log("Teams, audit logs, import batches, and performance metric rows were preserved.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
