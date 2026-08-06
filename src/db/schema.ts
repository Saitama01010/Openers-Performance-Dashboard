import {
  bigint,
  boolean,
  date,
  decimal,
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
import { DEFAULT_ORGANIZATION_ID } from "@/tenancy/constants";

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
export const metricGranularityEnum = mysqlEnum("metric_granularity", [
  "hourly",
  "daily",
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
export const coachingCategoryEnum = mysqlEnum("category", [
  "performance",
  "adherence",
  "improvement",
]);
export const employmentStatusEnum = mysqlEnum("employment_status", [
  "active",
  "deactivated",
  "terminated",
]);
export const performanceTargetMetricEnum = mysqlEnum("performance_target_metric", [
  "transfers",
  "closed_deals",
  "conversion",
]);
export const coachingReportStatusEnum = mysqlEnum("coaching_report_status", [
  "draft",
  "finalized",
  "published",
  "acknowledged",
]);
export const shadowingStatusEnum = mysqlEnum("shadowing_status", [
  "scheduled",
  "completed",
  "cancelled",
]);
export const manualFlagSeverityEnum = mysqlEnum("manual_flag_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const manualFlagStatusEnum = mysqlEnum("manual_flag_status", [
  "open",
  "under_review",
  "action_required",
  "coaching_scheduled",
  "resolved",
  "dismissed",
]);
export const teamTransferRequestStatusEnum = mysqlEnum(
  "team_transfer_request_status",
  ["draft", "submitted", "approved", "rejected", "applied", "cancelled"],
);

export const organizations = mysqlTable("organizations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const profiles = mysqlTable(
  "profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .default(DEFAULT_ORGANIZATION_ID)
      .references(() => organizations.id),
    email: varchar("email", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    shift: varchar("shift", { length: 80 }),
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
    employmentStartDate: date("employment_start_date", { mode: "string" }),
    employmentEndDate: date("employment_end_date", { mode: "string" }),
    employmentStatus: employmentStatusEnum.notNull().default("active"),
    deletedAt: datetime("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("profiles_email_unique").on(table.email),
    index("profiles_name_idx").on(table.name),
    index("profiles_organization_idx").on(table.organizationId),
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
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .default(DEFAULT_ORGANIZATION_ID)
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    deactivatedAt: datetime("deactivated_at"),
    archivedAt: datetime("archived_at"),
    deletedAt: datetime("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("teams_organization_name_unique").on(
      table.organizationId,
      table.name,
    ),
    index("teams_visibility_idx").on(
      table.organizationId,
      table.active,
      table.archivedAt,
      table.deletedAt,
    ),
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
    granularity: metricGranularityEnum.notNull().default("hourly"),
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
    selectedReportingDate: date("selected_reporting_date", {
      mode: "string",
    }),
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
    // Database-only compatibility columns retained so existing migration
    // history does not generate a destructive follow-up migration.
    legacyWarningReviewerId: varchar(
      ["warning", "override", "by", "id"].join("_"),
      { length: 36 },
    ).references(() => profiles.id),
    legacyWarningReviewNote: text(
      ["warning", "override", "reason"].join("_"),
    ),
    legacyWarningReviewedAt: datetime(
      ["warning", "override", "at"].join("_"),
    ),
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
    granularity: metricGranularityEnum.notNull().default("hourly"),
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
    granularity: metricGranularityEnum.notNull().default("hourly"),
    metricDate: date("metric_date", { mode: "string" }).notNull(),
    metricHour: int("metric_hour"),
    metricKey: varchar("metric_key", { length: 24 }).notNull(),
    calls: int("calls").notNull().default(0),
    loggedInSeconds: int("logged_in_seconds").notNull().default(0),
    readySeconds: int("ready_seconds").notNull().default(0),
    talkSeconds: int("talk_seconds").notNull().default(0),
    ringingSeconds: int("ringing_seconds"),
    wrapSeconds: int("wrap_seconds").notNull().default(0),
    pausedSeconds: int("paused_seconds").notNull().default(0),
    systemPauseSeconds: int("system_pause_seconds"),
    netSeconds: int("net_seconds"),
    idleSeconds: int("idle_seconds"),
    untrackedSeconds: int("untracked_seconds"),
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
    unique("dialer_version_metric_key_unique").on(
      table.versionId,
      table.agentProfileId,
      table.metricDate,
      table.metricKey,
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
    granularity: metricGranularityEnum.notNull().default("hourly"),
    metricDate: date("metric_date", { mode: "string" }),
    metricHour: int("metric_hour"),
    calls: int("calls"),
    loggedInSeconds: int("logged_in_seconds"),
    readySeconds: int("ready_seconds"),
    talkSeconds: int("talk_seconds"),
    ringingSeconds: int("ringing_seconds"),
    wrapSeconds: int("wrap_seconds"),
    pausedSeconds: int("paused_seconds"),
    systemPauseSeconds: int("system_pause_seconds"),
    netSeconds: int("net_seconds"),
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

export const coachingSessions = mysqlTable(
  "coaching_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    createdByProfileId: varchar("created_by_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    coachProfileId: varchar("coach_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    category: coachingCategoryEnum.notNull(),
    note: varchar("note", { length: 2000 }),
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("coaching_sessions_organization_date_idx").on(
      table.organizationId,
      table.sessionDate,
    ),
    index("coaching_sessions_coach_date_idx").on(
      table.coachProfileId,
      table.sessionDate,
    ),
    index("coaching_sessions_creator_date_idx").on(
      table.createdByProfileId,
      table.sessionDate,
    ),
  ],
);

export const coachingSessionParticipants = mysqlTable(
  "coaching_session_participants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => coachingSessions.id, { onDelete: "cascade" }),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id),
    teamIdSnapshot: varchar("team_id_snapshot", { length: 36 }).references(
      () => teams.id,
    ),
    teamNameSnapshot: varchar("team_name_snapshot", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("coaching_participant_session_agent_unique").on(
      table.sessionId,
      table.agentProfileId,
    ),
    index("coaching_participant_agent_idx").on(table.agentProfileId),
    index("coaching_participant_team_idx").on(table.teamIdSnapshot),
  ],
);

export const employmentStatusEvents = mysqlTable(
  "employment_status_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    status: employmentStatusEnum.notNull(),
    effectiveAt: datetime("effective_at").notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("employment_events_profile_effective_idx").on(
      table.profileId,
      table.effectiveAt,
    ),
    index("employment_events_organization_idx").on(table.organizationId),
  ],
);

export const performanceTargets = mysqlTable(
  "performance_targets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    teamId: varchar("team_id", { length: 36 }).references(() => teams.id, {
      onDelete: "restrict",
    }),
    metric: performanceTargetMetricEnum.notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("performance_targets_resolution_idx").on(
      table.organizationId,
      table.teamId,
      table.metric,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const tenureThresholds = mysqlTable(
  "tenure_thresholds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    teamId: varchar("team_id", { length: 36 }).references(() => teams.id, {
      onDelete: "restrict",
    }),
    bandLabel: varchar("band_label", { length: 120 }).notNull(),
    minimumDays: int("minimum_days").notNull(),
    maximumDays: int("maximum_days"),
    isRamp: boolean("is_ramp").notNull().default(false),
    minimumTransfers: decimal("minimum_transfers", { precision: 12, scale: 2 }),
    minimumClosedDeals: decimal("minimum_closed_deals", {
      precision: 12,
      scale: 2,
    }),
    minimumConversion: decimal("minimum_conversion", { precision: 7, scale: 2 }),
    minimumShiftCoverage: decimal("minimum_shift_coverage", {
      precision: 7,
      scale: 2,
    }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("tenure_thresholds_resolution_idx").on(
      table.organizationId,
      table.teamId,
      table.effectiveFrom,
      table.effectiveTo,
      table.minimumDays,
    ),
  ],
);

export const coachingRubricTemplates = mysqlTable(
  "coaching_rubric_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: int("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    sections: json("sections")
      .$type<
        Array<{
          id: string;
          label: string;
          criteria: Array<{
            id: string;
            label: string;
            description?: string;
            maximumScore: number;
            required: boolean;
          }>;
        }>
      >()
      .notNull(),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("coaching_rubric_template_version_unique").on(
      table.organizationId,
      table.name,
      table.version,
    ),
    index("coaching_rubric_template_active_idx").on(
      table.organizationId,
      table.active,
    ),
  ],
);

export const coachingReports = mysqlTable(
  "coaching_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    coachingSessionId: varchar("coaching_session_id", { length: 36 })
      .notNull()
      .references(() => coachingSessions.id, { onDelete: "restrict" }),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    coachProfileId: varchar("coach_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    templateId: varchar("template_id", { length: 36 })
      .notNull()
      .references(() => coachingRubricTemplates.id, { onDelete: "restrict" }),
    templateVersion: int("template_version").notNull(),
    criterionScores: json("criterion_scores")
      .$type<Array<{ criterionId: string; score: number; note?: string }>>()
      .notNull(),
    strengths: text("strengths"),
    improvementAreas: text("improvement_areas"),
    actionItems: json("action_items").$type<string[]>(),
    followUpDate: date("follow_up_date", { mode: "string" }),
    overallScore: decimal("overall_score", { precision: 7, scale: 2 }).notNull(),
    status: coachingReportStatusEnum.notNull().default("draft"),
    revision: int("revision").notNull().default(1),
    finalizedById: varchar("finalized_by_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "restrict" },
    ),
    finalizedAt: datetime("finalized_at"),
    publishedById: varchar("published_by_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "restrict" },
    ),
    publishedAt: datetime("published_at"),
    acknowledgedAt: datetime("acknowledged_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("coaching_report_session_agent_unique").on(
      table.coachingSessionId,
      table.agentProfileId,
    ),
    index("coaching_report_agent_status_idx").on(
      table.agentProfileId,
      table.status,
      table.publishedAt,
    ),
    index("coaching_report_organization_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const coachingReportRevisions = mysqlTable(
  "coaching_report_revisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    reportId: varchar("report_id", { length: 36 })
      .notNull()
      .references(() => coachingReports.id, { onDelete: "restrict" }),
    revision: int("revision").notNull(),
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("coaching_report_revision_unique").on(table.reportId, table.revision),
  ],
);

export const shadowingSessions = mysqlTable(
  "shadowing_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    teamIdSnapshot: varchar("team_id_snapshot", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    assignedLeaderId: varchar("assigned_leader_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    completedAt: datetime("completed_at"),
    status: shadowingStatusEnum.notNull().default("scheduled"),
    objective: text("objective").notNull(),
    internalNotes: text("internal_notes"),
    publishedOutcome: text("published_outcome"),
    followUpAction: text("follow_up_action"),
    publishedToAgent: boolean("published_to_agent").notNull().default(false),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("shadowing_agent_status_idx").on(
      table.agentProfileId,
      table.status,
      table.scheduledDate,
    ),
    index("shadowing_team_status_idx").on(
      table.teamIdSnapshot,
      table.status,
      table.scheduledDate,
    ),
  ],
);

export const manualFlagCases = mysqlTable(
  "manual_flag_cases",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    teamIdSnapshot: varchar("team_id_snapshot", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    raisedById: varchar("raised_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    assignedOwnerId: varchar("assigned_owner_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "restrict" },
    ),
    category: varchar("category", { length: 120 }).notNull(),
    severity: manualFlagSeverityEnum.notNull(),
    reason: text("reason").notNull(),
    internalNotes: text("internal_notes"),
    status: manualFlagStatusEnum.notNull().default("open"),
    relatedCoachingSessionId: varchar("related_coaching_session_id", {
      length: 36,
    }),
    actionDueDate: date("action_due_date", { mode: "string" }),
    requiredAction: text("required_action"),
    resolution: text("resolution"),
    publishedToAgent: boolean("published_to_agent").notNull().default(false),
    resolvedById: varchar("resolved_by_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "restrict" },
    ),
    resolvedAt: datetime("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.relatedCoachingSessionId],
      foreignColumns: [coachingSessions.id],
      name: "manual_flag_related_session_fk",
    }).onDelete("set null"),
    index("manual_flag_agent_status_idx").on(
      table.agentProfileId,
      table.status,
      table.createdAt,
    ),
    index("manual_flag_team_status_idx").on(
      table.teamIdSnapshot,
      table.status,
    ),
    index("manual_flag_owner_status_idx").on(
      table.assignedOwnerId,
      table.status,
    ),
  ],
);

