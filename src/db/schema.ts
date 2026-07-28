import {
  bigint,
  boolean,
  date,
  datetime,
  foreignKey,
  index,
  int,
  json,
  longtext,
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
export const accountStatusEnum = mysqlEnum("account_status", [
  "invited",
  "active",
  "deactivated",
  "revoked",
  "deleted",
]);
export const passwordStateEnum = mysqlEnum("password_state", [
  "temporary",
  "permanent",
]);
export const invitationDeliveryStatusEnum = mysqlEnum(
  "invitation_delivery_status",
  ["pending", "accepted", "expired", "revoked", "delivery_failed"],
);
export const emailDeliveryStatusEnum = mysqlEnum("email_delivery_status", [
  "sent",
  "pending",
  "accepted",
  "delivered",
  "failed",
]);
export const membershipRoleEnum = mysqlEnum("membership_role", [
  "admin",
  "manager",
  "agent",
]);
export const importStatusEnum = mysqlEnum("import_status", [
  "uploaded",
  "processing",
  "draft",
  "validation_failed",
  "ready_to_publish",
  "active",
  "deactivated",
  "superseded",
  "rolled_back",
  "failed",
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
export const userImportStatusEnum = mysqlEnum("user_import_status", [
  "previewed",
  "processing",
  "confirmed",
]);
export const datasetVersionStatusEnum = mysqlEnum("dataset_version_status", [
  "draft",
  "active",
  "deactivated",
  "superseded",
  "rolled_back",
  "rejected",
]);
export const importMatchingStatusEnum = mysqlEnum("import_matching_status", [
  "mapped",
  "unmapped",
  "ambiguous",
  "out_of_scope",
  "invalid_mapping",
]);
export const importValidationStatusEnum = mysqlEnum(
  "import_validation_status",
  ["valid", "warning", "error"],
);

export const profiles = mysqlTable(
  "profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    role: roleEnum.notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    passwordState: passwordStateEnum.notNull().default("permanent"),
    encryptedTemporaryPassword: text("encrypted_temporary_password"),
    active: boolean("active").notNull().default(true),
    accountStatus: accountStatusEnum.notNull().default("invited"),
    mustResetPassword: boolean("must_reset_password").notNull().default(false),
    lastLoginAt: datetime("last_login_at"),
    passwordChangedAt: datetime("password_changed_at"),
    accessRevokedAt: datetime("access_revoked_at"),
    deletedAt: datetime("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("profiles_email_unique").on(table.email),
    index("profiles_name_idx").on(table.name),
    index("profiles_role_idx").on(table.role),
    index("profiles_account_status_idx").on(table.accountStatus),
    index("profiles_created_at_idx").on(table.createdAt),
    index("profiles_deleted_at_idx").on(table.deletedAt),
  ],
);

export const userImportBatches = mysqlTable(
  "user_import_batches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    status: userImportStatusEnum.notNull().default("previewed"),
    uploadedById: varchar("uploaded_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    rawFileContent: text("raw_file_content").notNull(),
    rowCount: int("row_count").notNull().default(0),
    expiresAt: datetime("expires_at").notNull(),
    confirmedAt: datetime("confirmed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_import_uploaded_by_idx").on(table.uploadedById),
    index("user_import_expires_at_idx").on(table.expiresAt),
    index("user_import_file_hash_idx").on(table.fileHash),
  ],
);

export const teams = mysqlTable(
  "teams",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    deactivatedAt: datetime("deactivated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("teams_name_unique").on(table.name),
    index("teams_active_idx").on(table.active),
  ],
);

export const teamMemberships = mysqlTable(
  "team_memberships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: membershipRoleEnum.notNull(),
    active: boolean("active").notNull().default(true),
    startedAt: datetime("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    endedAt: datetime("ended_at"),
    createdById: varchar("created_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("team_memberships_active_team_idx").on(table.teamId, table.endedAt),
    index("team_memberships_profile_idx").on(table.profileId),
    index("team_memberships_active_profile_idx").on(
      table.profileId,
      table.active,
      table.endedAt,
    ),
  ],
);

export const sourceUserMappings = mysqlTable(
  "source_user_mappings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceAgentName: varchar("source_agent_name", { length: 255 }).notNull(),
    normalizedAgentName: varchar("normalized_agent_name", { length: 255 }).notNull(),
    activeMappingKey: varchar("active_mapping_key", { length: 384 }),
    primaryMappingKey: varchar("primary_mapping_key", { length: 384 }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    isPrimary: boolean("is_primary").notNull().default(false),
    approvedById: varchar("approved_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    approvedAt: datetime("approved_at"),
    deactivatedById: varchar("deactivated_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    deactivatedAt: datetime("deactivated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("source_active_mapping_unique").on(table.activeMappingKey),
    unique("source_primary_mapping_unique").on(table.primaryMappingKey),
    index("source_user_mappings_profile_idx").on(table.profileId),
    index("source_user_mappings_normalized_idx").on(
      table.source,
      table.normalizedAgentName,
    ),
  ],
);

export const dialerImportBatches = mysqlTable(
  "dialer_import_batches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    importType: varchar("import_type", { length: 64 })
      .notNull()
      .default("agent_hours_performance"),
    dialerId: varchar("dialer_id", { length: 120 }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    fileSizeBytes: int("file_size_bytes").notNull().default(0),
    storageProvider: varchar("storage_provider", { length: 40 })
      .notNull()
      .default("database"),
    storageLocation: varchar("storage_location", { length: 512 }),
    status: importStatusEnum.notNull().default("uploaded"),
    uploadedById: varchar("uploaded_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    confirmedById: varchar("confirmed_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    rowCount: int("row_count").notNull().default(0),
    matchedAgentCount: int("matched_agent_count").notNull().default(0),
    unmatchedAgentCount: int("unmatched_agent_count").notNull().default(0),
    reportingStartDate: date("reporting_start_date", { mode: "string" }),
    reportingEndDate: date("reporting_end_date", { mode: "string" }),
    previewSummary: json("preview_summary").$type<Record<string, unknown>>(),
    validationErrors: json("validation_errors").$type<string[]>(),
    validationWarnings: json("validation_warnings").$type<string[]>(),
    validationNotices: json("validation_notices").$type<string[]>(),
    detectedHeaders: json("detected_headers").$type<string[]>(),
    missingRequiredHeaders: json("missing_required_headers").$type<string[]>(),
    rawFileContent: longtext("raw_file_content").notNull(),
    expiresAt: datetime("expires_at"),
    parsedAt: datetime("parsed_at"),
    publishedById: varchar("published_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    publishedAt: datetime("published_at"),
    previousImportId: varchar("previous_import_id", { length: 36 }),
    warningOverrideById: varchar("warning_override_by_id", {
      length: 36,
    }).references(() => profiles.id),
    warningOverrideReason: text("warning_override_reason"),
    warningOverrideAt: datetime("warning_override_at"),
    rejectedById: varchar("rejected_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    rejectedAt: datetime("rejected_at"),
    rejectionReason: text("rejection_reason"),
    rolledBackById: varchar("rolled_back_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    rolledBackAt: datetime("rolled_back_at"),
    rollbackReason: text("rollback_reason"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.previousImportId],
      foreignColumns: [table.id],
      name: "dialer_import_previous_import_fk",
    }).onDelete("set null"),
    index("dialer_import_file_hash_idx").on(
      table.source,
      table.importType,
      table.fileHash,
    ),
    index("dialer_import_status_idx").on(table.status),
    index("dialer_import_reporting_idx").on(
      table.source,
      table.importType,
      table.reportingStartDate,
      table.reportingEndDate,
    ),
    index("dialer_import_uploaded_by_idx").on(table.uploadedById),
    index("dialer_import_confirmed_by_idx").on(table.confirmedById),
    index("dialer_import_published_by_idx").on(table.publishedById),
    index("dialer_import_expires_at_idx").on(table.expiresAt),
  ],
);

export const dialerDatasetVersions = mysqlTable(
  "dialer_dataset_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    importBatchId: varchar("import_batch_id", { length: 36 }).references(
      () => dialerImportBatches.id,
      { onDelete: "restrict" },
    ),
    scopeKey: varchar("scope_key", { length: 512 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    importType: varchar("import_type", { length: 64 }).notNull(),
    reportingDate: date("reporting_date", { mode: "string" }).notNull(),
    teamId: varchar("team_id", { length: 36 }).references(() => teams.id),
    dialerId: varchar("dialer_id", { length: 120 }),
    versionNumber: int("version_number").notNull(),
    status: datasetVersionStatusEnum.notNull().default("draft"),
    previousVersionId: varchar("previous_version_id", { length: 36 }),
    rowCount: int("row_count").notNull().default(0),
    matchedAgentCount: int("matched_agent_count").notNull().default(0),
    unmatchedAgentCount: int("unmatched_agent_count").notNull().default(0),
    totalCalls: int("total_calls").notNull().default(0),
    totalLoggedInSeconds: int("total_logged_in_seconds").notNull().default(0),
    totalTalkSeconds: int("total_talk_seconds").notNull().default(0),
    totalWrapSeconds: int("total_wrap_seconds").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    activatedAt: datetime("activated_at"),
    supersededAt: datetime("superseded_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.previousVersionId],
      foreignColumns: [table.id],
      name: "dialer_dataset_previous_version_fk",
    }).onDelete("set null"),
    unique("dialer_dataset_scope_version_unique").on(
      table.scopeKey,
      table.versionNumber,
    ),
    unique("dialer_dataset_import_scope_unique").on(
      table.importBatchId,
      table.scopeKey,
    ),
    index("dialer_dataset_version_status_idx").on(table.status),
    index("dialer_dataset_version_scope_idx").on(
      table.source,
      table.importType,
      table.reportingDate,
      table.teamId,
      table.dialerId,
    ),
  ],
);

export const dialerDatasetScopes = mysqlTable(
  "dialer_dataset_scopes",
  {
    scopeKey: varchar("scope_key", { length: 512 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    importType: varchar("import_type", { length: 64 }).notNull(),
    reportingDate: date("reporting_date", { mode: "string" }).notNull(),
    teamId: varchar("team_id", { length: 36 }).references(() => teams.id),
    dialerId: varchar("dialer_id", { length: 120 }),
    activeVersionId: varchar("active_version_id", { length: 36 }).references(
      () => dialerDatasetVersions.id,
      { onDelete: "restrict" },
    ),
    revision: int("revision").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("dialer_dataset_scope_fields_unique").on(table.scopeKey),
    index("dialer_dataset_scope_active_idx").on(table.activeVersionId),
    index("dialer_dataset_scope_lookup_idx").on(
      table.source,
      table.importType,
      table.reportingDate,
      table.teamId,
      table.dialerId,
    ),
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
      .references(() => dialerImportBatches.id, { onDelete: "set null" }),
    versionId: varchar("version_id", { length: 36 }).references(
      () => dialerDatasetVersions.id,
      { onDelete: "restrict" },
    ),
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
    teamIdSnapshot: varchar("team_id_snapshot", { length: 36 }).references(
      () => teams.id,
    ),
    teamNameSnapshot: varchar("team_name_snapshot", { length: 255 }),
    rowHash: varchar("row_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("dialer_version_hourly_unique").on(
      table.versionId,
      table.agentProfileId,
      table.metricDate,
      table.metricHour,
    ),
    index("dialer_hourly_agent_date_idx").on(
      table.agentProfileId,
      table.metricDate,
    ),
    index("dialer_hourly_version_idx").on(table.versionId),
    index("dialer_hourly_batch_idx").on(table.batchId),
  ],
);

export const dialerImportRows = mysqlTable(
  "dialer_import_rows",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    batchId: varchar("batch_id", { length: 36 })
      .notNull()
      .references(() => dialerImportBatches.id, { onDelete: "cascade" }),
    versionId: varchar("version_id", { length: 36 }).references(
      () => dialerDatasetVersions.id,
      { onDelete: "set null" },
    ),
    rowNumber: int("row_number").notNull(),
    sourceAgentName: varchar("source_agent_name", { length: 255 }).notNull(),
    normalizedAgentName: varchar("normalized_agent_name", {
      length: 255,
    }).notNull(),
    matchedAgentProfileId: varchar("matched_agent_profile_id", {
      length: 36,
    }).references(() => profiles.id),
    metricDate: date("metric_date", { mode: "string" }),
    metricHour: int("metric_hour"),
    calls: int("calls"),
    loggedInSeconds: int("logged_in_seconds"),
    readySeconds: int("ready_seconds"),
    talkSeconds: int("talk_seconds"),
    ringingSeconds: int("ringing_seconds"),
    wrapSeconds: int("wrap_seconds"),
    pausedSeconds: int("paused_seconds"),
    idleSeconds: int("idle_seconds"),
    untrackedSeconds: int("untracked_seconds"),
    teamIdSnapshot: varchar("team_id_snapshot", { length: 36 }).references(
      () => teams.id,
    ),
    matchingStatus: importMatchingStatusEnum.notNull(),
    validationStatus: importValidationStatusEnum.notNull(),
    validationMessages: json("validation_messages").$type<string[]>(),
    warningMessages: json("warning_messages").$type<string[]>(),
    rowHash: varchar("row_hash", { length: 64 }),
    rawRow: json("raw_row").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("dialer_import_row_number_unique").on(table.batchId, table.rowNumber),
    index("dialer_import_row_batch_status_idx").on(
      table.batchId,
      table.validationStatus,
    ),
    index("dialer_import_row_agent_idx").on(table.matchedAgentProfileId),
    index("dialer_import_row_version_idx").on(table.versionId),
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
    revokedAt: datetime("revoked_at"),
    lastSeenAt: datetime("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("sessions_profile_idx").on(table.profileId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const accountInvitationTokens = mysqlTable(
  "account_invitation_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdById: varchar("created_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    deliveryStatus: invitationDeliveryStatusEnum
      .notNull()
      .default("pending"),
    expiresAt: datetime("expires_at").notNull(),
    usedAt: datetime("used_at"),
    revokedAt: datetime("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("account_invitation_token_hash_unique").on(table.tokenHash),
    index("account_invitation_profile_idx").on(table.profileId),
    index("account_invitation_expires_idx").on(table.expiresAt),
  ],
);

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdById: varchar("created_by_id", { length: 36 }).references(
      () => profiles.id,
    ),
    expiresAt: datetime("expires_at").notNull(),
    usedAt: datetime("used_at"),
    revokedAt: datetime("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("password_reset_token_hash_unique").on(table.tokenHash),
    index("password_reset_profile_idx").on(table.profileId),
    index("password_reset_expires_idx").on(table.expiresAt),
  ],
);

export const emailDeliveryAttempts = mysqlTable(
  "email_delivery_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "set null" },
    ),
    tokenId: varchar("token_id", { length: 36 }),
    messageType: varchar("message_type", { length: 80 }).notNull(),
    provider: varchar("provider", { length: 40 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
    status: emailDeliveryStatusEnum.notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    acceptedAt: datetime("accepted_at"),
    deliveredAt: datetime("delivered_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("email_delivery_profile_idx").on(table.profileId),
    index("email_delivery_token_idx").on(table.tokenId),
    index("email_delivery_status_idx").on(table.status),
    index("email_delivery_provider_message_idx").on(table.providerMessageId),
    index("email_delivery_message_idx").on(table.messageType, table.createdAt),
  ],
);

export const roles = mysqlTable("roles", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const permissions = mysqlTable("permissions", {
  key: varchar("permission_key", { length: 120 }).primaryKey(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: varchar("role_id", { length: 32 })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 120 })
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

export const userPermissionOverrides = mysqlTable(
  "user_permission_overrides",
  {
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 120 }).notNull(),
    allowed: boolean("allowed").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.permissionKey] }),
    foreignKey({
      columns: [table.permissionKey],
      foreignColumns: [permissions.key],
      name: "user_permission_override_permission_fk",
    }).onDelete("cascade"),
  ],
);

export const rateLimitRecords = mysqlTable(
  "rate_limit_records",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    identifierHash: varchar("identifier_hash", { length: 64 }).notNull(),
    windowStartedAt: datetime("window_started_at").notNull(),
    requestCount: int("request_count").notNull().default(1),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("rate_limit_window_unique").on(
      table.scope,
      table.identifierHash,
      table.windowStartedAt,
    ),
    index("rate_limit_expires_idx").on(table.expiresAt),
  ],
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
  invitationTokens: many(accountInvitationTokens),
  passwordResetTokens: many(passwordResetTokens),
}));
