import {
  bigint,
  boolean,
  date,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

export const roleEnum = mysqlEnum("role", ["admin", "manager", "agent"]);
export const membershipRoleEnum = mysqlEnum("membership_role", [
  "manager",
  "agent",
]);
export const importStatusEnum = mysqlEnum("import_status", [
  "previewed",
  "confirmed",
  "rejected",
]);
export const importRowStatusEnum = mysqlEnum("import_row_status", [
  "new",
  "changed",
  "unchanged",
  "invalid",
  "unknown",
  "out_of_scope",
]);

export const profiles = mysqlTable(
  "profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: roleEnum.notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [unique("profiles_email_unique").on(table.email)],
);

export const teams = mysqlTable(
  "teams",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [unique("teams_name_unique").on(table.name)],
);

export const teamMemberships = mysqlTable(
  "team_memberships",
  {
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: membershipRoleEnum.notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.profileId] }),
    index("team_memberships_profile_idx").on(table.profileId),
  ],
);

export const sourceUserMappings = mysqlTable(
  "source_user_mappings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceAgentName: varchar("source_agent_name", { length: 255 }).notNull(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("source_user_mapping_unique").on(
      table.source,
      table.sourceAgentName,
    ),
    index("source_user_mappings_profile_idx").on(table.profileId),
  ],
);

export const dialerImportBatches = mysqlTable(
  "dialer_import_batches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    status: importStatusEnum.notNull().default("previewed"),
    uploadedById: varchar("uploaded_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    rowCount: int("row_count").notNull().default(0),
    previewSummary: json("preview_summary").$type<Record<string, unknown>>(),
    detectedHeaders: json("detected_headers").$type<string[]>(),
    missingRequiredHeaders: json("missing_required_headers").$type<string[]>(),
    rawFileContent: text("raw_file_content").notNull(),
    expiresAt: datetime("expires_at").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("dialer_import_file_hash_idx").on(table.source, table.fileHash),
    index("dialer_import_uploaded_by_idx").on(table.uploadedById),
    index("dialer_import_expires_at_idx").on(table.expiresAt),
  ],
);

export const dialerAgentHourlyMetrics = mysqlTable(
  "dialer_agent_hourly_metrics",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceAgentName: varchar("source_agent_name", { length: 255 }).notNull(),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    batchId: varchar("batch_id", { length: 36 })
      .notNull()
      .references(() => dialerImportBatches.id),
    metricDate: date("metric_date", { mode: "string" }).notNull(),
    metricHour: int("metric_hour").notNull(),
    calls: int("calls").notNull().default(0),
    loggedInSeconds: int("logged_in_seconds").notNull().default(0),
    readySeconds: int("ready_seconds").notNull().default(0),
    talkSeconds: int("talk_seconds").notNull().default(0),
    ringingSeconds: int("ringing_seconds").notNull().default(0),
    wrapSeconds: int("wrap_seconds").notNull().default(0),
    pausedSeconds: int("paused_seconds").notNull().default(0),
    idleSeconds: int("idle_seconds").notNull().default(0),
    untrackedSeconds: int("untracked_seconds").notNull().default(0),
    rowHash: varchar("row_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("dialer_hourly_unique").on(
      table.source,
      table.agentProfileId,
      table.metricDate,
      table.metricHour,
    ),
    index("dialer_hourly_agent_date_idx").on(
      table.agentProfileId,
      table.metricDate,
    ),
  ],
);

export const importErrors = mysqlTable("import_errors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  batchId: varchar("batch_id", { length: 36 })
    .notNull()
    .references(() => dialerImportBatches.id, { onDelete: "cascade" }),
  rowNumber: int("row_number").notNull(),
  status: importRowStatusEnum.notNull(),
  message: text("message").notNull(),
  rawRow: json("raw_row").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    actorProfileId: varchar("actor_profile_id", { length: 36 }).references(
      () => profiles.id,
    ),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("audit_logs_actor_idx").on(table.actorProfileId)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("sessions_profile_idx").on(table.profileId)],
);

export const transfersFixtures = mysqlTable("transfer_fixtures", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  agentProfileId: varchar("agent_profile_id", { length: 36 }).references(
    () => profiles.id,
  ),
  occurredAt: timestamp("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  status: varchar("status", { length: 64 }).notNull(),
});

export const profileRelations = relations(profiles, ({ many }) => ({
  memberships: many(teamMemberships),
  sourceMappings: many(sourceUserMappings),
  sessions: many(sessions),
}));