export const manualFlagCaseEvents = mysqlTable(
  "manual_flag_case_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => manualFlagCases.id, { onDelete: "restrict" }),
    actorProfileId: varchar("actor_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("manual_flag_event_case_idx").on(table.caseId, table.createdAt)],
);

export const teamTransferRequests = mysqlTable(
  "team_transfer_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organizations.id),
    agentProfileId: varchar("agent_profile_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    sourceTeamId: varchar("source_team_id", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    destinationTeamId: varchar("destination_team_id", { length: 36 })
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    requestedById: varchar("requested_by_id", { length: 36 })
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    requestedAt: datetime("requested_at").notNull(),
    status: teamTransferRequestStatusEnum.notNull().default("draft"),
    reviewedById: varchar("reviewed_by_id", { length: 36 }).references(
      () => profiles.id,
      { onDelete: "restrict" },
    ),
    reviewNote: text("review_note"),
    reviewedAt: datetime("reviewed_at"),
    appliedAt: datetime("applied_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("team_transfer_agent_status_idx").on(
      table.agentProfileId,
      table.status,
    ),
    index("team_transfer_source_status_idx").on(table.sourceTeamId, table.status),
    index("team_transfer_destination_status_idx").on(
      table.destinationTeamId,
      table.status,
    ),
    index("team_transfer_organization_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

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
  coachingSessionsCreated: many(coachingSessions, {
    relationName: "coachingSessionCreator",
  }),
  coachingSessionsCoached: many(coachingSessions, {
    relationName: "coachingSessionCoach",
  }),
  coachingParticipations: many(coachingSessionParticipants),
  invitationTokens: many(accountInvitationTokens),
  passwordResetTokens: many(passwordResetTokens),
}));

export const coachingSessionRelations = relations(
  coachingSessions,
  ({ many, one }) => ({
    creator: one(profiles, {
      fields: [coachingSessions.createdByProfileId],
      references: [profiles.id],
      relationName: "coachingSessionCreator",
    }),
    coach: one(profiles, {
      fields: [coachingSessions.coachProfileId],
      references: [profiles.id],
      relationName: "coachingSessionCoach",
    }),
    participants: many(coachingSessionParticipants),
  }),
);

export const coachingSessionParticipantRelations = relations(
  coachingSessionParticipants,
  ({ one }) => ({
    session: one(coachingSessions, {
      fields: [coachingSessionParticipants.sessionId],
      references: [coachingSessions.id],
    }),
    agent: one(profiles, {
      fields: [coachingSessionParticipants.agentProfileId],
      references: [profiles.id],
    }),
  }),
);
