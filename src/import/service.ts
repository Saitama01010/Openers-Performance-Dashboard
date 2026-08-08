import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertPermission } from "@/auth/permissions";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  importErrors,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { listActiveDialerMetrics } from "@/import/active-data";
import {
  DIALER_IMPORT_TYPE,
  DIALER_STORAGE_PROVIDER,
  IMPORT_INSERT_CHUNK_SIZE,
  IMPORT_REASON_MIN_LENGTH,
  MAX_DIALER_CSV_BYTES,
} from "@/import/config";
import {
  getImportDeletionAssessments,
  type ImportDeletionAssessment,
} from "@/import/delete-service";
import {
  normalizeAgentName,
  parseDialerDate,
  inspectDialerCsvFormat,
  previewDialerCsv,
  sha256,
  type ImportGranularity,
  type ImportPreview,
  type SourceMapping,
} from "@/import/dialer";
import {
  datasetScopeKey,
  scopeForMetric,
  totalsForMetrics,
  type ComparableMetric,
  type DatasetScope,
  type ImportComparison,
} from "@/import/versioning";
import {
  validateImport,
  type DuplicateImportReference,
  type ImportValidationResult,
} from "@/import/validation";
import { newId } from "@/lib/ids";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type StoredImportPreview = {
  batchId: string;
  fileName: string;
  createdAt: Date;
  preview: ImportPreview;
  validation: ImportValidationResult;
  status:
    | "draft"
    | "validation_failed"
    | "ready_to_publish";
};

export type ImportHistoryRow = {
  id: string;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  importType: string;
  granularity: ImportGranularity;
  source: string;
  reportingStartDate: string | null;
  reportingEndDate: string | null;
  selectedReportingDate: string | null;
  uploadedBy: string;
  uploadedAt: Date;
  rowCount: number;
  matchedAgentCount: number;
  unmatchedAgentCount: number;
  mappedRowCount: number | null;
  unmatchedRowCount: number | null;
  unauthorizedRowCount: number | null;
  invalidRowCount: number | null;
  unchangedRowCount: number | null;
  duplicateFile: boolean | null;
  status: string;
  publishedAt: Date | null;
  activeVersionCount: number;
  rollbackStatus: string | null;
  teams: string[];
  dialerId: string | null;
  deletion: ImportDeletionAssessment;
};

export type ImportHistoryFilters = {
  search?: string;
  status?: string;
  importType?: string;
  uploadedById?: string;
  dateRange?: "7d" | "30d" | "90d" | "year" | "all";
  sort?: "uploadedAt" | "fileName" | "reportingPeriod" | "status";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ImportHistorySummary = {
  total: number;
  active: number;
  published: number;
  failed: number;
  drafts: number;
  earliestImportAt: Date | null;
  latestImportAt: Date | null;
  activeImports: Array<{
    id: string;
    fileName: string;
    reportingStartDate: string | null;
    reportingEndDate: string | null;
    publishedAt: Date | null;
    uploadedBy: string;
  }>;
  mostRecentFailure: { fileName: string; uploadedAt: Date } | null;
  oldestDraft: { fileName: string; uploadedAt: Date } | null;
  newestDraft: { fileName: string; uploadedAt: Date } | null;
};

export type ImportHistoryFacets = {
  statuses: string[];
  importTypes: string[];
  uploaders: Array<{ id: string; name: string }>;
};

export class ImportConfirmationError extends Error {
  constructor(
    message: string,
    public readonly code = "confirm_failed",
  ) {
    super(message);
    this.name = "ImportConfirmationError";
  }
}

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

type DraftScopeGroup = {
  scope: DatasetScope;
  scopeKey: string;
  rows: ImportPreview["rows"];
};

const REPROCESSABLE_STATUSES = [
  "draft",
  "validation_failed",
  "ready_to_publish",
] as const;

function assertCanAccessBatch(
  actor: Actor,
  batch: { uploadedById: string },
) {
  if (actor.role === "agent") {
    throw new ImportConfirmationError("Agents cannot access imports.", "forbidden");
  }

  if (actor.role !== "admin" && batch.uploadedById !== actor.id) {
    throw new ImportConfirmationError(
      "Import batch does not belong to this uploader.",
      "forbidden",
    );
  }
}

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") {
    throw new ImportConfirmationError(
      "Administrator access is required.",
      "forbidden",
    );
  }
}

function validateReason(reasonInput: string | undefined, label: string) {
  const reason = (reasonInput ?? "").trim();

  if (reason.length < IMPORT_REASON_MIN_LENGTH) {
    throw new ImportConfirmationError(
      `${label} must be at least ${IMPORT_REASON_MIN_LENGTH} characters.`,
      "reason_required",
    );
  }

  return reason;
}

function selectedReportingDateFromBatch(batch: {
  selectedReportingDate?: string | null;
  previewSummary: Record<string, unknown> | null;
}) {
  if (batch.selectedReportingDate) {
    return String(batch.selectedReportingDate);
  }

  const value = batch.previewSummary?.selectedReportingDate;
  return typeof value === "string" ? value : null;
}

async function getMappings(source: string, actor: Actor) {
  const rows = await getDb()
    .select({
      sourceAgentName: sourceUserMappings.sourceAgentName,
      profileId: sourceUserMappings.profileId,
      profileName: profiles.name,
      accountStatus: profiles.accountStatus,
      teamId: teamMemberships.teamId,
      teamName: teams.name,
    })
    .from(sourceUserMappings)
    .innerJoin(profiles, eq(profiles.id, sourceUserMappings.profileId))
    .innerJoin(
      teamMemberships,
      eq(teamMemberships.profileId, sourceUserMappings.profileId),
    )
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(sourceUserMappings.source, source),
        eq(sourceUserMappings.active, true),
        isNull(teamMemberships.endedAt),
        activeProfileWhere(actorOrganizationId(actor)),
        visibleTeamWhere(actor),
      ),
    );
  const mappingByAgent = new Map<string, SourceMapping>();

  for (const mapping of rows) {
    const key = `${normalizeAgentName(mapping.sourceAgentName)}:${mapping.profileId}`;
    const current: SourceMapping = mappingByAgent.get(key) ?? {
      sourceAgentName: mapping.sourceAgentName,
      profileId: mapping.profileId,
      profileName: mapping.profileName,
      accountStatus: mapping.accountStatus,
      teamIds: [],
      teamNames: [],
    };
    current.teamIds.push(mapping.teamId);
    current.teamNames.push(mapping.teamName);
    mappingByAgent.set(key, current);
  }

  return Array.from(mappingByAgent.values());
}

async function resolveParsingActor(
  viewer: Actor,
  batch: { uploadedById: string },
) {
  if (viewer.id === batch.uploadedById) {
    return viewer;
  }

  const [uploader] = await getDb()
    .select({
      id: profiles.id,
      role: profiles.role,
      organizationId: profiles.organizationId,
    })
    .from(profiles)
    .where(eq(profiles.id, batch.uploadedById))
    .limit(1);

  if (!uploader) {
    throw new ImportConfirmationError(
      "The original uploader is unavailable.",
      "invalid_uploader",
    );
  }

  const memberships = await getDb()
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(teamMemberships.profileId, uploader.id),
        isNull(teamMemberships.endedAt),
        eq(teams.active, true),
        eq(teams.organizationId, uploader.organizationId),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
      ),
    );

  return {
    id: uploader.id,
    role: uploader.role,
    teamIds: memberships.map((membership) => membership.teamId),
    organizationId: uploader.organizationId,
  } satisfies Actor;
}

async function getDuplicateImports(input: {
  batchId: string;
  source: string;
  importType: string;
  fileHash: string;
}) {
  const rows = await getDb()
    .select({
      id: dialerImportBatches.id,
      fileName: dialerImportBatches.fileName,
      status: dialerImportBatches.status,
      uploadedAt: dialerImportBatches.createdAt,
      previewSummary: dialerImportBatches.previewSummary,
    })
    .from(dialerImportBatches)
    .where(
      and(
        ne(dialerImportBatches.id, input.batchId),
        eq(dialerImportBatches.source, input.source),
        eq(dialerImportBatches.importType, input.importType),
        eq(dialerImportBatches.fileHash, input.fileHash),
      ),
    )
    .orderBy(desc(dialerImportBatches.createdAt));

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    status: row.status,
    uploadedAt: row.uploadedAt,
    scopeKeys: Array.isArray(row.previewSummary?.scopeKeys)
      ? row.previewSummary.scopeKeys.filter(
          (scopeKey): scopeKey is string => typeof scopeKey === "string",
        )
      : [],
  })) satisfies DuplicateImportReference[];
}

function duplicateMatchesScopes(
  duplicate: DuplicateImportReference,
  currentScopeKeys: string[],
) {
  const duplicateScopeKeys = duplicate.scopeKeys ?? [];

  // An upload that is still parsing has no scope metadata yet. Keep it as a
  // conservative duplicate candidate so concurrent identical uploads cannot
  // both publish without acknowledgement.
  if (duplicateScopeKeys.length === 0) {
    return true;
  }

  if (duplicateScopeKeys.length !== currentScopeKeys.length) {
    return false;
  }

  const currentScopes = new Set(currentScopeKeys);
  return duplicateScopeKeys.every((scopeKey) => currentScopes.has(scopeKey));
}

function previewSummary(input: {
  preview: ImportPreview;
  validation: ImportValidationResult;
  selectedReportingDate: string | null;
  duplicateImports: DuplicateImportReference[];
  scopeKeys: string[];
}) {
  return {
    ...input.preview.fileSummary,
    comparison: input.validation.comparison,
    duplicateRowNumbers: input.validation.duplicateRowNumbers,
    duplicateAgents: input.validation.duplicateAgents,
    emptyRowCount: input.validation.emptyRowCount,
    selectedReportingDate: input.selectedReportingDate,
    scopeKeys: input.scopeKeys,
    duplicateImports: input.duplicateImports.map((duplicate) => ({
      ...duplicate,
      uploadedAt: duplicate.uploadedAt.toISOString(),
    })),
  };
}

function groupDraftScopes(
  preview: ImportPreview,
  importType: string,
  dialerId: string | null,
) {
  const groups = new Map<string, DraftScopeGroup>();

  for (const row of preview.rows) {
    if (!row.metric) {
      continue;
    }

    const scope = scopeForMetric(row.metric, importType, dialerId);
    const key = datasetScopeKey(scope);
    const group = groups.get(key) ?? {
      scope,
      scopeKey: key,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.scopeKey.localeCompare(right.scopeKey),
  );
}

function rowMatchingStatus(
  preview: ImportPreview,
  agentKey: string,
): "mapped" | "unmapped" | "out_of_scope" | "invalid_mapping" {
  return (
    preview.agents.find((agent) => agent.agentKey === agentKey)?.mappingStatus ??
    "unmapped"
  );
}

async function insertInChunks<T>(
  values: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let index = 0; index < values.length; index += IMPORT_INSERT_CHUNK_SIZE) {
    await insert(values.slice(index, index + IMPORT_INSERT_CHUNK_SIZE));
  }
}

async function persistProcessedBatch(input: {
  actor: Actor;
  batchId: string;
  fileName: string;
  importType: string;
  dialerId: string | null;
  selectedReportingDate: string | null;
  preview: ImportPreview;
  validation: ImportValidationResult;
  duplicateImports: DuplicateImportReference[];
  groups: DraftScopeGroup[];
  revalidation: boolean;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [lockedBatch] = await tx
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.batchId))
      .limit(1)
      .for("update");

    if (!lockedBatch) {
      throw new ImportConfirmationError("Import batch was not found.");
    }

    assertCanAccessBatch(input.actor, lockedBatch);

    if (
      ![...REPROCESSABLE_STATUSES, "processing", "uploaded"].includes(
        lockedBatch.status as (typeof REPROCESSABLE_STATUSES)[number] | "processing" | "uploaded",
      )
    ) {
      throw new ImportConfirmationError(
        "Only unpublished imports can be revalidated.",
        "invalid_status",
      );
    }

    await tx
      .delete(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.batchId, input.batchId));
    await tx
      .delete(dialerImportRows)
      .where(eq(dialerImportRows.batchId, input.batchId));
    await tx.delete(importErrors).where(eq(importErrors.batchId, input.batchId));
    await tx
      .delete(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, input.batchId));

    if (input.groups.length > 0) {
      await tx
        .insert(dialerDatasetScopes)
        .values(
          input.groups.map((group) => ({
            scopeKey: group.scopeKey,
            source: group.scope.source,
            importType: group.scope.importType,
            reportingDate: group.scope.reportingDate,
            teamId: group.scope.teamId,
            dialerId: group.scope.dialerId,
          })),
        )
        .onDuplicateKeyUpdate({
          set: {
            revision: sql`${dialerDatasetScopes.revision}`,
          },
        });
    }

    const scopeKeys = input.groups.map((group) => group.scopeKey);
    const lockedScopes =
      scopeKeys.length > 0
        ? await tx
            .select()
            .from(dialerDatasetScopes)
            .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
            .orderBy(asc(dialerDatasetScopes.scopeKey))
            .for("update")
        : [];
    const existingVersions =
      scopeKeys.length > 0
        ? await tx
            .select({
              scopeKey: dialerDatasetVersions.scopeKey,
              versionNumber: dialerDatasetVersions.versionNumber,
              importBatchId: dialerDatasetVersions.importBatchId,
              id: dialerDatasetVersions.id,
            })
            .from(dialerDatasetVersions)
            .where(inArray(dialerDatasetVersions.scopeKey, scopeKeys))
        : [];
    const versionIdByScope = new Map<string, string>();
    const versionRows = input.groups.map((group) => {
      const id = newId();
      const metrics = group.rows
        .filter((row) => row.metric)
        .map((row) => row.metric as ComparableMetric);
      const totals = totalsForMetrics(metrics);
      const previousVersionId =
        lockedScopes.find((scope) => scope.scopeKey === group.scopeKey)
          ?.activeVersionId ?? null;
      const versionNumber =
        Math.max(
          0,
          ...existingVersions
            .filter((version) => version.scopeKey === group.scopeKey)
            .map((version) => version.versionNumber),
        ) + 1;

      versionIdByScope.set(group.scopeKey, id);

      return {
        id,
        importBatchId: input.batchId,
        scopeKey: group.scopeKey,
        source: group.scope.source,
        importType: group.scope.importType,
        granularity:
          metrics[0]?.granularity ?? ("hourly" as ImportGranularity),
        reportingDate: group.scope.reportingDate,
        teamId: group.scope.teamId,
        dialerId: group.scope.dialerId,
        versionNumber,
        status: "draft" as const,
        previousVersionId,
        rowCount: group.rows.length,
        matchedAgentCount: new Set(
          metrics.map((metric) => metric.agentProfileId),
        ).size,
        unmatchedAgentCount: 0,
        totalCalls: totals.calls,
        totalLoggedInSeconds: totals.loggedInSeconds,
        totalTalkSeconds: totals.talkSeconds,
        totalWrapSeconds: totals.wrapSeconds,
      };
    });

    if (versionRows.length > 0) {
      await tx.insert(dialerDatasetVersions).values(versionRows);
    }

    const agentStatusByKey = new Map(
      input.preview.agents.map((agent) => [
        agent.agentKey,
        agent.mappingStatus,
      ]),
    );
    const stagedRows = input.preview.rows.map((row) => {
      const mappingStatus =
        agentStatusByKey.get(row.agentKey) ??
        rowMatchingStatus(input.preview, row.agentKey);
      const scope = row.metric
        ? scopeForMetric(row.metric, input.importType, input.dialerId)
        : null;
      const versionId = scope
        ? versionIdByScope.get(datasetScopeKey(scope)) ?? null
        : null;
      const blockingRow =
        row.status === "invalid" &&
        (mappingStatus === "mapped" ||
          mappingStatus === "invalid_mapping");
      const validationMessages =
        blockingRow && row.validationMessage
          ? [row.validationMessage]
          : [];
      const warningMessages = [
        row.warningMessage,
        !blockingRow ? row.validationMessage : undefined,
      ].filter((message): message is string => Boolean(message));

      return {
        id: newId(),
        batchId: input.batchId,
        versionId,
        rowNumber: row.rowNumber,
        sourceAgentName: row.dialerAgentName,
        normalizedAgentName: row.agentKey,
        matchedAgentProfileId: row.metric?.agentProfileId ?? null,
        granularity: row.granularity,
        metricDate: row.date,
        metricHour: row.hour,
        calls: row.calls,
        loggedInSeconds: row.durations?.loggedInSeconds ?? null,
        readySeconds: row.durations?.readySeconds ?? null,
        talkSeconds: row.durations?.talkSeconds ?? null,
        ringingSeconds: row.durations?.ringingSeconds ?? null,
        wrapSeconds: row.durations?.wrapSeconds ?? null,
        pausedSeconds: row.durations?.pausedSeconds ?? null,
        systemPauseSeconds: row.durations?.systemPauseSeconds ?? null,
        netSeconds: row.durations?.netSeconds ?? null,
        idleSeconds: row.durations?.idleSeconds ?? null,
        untrackedSeconds: row.durations?.untrackedSeconds ?? null,
        teamIdSnapshot: row.metric?.teamIdSnapshot ?? null,
        matchingStatus: mappingStatus,
        validationStatus: blockingRow
          ? ("error" as const)
          : warningMessages.length > 0
            ? ("warning" as const)
            : ("valid" as const),
        validationMessages,
        warningMessages,
        rowHash: row.rowHash ?? null,
        rawRow: row.rawRow,
      };
    });

    await insertInChunks(stagedRows, (chunk) =>
      tx.insert(dialerImportRows).values(chunk),
    );

    const duplicateMetricKeys = new Set<string>();
    const metricRows = [];

    for (const row of input.preview.rows) {
      if (!row.metric || !row.rowHash) {
        continue;
      }

      const scope = scopeForMetric(
        row.metric,
        input.importType,
        input.dialerId,
      );
      const versionId = versionIdByScope.get(datasetScopeKey(scope));

      if (!versionId) {
        continue;
      }

      const metricKey = [
        versionId,
        row.metric.agentProfileId,
        row.metric.metricDate,
        row.metric.metricKey,
      ].join(":");

      if (duplicateMetricKeys.has(metricKey)) {
        continue;
      }

      duplicateMetricKeys.add(metricKey);
      metricRows.push({
        id: newId(),
        source: row.metric.source,
        sourceAgentName: row.metric.sourceAgentName,
        agentProfileId: row.metric.agentProfileId,
        batchId: input.batchId,
        versionId,
        granularity: row.metric.granularity,
        metricDate: row.metric.metricDate,
        metricHour: row.metric.metricHour,
        metricKey: row.metric.metricKey,
        calls: row.metric.calls,
        loggedInSeconds: row.metric.loggedInSeconds,
        readySeconds: row.metric.readySeconds,
        talkSeconds: row.metric.talkSeconds,
        ringingSeconds: row.metric.ringingSeconds,
        wrapSeconds: row.metric.wrapSeconds,
        pausedSeconds: row.metric.pausedSeconds,
        systemPauseSeconds: row.metric.systemPauseSeconds,
        netSeconds: row.metric.netSeconds,
        idleSeconds: row.metric.idleSeconds,
        untrackedSeconds: row.metric.untrackedSeconds,
        teamIdSnapshot: row.metric.teamIdSnapshot,
        teamNameSnapshot: row.metric.teamNameSnapshot,
        rowHash: row.rowHash,
      });
    }

    await insertInChunks(metricRows, (chunk) =>
      tx.insert(dialerAgentHourlyMetrics).values(chunk),
    );

    const errorRows = input.preview.rows
      .filter((row) => row.validationMessage)
      .map((row) => ({
        id: newId(),
        batchId: input.batchId,
        rowNumber: row.rowNumber,
        status: row.status,
        message: row.validationMessage ?? "Row is not importable.",
        rawRow: row.rawRow,
      }));

    await insertInChunks(errorRows, (chunk) =>
      tx.insert(importErrors).values(chunk),
    );

    const reportingStartDate = input.validation.reportingDates[0] ?? null;
    const reportingEndDate =
      input.validation.reportingDates.at(-1) ?? reportingStartDate;
    const matchedAgentCount = new Set(
      input.preview.rows
        .filter((row) => row.metric)
        .map((row) => row.metric?.agentProfileId)
        .filter((id): id is string => Boolean(id)),
    ).size;
    const unmatchedAgentCount = input.preview.agents.filter(
      (agent) => agent.mappingStatus !== "mapped",
    ).length;
    const previousImportIds = new Set(
      versionRows
        .map((version) => version.previousVersionId)
        .filter((id): id is string => Boolean(id))
        .map(
          (versionId) =>
            existingVersions.find((version) => version.id === versionId)
              ?.importBatchId ?? null,
        )
        .filter((id): id is string => Boolean(id)),
    );
    const nextStatus =
      input.validation.errors.length > 0
        ? ("validation_failed" as const)
        : ("ready_to_publish" as const);

    await tx
      .update(dialerImportBatches)
      .set({
        status: nextStatus,
        rowCount: input.preview.totalCsvRows,
        matchedAgentCount,
        unmatchedAgentCount,
        reportingStartDate,
        reportingEndDate,
        selectedReportingDate: input.selectedReportingDate,
        granularity: input.preview.granularity ?? "hourly",
        previewSummary: previewSummary({
          preview: input.preview,
          validation: input.validation,
          selectedReportingDate: input.selectedReportingDate,
          duplicateImports: input.duplicateImports,
          scopeKeys,
        }),
        validationErrors: input.validation.errors,
        validationWarnings: input.validation.warnings,
        validationNotices: input.validation.notices,
        detectedHeaders: input.preview.headers,
        missingRequiredHeaders: input.preview.missingHeaders,
        parsedAt: new Date(),
        previousImportId:
          previousImportIds.size === 1
            ? Array.from(previousImportIds)[0]
            : null,
      })
      .where(eq(dialerImportBatches.id, input.batchId));

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action:
        input.validation.errors.length > 0
          ? "dialer_import.validation_failed"
          : input.revalidation
            ? "dialer_import.revalidated"
            : "dialer_import.parsed",
      entityType: "dialer_import_batch",
      entityId: input.batchId,
      metadata: {
        status: nextStatus,
        rowCount: input.preview.totalCsvRows,
        matchedAgentCount,
        unmatchedAgentCount,
        reportingStartDate,
        reportingEndDate,
        selectedReportingDate: input.selectedReportingDate,
        granularity: input.preview.granularity,
        errorCount: input.validation.errors.length,
        warningCount: input.validation.warnings.length,
        noticeCount: input.validation.notices.length,
        scopeKeys,
      },
    });

    return {
      batchId: input.batchId,
      fileName: input.fileName,
      createdAt: lockedBatch.createdAt,
      preview: input.preview,
      validation: input.validation,
      status: nextStatus,
    } satisfies StoredImportPreview;
  });
}

async function processDialerBatch(input: {
  actor: Actor;
  batchId: string;
  selectedReportingDate?: string | null;
  revalidation?: boolean;
}) {
  const [batch] = await getDb()
    .select()
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, input.batchId))
    .limit(1);

  if (!batch) {
    throw new ImportConfirmationError("Import batch was not found.");
  }

  assertCanAccessBatch(input.actor, batch);

  if (
    ![...REPROCESSABLE_STATUSES, "uploaded", "processing"].includes(
      batch.status as (typeof REPROCESSABLE_STATUSES)[number] | "uploaded" | "processing",
    )
  ) {
    throw new ImportConfirmationError(
      "Only unpublished imports can be processed.",
      "invalid_status",
    );
  }

  await getDb()
    .update(dialerImportBatches)
    .set({ status: "processing" })
    .where(eq(dialerImportBatches.id, batch.id));

  try {
    const [mappings, activeMetrics, duplicateImports, parsingActor] = await Promise.all([
      getMappings(batch.source, input.actor),
      listActiveDialerMetrics(),
      getDuplicateImports({
        batchId: batch.id,
        source: batch.source,
        importType: batch.importType,
        fileHash: batch.fileHash,
      }),
      resolveParsingActor(input.actor, batch),
    ]);
    const selectedReportingDate =
      input.selectedReportingDate ??
      selectedReportingDateFromBatch(batch);
    const preview = previewDialerCsv({
      actor: parsingActor,
      source: batch.source,
      fileName: batch.fileName,
      fileContent: batch.rawFileContent,
      selectedReportingDate,
      existingFileHashes: new Set(
        duplicateImports.map(() => batch.fileHash),
      ),
      mappings,
      existingMetrics: activeMetrics,
    });
    const groups = groupDraftScopes(
      preview,
      batch.importType,
      batch.dialerId,
    );
    const parsedScopeKeys = groups.map((group) => group.scopeKey);
    const scopeKeys = new Set(parsedScopeKeys);
    const scopedDuplicateImports = duplicateImports.filter((duplicate) =>
      duplicateMatchesScopes(duplicate, parsedScopeKeys),
    );
    preview.duplicateFile = scopedDuplicateImports.length > 0;
    preview.fileSummary.duplicateFile = scopedDuplicateImports.length > 0;
    const currentMetrics = activeMetrics.filter((metric) =>
      scopeKeys.has(metric.scopeKey),
    );
    const validation = validateImport({
      preview,
      fileContent: batch.rawFileContent,
      currentMetrics,
      selectedReportingDate,
      duplicateImports: scopedDuplicateImports,
    });

    return await persistProcessedBatch({
      actor: input.actor,
      batchId: batch.id,
      fileName: batch.fileName,
      importType: batch.importType,
      dialerId: batch.dialerId,
      selectedReportingDate,
      preview,
      validation,
      duplicateImports: scopedDuplicateImports,
      groups,
      revalidation: input.revalidation ?? false,
    });
  } catch (error) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(dialerImportBatches)
        .set({
          status: "failed",
          validationErrors: [
            error instanceof Error
              ? error.message
              : "Unexpected import processing failure.",
          ],
        })
        .where(eq(dialerImportBatches.id, batch.id));
      await tx.insert(auditLogs).values({
        id: newId(),
        actorProfileId: input.actor.id,
        action: "dialer_import.failed",
        entityType: "dialer_import_batch",
        entityId: batch.id,
        metadata: {
          stage: "processing",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected import processing failure.",
        },
      });
    });

    throw error;
  }
}

export async function createDialerPreviewBatch(input: {
  actor: Actor;
  source: string;
  fileName: string;
  fileContent: string | Buffer;
  importType?: string;
  dialerId?: string | null;
  selectedReportingDate?: string | null;
}) {
  if (input.actor.role === "agent") {
    throw new ImportConfirmationError("Agents cannot upload imports.", "forbidden");
  }

  const fileBuffer = Buffer.isBuffer(input.fileContent)
    ? input.fileContent
    : Buffer.from(input.fileContent, "utf8");

  if (
    fileBuffer.length === 0 ||
    fileBuffer.length > MAX_DIALER_CSV_BYTES ||
    input.fileName.length === 0 ||
    input.fileName.length > 255
  ) {
    throw new ImportConfirmationError("The CSV file is invalid.", "invalid_file");
  }

  const selectedReportingDate = input.selectedReportingDate
    ? parseDialerDate(input.selectedReportingDate)
    : null;

  if (input.selectedReportingDate && !selectedReportingDate) {
    throw new ImportConfirmationError(
      "Selected reporting date is invalid.",
      "invalid_reporting_date",
    );
  }

  const batchId = newId();
  const fileContent = fileBuffer.toString("utf8");
  const fileHash = sha256(fileBuffer);
  const importType = input.importType ?? DIALER_IMPORT_TYPE;
  const format = inspectDialerCsvFormat(fileContent);

  if (format.granularity === "daily" && !selectedReportingDate) {
    throw new ImportConfirmationError(
      "Choose the reporting date represented by this Agent Hours file.",
      "invalid_reporting_date",
    );
  }

  const storageLocation = `database://dialer_import_batches/${batchId}/raw_file_content`;

  await getDb().transaction(async (tx) => {
    await tx.insert(dialerImportBatches).values({
      id: batchId,
      source: input.source,
      importType,
      granularity: format.granularity ?? "hourly",
      dialerId: input.dialerId ?? null,
      fileName: input.fileName,
      fileHash,
      fileSizeBytes: fileBuffer.length,
      storageProvider: DIALER_STORAGE_PROVIDER,
      storageLocation,
      status: "uploaded",
      uploadedById: input.actor.id,
      selectedReportingDate,
      rawFileContent: fileContent,
      previewSummary: { selectedReportingDate },
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.uploaded",
      entityType: "dialer_import_batch",
      entityId: batchId,
      metadata: {
        source: input.source,
        importType,
        granularity: format.granularity,
        dialerId: input.dialerId ?? null,
        fileName: input.fileName,
        fileHash,
        fileSizeBytes: fileBuffer.length,
        selectedReportingDate,
        storageProvider: DIALER_STORAGE_PROVIDER,
      },
    });
  });

  return processDialerBatch({
    actor: input.actor,
    batchId,
    selectedReportingDate,
  });
}

export async function getStoredImportPreview(input: {
  actor: Actor;
  batchId: string;
}) {
  const [batch] = await getDb()
    .select({
      id: dialerImportBatches.id,
      status: dialerImportBatches.status,
      uploadedById: dialerImportBatches.uploadedById,
    })
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, input.batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  try {
    assertCanAccessBatch(input.actor, batch);
  } catch {
    return null;
  }

  if (!REPROCESSABLE_STATUSES.includes(
    batch.status as (typeof REPROCESSABLE_STATUSES)[number],
  )) {
    return null;
  }

  return processDialerBatch({
    actor: input.actor,
    batchId: input.batchId,
    revalidation: true,
  });
}

async function updateBatchVisibilityStatus(
  tx: DbTransaction,
  batchId: string,
  inactiveStatus: "superseded" | "rolled_back",
) {
  const [row] = await tx
    .select({
      activeCount: sql<number>`count(*)`,
    })
    .from(dialerDatasetScopes)
    .innerJoin(
      dialerDatasetVersions,
      eq(dialerDatasetVersions.id, dialerDatasetScopes.activeVersionId),
    )
    .where(eq(dialerDatasetVersions.importBatchId, batchId));

  await tx
    .update(dialerImportBatches)
    .set({ status: Number(row?.activeCount ?? 0) > 0 ? "active" : inactiveStatus })
    .where(eq(dialerImportBatches.id, batchId));
}

export async function publishDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
}) {
  await processDialerBatch({
    actor: input.actor,
    batchId: input.batchId,
    revalidation: true,
  });

  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.batchId))
      .limit(1)
      .for("update");

    if (!batch) {
      throw new ImportConfirmationError("Draft import batch was not found.");
    }

    assertCanAccessBatch(input.actor, batch);

    if (batch.status !== "ready_to_publish") {
      throw new ImportConfirmationError(
        "Blocking validation errors prevent publication.",
        "preview_blocked",
      );
    }

    const warnings = batch.validationWarnings ?? [];
    if (warnings.length > 0 && input.actor.role !== "admin") {
      throw new ImportConfirmationError(
        "Only an administrator can publish an import that contains warnings.",
        "warning_review_forbidden",
      );
    }

    const versions = await tx
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, batch.id))
      .orderBy(asc(dialerDatasetVersions.scopeKey))
      .for("update");

    if (versions.length === 0) {
      throw new ImportConfirmationError(
        "No dataset versions are available to publish.",
        "preview_blocked",
      );
    }

    if (input.actor.role === "manager") {
      const outsideScope = versions.some(
        (version) =>
          !version.teamId || !input.actor.teamIds.includes(version.teamId),
      );

      if (outsideScope) {
        throw new ImportConfirmationError(
          "Draft import contains data outside the manager's current team scope.",
          "forbidden",
        );
      }
    }

    const scopeKeys = versions.map((version) => version.scopeKey);
    const scopes = await tx
      .select()
      .from(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
      .orderBy(asc(dialerDatasetScopes.scopeKey))
      .for("update");

    if (scopes.length !== versions.length) {
      throw new ImportConfirmationError(
        "One or more dataset scopes are unavailable.",
        "stale_draft",
      );
    }

    const now = new Date();
    const previousVersionIds = versions
      .map((version) => version.previousVersionId)
      .filter((id): id is string => Boolean(id));
    const previousVersions =
      previousVersionIds.length > 0
        ? await tx
            .select()
            .from(dialerDatasetVersions)
            .where(inArray(dialerDatasetVersions.id, previousVersionIds))
            .for("update")
        : [];
    const previousBatchIds = new Set<string>();

    for (const version of versions) {
      const scope = scopes.find(
        (candidate) => candidate.scopeKey === version.scopeKey,
      );

      if (!scope || scope.activeVersionId !== version.previousVersionId) {
        throw new ImportConfirmationError(
          "The active dataset changed after review. Refresh and review the draft again.",
          "stale_draft",
        );
      }

      if (scope.activeVersionId) {
        await tx
          .update(dialerDatasetVersions)
          .set({ status: "superseded", supersededAt: now })
          .where(eq(dialerDatasetVersions.id, scope.activeVersionId));
      }

      await tx
        .update(dialerDatasetVersions)
        .set({
          status: "active",
          activatedAt: now,
          supersededAt: null,
        })
        .where(eq(dialerDatasetVersions.id, version.id));
      await tx
        .update(dialerDatasetScopes)
        .set({
          activeVersionId: version.id,
          revision: sql`${dialerDatasetScopes.revision} + 1`,
        })
        .where(eq(dialerDatasetScopes.scopeKey, version.scopeKey));

      const previousBatchId = previousVersions.find(
        (previous) => previous.id === scope.activeVersionId,
      )?.importBatchId;

      if (previousBatchId && previousBatchId !== batch.id) {
        previousBatchIds.add(previousBatchId);
      }
    }

    await tx
      .update(dialerImportBatches)
      .set({
        status: "active",
        publishedById: input.actor.id,
        publishedAt: now,
        confirmedById: input.actor.id,
        confirmedAt: now,
      })
      .where(eq(dialerImportBatches.id, batch.id));

    for (const previousBatchId of previousBatchIds) {
      await updateBatchVisibilityStatus(tx, previousBatchId, "superseded");
    }

    if (warnings.length > 0) {
      await tx.insert(auditLogs).values({
        id: newId(),
        actorProfileId: input.actor.id,
        action: "dialer_import.warnings_reviewed",
        entityType: "dialer_import_batch",
        entityId: batch.id,
        metadata: {
          warningCount: warnings.length,
          warnings,
          scopeKeys,
        },
      });

      const duplicateImports = batch.previewSummary?.duplicateImports;

      if (Array.isArray(duplicateImports) && duplicateImports.length > 0) {
        await tx.insert(auditLogs).values({
          id: newId(),
          actorProfileId: input.actor.id,
          action: "dialer_import.duplicate_published",
          entityType: "dialer_import_batch",
          entityId: batch.id,
          metadata: {
            previousImportIds: duplicateImports
              .map((duplicate) =>
                duplicate &&
                typeof duplicate === "object" &&
                "id" in duplicate &&
                typeof duplicate.id === "string"
                  ? duplicate.id
                  : null,
              )
              .filter((id): id is string => Boolean(id)),
          },
        });
      }
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.published",
      entityType: "dialer_import_batch",
      entityId: batch.id,
      metadata: {
        previousImportIds: Array.from(previousBatchIds),
        scopeKeys,
        versionIds: versions.map((version) => version.id),
        granularity: batch.granularity,
        selectedReportingDate: batch.selectedReportingDate,
        warningsPresent: warnings.length > 0,
        warningCount: warnings.length,
        warnings,
      },
    });

    return { batchId: batch.id, scopeKeys };
  });
}

export async function confirmDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  allowPartialImport?: boolean;
}) {
  return publishDialerImportBatch({
    actor: input.actor,
    batchId: input.batchId,
  });
}

export async function rejectDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  reason: string;
}) {
  const reason = validateReason(input.reason, "Rejection reason");

  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.batchId))
      .limit(1)
      .for("update");

    if (!batch) {
      throw new ImportConfirmationError("Draft import batch was not found.");
    }

    assertCanAccessBatch(input.actor, batch);

    if (!REPROCESSABLE_STATUSES.includes(
      batch.status as (typeof REPROCESSABLE_STATUSES)[number],
    )) {
      throw new ImportConfirmationError(
        "Only unpublished drafts can be rejected.",
        "invalid_status",
      );
    }

    const now = new Date();
    await tx
      .update(dialerDatasetVersions)
      .set({ status: "rejected" })
      .where(eq(dialerDatasetVersions.importBatchId, batch.id));
    await tx
      .update(dialerImportBatches)
      .set({
        status: "rejected",
        rejectedById: input.actor.id,
        rejectedAt: now,
        rejectionReason: reason,
      })
      .where(eq(dialerImportBatches.id, batch.id));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.rejected",
      entityType: "dialer_import_batch",
      entityId: batch.id,
      metadata: {
        previousStatus: batch.status,
        newStatus: "rejected",
        reason,
      },
    });

    return { batchId: batch.id };
  });
}

async function switchHistoricalVersions(input: {
  actor: Actor;
  targetBatchId: string;
  reason: string;
  mode: "rollback" | "restore";
}) {
  assertAdmin(input.actor);
  try {
    await assertPermission(input.actor, "imports.restore");
  } catch {
    throw new ImportConfirmationError(
      "You do not have permission to restore imports.",
      "forbidden",
    );
  }
  const reason = validateReason(
    input.reason,
    input.mode === "rollback" ? "Rollback reason" : "Restore reason",
  );

  return getDb().transaction(async (tx) => {
    const [targetBatch] = await tx
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.targetBatchId))
      .limit(1)
      .for("update");

    if (!targetBatch) {
      throw new ImportConfirmationError("Historical import was not found.");
    }

    const selectedVersions = await tx
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, targetBatch.id))
      .orderBy(asc(dialerDatasetVersions.scopeKey))
      .for("update");

    if (selectedVersions.length === 0) {
      throw new ImportConfirmationError(
        "Historical import has no restorable dataset versions.",
        "invalid_restore_target",
      );
    }

    const scopeKeys = selectedVersions.map((version) => version.scopeKey);
    const scopes = await tx
      .select()
      .from(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
      .orderBy(asc(dialerDatasetScopes.scopeKey))
      .for("update");

    if (scopes.length !== selectedVersions.length) {
      throw new ImportConfirmationError(
        "Historical import does not match the current dataset scopes.",
        "invalid_restore_target",
      );
    }

    let restoreVersions = selectedVersions;

    if (input.mode === "rollback") {
      for (const version of selectedVersions) {
        const scope = scopes.find(
          (candidate) => candidate.scopeKey === version.scopeKey,
        );

        if (scope?.activeVersionId !== version.id) {
          throw new ImportConfirmationError(
            "Only the currently active import can be rolled back.",
            "invalid_restore_target",
          );
        }
      }

      const previousIds = selectedVersions.map(
        (version) => version.previousVersionId,
      );

      if (previousIds.some((id) => !id)) {
        throw new ImportConfirmationError(
          "The first version of a dataset cannot be rolled back.",
          "invalid_restore_target",
        );
      }

      restoreVersions = await tx
        .select()
        .from(dialerDatasetVersions)
        .where(inArray(dialerDatasetVersions.id, previousIds as string[]))
        .orderBy(asc(dialerDatasetVersions.scopeKey))
        .for("update");
    } else if (
      selectedVersions.some((version) =>
        ["draft", "rejected"].includes(version.status),
      )
    ) {
      throw new ImportConfirmationError(
        "The selected historical version is not valid for restore.",
        "invalid_restore_target",
      );
    }

    if (restoreVersions.length !== selectedVersions.length) {
      throw new ImportConfirmationError(
        "A previous valid version is unavailable.",
        "invalid_restore_target",
      );
    }

    const now = new Date();
    const previousActiveVersions = [];
    const affectedCurrentBatchIds = new Set<string>();
    const restoredBatchIds = new Set<string>();
    let changedScopeCount = 0;

    for (const scope of scopes) {
      const restoreVersion = restoreVersions.find(
        (version) => version.scopeKey === scope.scopeKey,
      );

      if (!restoreVersion || restoreVersion.scopeKey !== scope.scopeKey) {
        throw new ImportConfirmationError(
          "Restore target belongs to a different dataset scope.",
          "invalid_restore_target",
        );
      }

      if (scope.activeVersionId === restoreVersion.id) {
        continue;
      }
      changedScopeCount += 1;

      if (scope.activeVersionId) {
        const [currentVersion] = await tx
          .select()
          .from(dialerDatasetVersions)
          .where(eq(dialerDatasetVersions.id, scope.activeVersionId))
          .limit(1)
          .for("update");

        if (currentVersion) {
          previousActiveVersions.push(currentVersion);
          if (currentVersion.importBatchId) {
            affectedCurrentBatchIds.add(currentVersion.importBatchId);
          }
          await tx
            .update(dialerDatasetVersions)
            .set({ status: "rolled_back", supersededAt: now })
            .where(eq(dialerDatasetVersions.id, currentVersion.id));
        }
      }

      await tx
        .update(dialerDatasetVersions)
        .set({
          status: "active",
          activatedAt: now,
          supersededAt: null,
        })
        .where(eq(dialerDatasetVersions.id, restoreVersion.id));
      await tx
        .update(dialerDatasetScopes)
        .set({
          activeVersionId: restoreVersion.id,
          revision: sql`${dialerDatasetScopes.revision} + 1`,
        })
        .where(eq(dialerDatasetScopes.scopeKey, scope.scopeKey));

      if (restoreVersion.importBatchId) {
        restoredBatchIds.add(restoreVersion.importBatchId);
      }
    }

    if (changedScopeCount === 0) {
      throw new ImportConfirmationError(
        "The selected version is already active.",
        "invalid_restore_target",
      );
    }

    for (const batchId of affectedCurrentBatchIds) {
      await updateBatchVisibilityStatus(tx, batchId, "rolled_back");
    }

    for (const batchId of restoredBatchIds) {
      await updateBatchVisibilityStatus(tx, batchId, "superseded");
    }

    if (input.mode === "rollback") {
      await tx
        .update(dialerImportBatches)
        .set({
          status: "rolled_back",
          rolledBackById: input.actor.id,
          rolledBackAt: now,
          rollbackReason: reason,
        })
        .where(eq(dialerImportBatches.id, targetBatch.id));
    }

    const restoredImportIds = Array.from(restoredBatchIds);
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action:
        input.mode === "rollback"
          ? "dialer_import.rolled_back"
          : "dialer_import.historical_restored",
      entityType: "dialer_import_batch",
      entityId: targetBatch.id,
      metadata: {
        reason,
        previousActiveImportIds: Array.from(affectedCurrentBatchIds),
        restoredImportIds,
        scopeKeys,
        previousActiveVersionIds: previousActiveVersions.map(
          (version) => version.id,
        ),
        restoredVersionIds: restoreVersions.map((version) => version.id),
      },
    });

    return {
      targetBatchId: targetBatch.id,
      restoredImportIds,
      scopeKeys,
    };
  });
}

export async function rollbackDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  reason: string;
}) {
  return switchHistoricalVersions({
    actor: input.actor,
    targetBatchId: input.batchId,
    reason: input.reason,
    mode: "rollback",
  });
}

export async function restoreDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  reason: string;
}) {
  return switchHistoricalVersions({
    actor: input.actor,
    targetBatchId: input.batchId,
    reason: input.reason,
    mode: "restore",
  });
}

const HISTORY_DRAFT_STATUSES = [
  "uploaded",
  "processing",
  "draft",
  "ready_to_publish",
] as const;

const HISTORY_FAILED_STATUSES = ["failed", "validation_failed"] as const;

function historyDateStart(
  range: ImportHistoryFilters["dateRange"],
  now = new Date(),
) {
  if (!range || range === "all") return null;
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function historyWhere(input: ImportHistoryFilters) {
  const conditions: SQL[] = [];
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(dialerImportBatches.fileName, pattern),
        like(dialerImportBatches.id, pattern),
        like(profiles.name, pattern),
      )!,
    );
  }
  if (input.status) {
    conditions.push(sql`${dialerImportBatches.status} = ${input.status}`);
  }
  if (input.importType) {
    conditions.push(eq(dialerImportBatches.importType, input.importType));
  }
  if (input.uploadedById) {
    conditions.push(eq(dialerImportBatches.uploadedById, input.uploadedById));
  }
  const start = historyDateStart(input.dateRange);
  if (start) conditions.push(gte(dialerImportBatches.createdAt, start));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function previewNumber(
  summary: Record<string, unknown> | null,
  key: string,
) {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function listImportHistory(
  actor: Actor,
  input: ImportHistoryFilters = {},
) {
  assertAdmin(actor);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const where = historyWhere(input);
  const sortColumn = {
    fileName: dialerImportBatches.fileName,
    reportingPeriod: dialerImportBatches.reportingStartDate,
    status: dialerImportBatches.status,
    uploadedAt: dialerImportBatches.createdAt,
  }[input.sort ?? "uploadedAt"];
  const direction = input.order === "asc" ? asc : desc;
  const [
    batches,
    [countRow],
    [summaryRow],
    activeImports,
    [mostRecentFailure],
    [oldestDraft],
    [newestDraft],
    statusRows,
    importTypeRows,
    uploaderRows,
  ] = await Promise.all([
    getDb()
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        fileHash: dialerImportBatches.fileHash,
        fileSizeBytes: dialerImportBatches.fileSizeBytes,
        importType: dialerImportBatches.importType,
        granularity: dialerImportBatches.granularity,
        source: dialerImportBatches.source,
        dialerId: dialerImportBatches.dialerId,
        reportingStartDate: dialerImportBatches.reportingStartDate,
        reportingEndDate: dialerImportBatches.reportingEndDate,
        selectedReportingDate: dialerImportBatches.selectedReportingDate,
        uploadedById: dialerImportBatches.uploadedById,
        createdAt: dialerImportBatches.createdAt,
        rowCount: dialerImportBatches.rowCount,
        matchedAgentCount: dialerImportBatches.matchedAgentCount,
        unmatchedAgentCount: dialerImportBatches.unmatchedAgentCount,
        previewSummary: dialerImportBatches.previewSummary,
        status: dialerImportBatches.status,
        publishedById: dialerImportBatches.publishedById,
        publishedAt: dialerImportBatches.publishedAt,
        rolledBackAt: dialerImportBatches.rolledBackAt,
        rollbackReason: dialerImportBatches.rollbackReason,
        storageProvider: dialerImportBatches.storageProvider,
        storageLocation: dialerImportBatches.storageLocation,
        storedFileBytes: sql<number>`octet_length(${dialerImportBatches.rawFileContent})`,
        uploaderName: profiles.name,
      })
      .from(dialerImportBatches)
      .leftJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .where(where)
      .orderBy(direction(sortColumn), desc(dialerImportBatches.createdAt))
      .limit(pageSize)
      .offset(offset),
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(dialerImportBatches)
      .leftJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .where(where),
    getDb()
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${dialerImportBatches.publishedAt} is not null then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${dialerImportBatches.status} in ('failed', 'validation_failed') then 1 else 0 end)`,
        drafts: sql<number>`sum(case when ${dialerImportBatches.status} in ('uploaded', 'processing', 'draft', 'ready_to_publish') then 1 else 0 end)`,
        earliestImportAt: sql<Date | null>`min(${dialerImportBatches.createdAt})`,
        latestImportAt: sql<Date | null>`max(${dialerImportBatches.createdAt})`,
      })
      .from(dialerImportBatches),
    getDb()
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        reportingStartDate: dialerImportBatches.reportingStartDate,
        reportingEndDate: dialerImportBatches.reportingEndDate,
        publishedAt: dialerImportBatches.publishedAt,
        uploadedBy: profiles.name,
      })
      .from(dialerDatasetVersions)
      .innerJoin(
        dialerDatasetScopes,
        eq(dialerDatasetScopes.activeVersionId, dialerDatasetVersions.id),
      )
      .innerJoin(
        dialerImportBatches,
        eq(dialerImportBatches.id, dialerDatasetVersions.importBatchId),
      )
      .leftJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .groupBy(
        dialerImportBatches.id,
        dialerImportBatches.fileName,
        dialerImportBatches.reportingStartDate,
        dialerImportBatches.reportingEndDate,
        dialerImportBatches.publishedAt,
        profiles.name,
      )
      .orderBy(desc(dialerImportBatches.publishedAt)),
    getDb()
      .select({
        fileName: dialerImportBatches.fileName,
        uploadedAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .where(inArray(dialerImportBatches.status, [...HISTORY_FAILED_STATUSES]))
      .orderBy(desc(dialerImportBatches.createdAt))
      .limit(1),
    getDb()
      .select({
        fileName: dialerImportBatches.fileName,
        uploadedAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .where(inArray(dialerImportBatches.status, [...HISTORY_DRAFT_STATUSES]))
      .orderBy(asc(dialerImportBatches.createdAt))
      .limit(1),
    getDb()
      .select({
        fileName: dialerImportBatches.fileName,
        uploadedAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .where(inArray(dialerImportBatches.status, [...HISTORY_DRAFT_STATUSES]))
      .orderBy(desc(dialerImportBatches.createdAt))
      .limit(1),
    getDb()
      .selectDistinct({ status: dialerImportBatches.status })
      .from(dialerImportBatches)
      .orderBy(asc(dialerImportBatches.status)),
    getDb()
      .selectDistinct({ importType: dialerImportBatches.importType })
      .from(dialerImportBatches)
      .orderBy(asc(dialerImportBatches.importType)),
    getDb()
      .selectDistinct({ id: profiles.id, name: profiles.name })
      .from(dialerImportBatches)
      .innerJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .orderBy(asc(profiles.name)),
  ]);
  const batchIds = batches.map((batch) => batch.id);
  const [versionRows, activeRows] = await Promise.all([
    batchIds.length > 0
      ? getDb()
          .select({
            importBatchId: dialerDatasetVersions.importBatchId,
            teamId: dialerDatasetVersions.teamId,
            teamName: teams.name,
          })
          .from(dialerDatasetVersions)
          .leftJoin(teams, eq(teams.id, dialerDatasetVersions.teamId))
          .where(inArray(dialerDatasetVersions.importBatchId, batchIds))
      : Promise.resolve([]),
    batchIds.length > 0
      ? getDb()
          .select({
            importBatchId: dialerDatasetVersions.importBatchId,
            activeVersionCount: sql<number>`count(*)`,
          })
          .from(dialerDatasetVersions)
          .innerJoin(
            dialerDatasetScopes,
            eq(
              dialerDatasetScopes.activeVersionId,
              dialerDatasetVersions.id,
            ),
          )
          .where(inArray(dialerDatasetVersions.importBatchId, batchIds))
          .groupBy(dialerDatasetVersions.importBatchId)
      : Promise.resolve([]),
  ]);
  const deletionAssessments = await getImportDeletionAssessments(actor, batches);

  const summary: ImportHistorySummary = {
    total: Number(summaryRow?.total ?? 0),
    active: activeImports.length,
    published: Number(summaryRow?.published ?? 0),
    failed: Number(summaryRow?.failed ?? 0),
    drafts: Number(summaryRow?.drafts ?? 0),
    earliestImportAt: summaryRow?.earliestImportAt ?? null,
    latestImportAt: summaryRow?.latestImportAt ?? null,
    activeImports: activeImports.map((row) => ({
      ...row,
      uploadedBy: row.uploadedBy ?? "Unavailable",
    })),
    mostRecentFailure: mostRecentFailure ?? null,
    oldestDraft: oldestDraft ?? null,
    newestDraft: newestDraft ?? null,
  };

  const facets: ImportHistoryFacets = {
    statuses: statusRows.map((row) => row.status),
    importTypes: importTypeRows.map((row) => row.importType),
    uploaders: uploaderRows,
  };

  return {
    page,
    pageSize,
    total: Number(countRow?.count ?? 0),
    summary,
    facets,
    rows: batches.map((batch) => ({
      id: batch.id,
      fileName: batch.fileName,
      fileHash: batch.fileHash,
      fileSizeBytes: batch.fileSizeBytes,
      importType: batch.importType,
      granularity: batch.granularity,
      source: batch.source,
      reportingStartDate: batch.reportingStartDate,
      reportingEndDate: batch.reportingEndDate,
      selectedReportingDate: batch.selectedReportingDate,
      uploadedBy: batch.uploaderName ?? batch.uploadedById,
      uploadedAt: batch.createdAt,
      rowCount: batch.rowCount,
      matchedAgentCount: batch.matchedAgentCount,
      unmatchedAgentCount: batch.unmatchedAgentCount,
      mappedRowCount: previewNumber(batch.previewSummary, "mappedRowsToImport"),
      unmatchedRowCount: previewNumber(batch.previewSummary, "unmappedRowsToSkip"),
      unauthorizedRowCount: previewNumber(
        batch.previewSummary,
        "outOfScopeRowsToSkip",
      ),
      invalidRowCount: previewNumber(batch.previewSummary, "invalidRows"),
      unchangedRowCount: previewNumber(batch.previewSummary, "unchangedRows"),
      duplicateFile:
        typeof batch.previewSummary?.duplicateFile === "boolean"
          ? batch.previewSummary.duplicateFile
          : null,
      status: batch.status,
      publishedAt: batch.publishedAt,
      activeVersionCount: Number(
        activeRows.find((row) => row.importBatchId === batch.id)
          ?.activeVersionCount ?? 0,
      ),
      rollbackStatus:
        batch.rolledBackAt || batch.status === "rolled_back"
          ? batch.rollbackReason ?? "Rolled back"
          : null,
      dialerId: batch.dialerId,
      teams: Array.from(
        new Set(
          versionRows
            .filter((version) => version.importBatchId === batch.id)
            .map((version) => version.teamName ?? "Company"),
        ),
      ).sort(),
      deletion: deletionAssessments.get(batch.id)!,
    })) satisfies ImportHistoryRow[],
  };
}

export async function getImportDetails(actor: Actor, batchId: string) {
  assertAdmin(actor);
  const [batch] = await getDb()
    .select({
      id: dialerImportBatches.id,
      source: dialerImportBatches.source,
      importType: dialerImportBatches.importType,
      granularity: dialerImportBatches.granularity,
      dialerId: dialerImportBatches.dialerId,
      fileName: dialerImportBatches.fileName,
      fileHash: dialerImportBatches.fileHash,
      fileSizeBytes: dialerImportBatches.fileSizeBytes,
      storageProvider: dialerImportBatches.storageProvider,
      storageLocation: dialerImportBatches.storageLocation,
      status: dialerImportBatches.status,
      uploadedById: dialerImportBatches.uploadedById,
      confirmedById: dialerImportBatches.confirmedById,
      rowCount: dialerImportBatches.rowCount,
      matchedAgentCount: dialerImportBatches.matchedAgentCount,
      unmatchedAgentCount: dialerImportBatches.unmatchedAgentCount,
      reportingStartDate: dialerImportBatches.reportingStartDate,
      reportingEndDate: dialerImportBatches.reportingEndDate,
      selectedReportingDate: dialerImportBatches.selectedReportingDate,
      previewSummary: dialerImportBatches.previewSummary,
      validationErrors: dialerImportBatches.validationErrors,
      validationWarnings: dialerImportBatches.validationWarnings,
      validationNotices: dialerImportBatches.validationNotices,
      detectedHeaders: dialerImportBatches.detectedHeaders,
      missingRequiredHeaders: dialerImportBatches.missingRequiredHeaders,
      expiresAt: dialerImportBatches.expiresAt,
      parsedAt: dialerImportBatches.parsedAt,
      publishedById: dialerImportBatches.publishedById,
      publishedAt: dialerImportBatches.publishedAt,
      previousImportId: dialerImportBatches.previousImportId,
      rejectedById: dialerImportBatches.rejectedById,
      rejectedAt: dialerImportBatches.rejectedAt,
      rejectionReason: dialerImportBatches.rejectionReason,
      rolledBackById: dialerImportBatches.rolledBackById,
      rolledBackAt: dialerImportBatches.rolledBackAt,
      rollbackReason: dialerImportBatches.rollbackReason,
      confirmedAt: dialerImportBatches.confirmedAt,
      createdAt: dialerImportBatches.createdAt,
      storedFileBytes: sql<number>`octet_length(${dialerImportBatches.rawFileContent})`,
    })
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  const [versions, rows, deletionAssessments] = await Promise.all([
    getDb()
      .select({
        id: dialerDatasetVersions.id,
        scopeKey: dialerDatasetVersions.scopeKey,
        reportingDate: dialerDatasetVersions.reportingDate,
        granularity: dialerDatasetVersions.granularity,
        teamId: dialerDatasetVersions.teamId,
        teamName: teams.name,
        versionNumber: dialerDatasetVersions.versionNumber,
        status: dialerDatasetVersions.status,
        previousVersionId: dialerDatasetVersions.previousVersionId,
        rowCount: dialerDatasetVersions.rowCount,
        totalCalls: dialerDatasetVersions.totalCalls,
        totalLoggedInSeconds: dialerDatasetVersions.totalLoggedInSeconds,
        totalTalkSeconds: dialerDatasetVersions.totalTalkSeconds,
        totalWrapSeconds: dialerDatasetVersions.totalWrapSeconds,
        activeVersionId: dialerDatasetScopes.activeVersionId,
      })
      .from(dialerDatasetVersions)
      .leftJoin(teams, eq(teams.id, dialerDatasetVersions.teamId))
      .leftJoin(
        dialerDatasetScopes,
        eq(dialerDatasetScopes.scopeKey, dialerDatasetVersions.scopeKey),
      )
      .where(eq(dialerDatasetVersions.importBatchId, batchId))
      .orderBy(
        asc(dialerDatasetVersions.reportingDate),
        asc(dialerDatasetVersions.scopeKey),
      ),
    getDb()
      .select({
        rowNumber: dialerImportRows.rowNumber,
        sourceAgentName: dialerImportRows.sourceAgentName,
        matchingStatus: dialerImportRows.matchingStatus,
        validationStatus: dialerImportRows.validationStatus,
        validationMessages: dialerImportRows.validationMessages,
        warningMessages: dialerImportRows.warningMessages,
      })
      .from(dialerImportRows)
      .where(eq(dialerImportRows.batchId, batchId))
      .orderBy(asc(dialerImportRows.rowNumber)),
    getImportDeletionAssessments(actor, [batch]),
  ]);

  return {
    batch,
    versions,
    rows,
    comparison:
      (batch.previewSummary?.comparison as ImportComparison | undefined) ??
      null,
    duplicateImports: Array.isArray(batch.previewSummary?.duplicateImports)
      ? batch.previewSummary.duplicateImports
      : [],
    deletion: deletionAssessments.get(batch.id)!,
  };
}

export async function getImportFile(actor: Actor, batchId: string) {
  const [batch] = await getDb()
    .select({
      id: dialerImportBatches.id,
      fileName: dialerImportBatches.fileName,
      uploadedById: dialerImportBatches.uploadedById,
      rawFileContent: dialerImportBatches.rawFileContent,
      fileHash: dialerImportBatches.fileHash,
    })
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  assertCanAccessBatch(actor, batch);
  return batch;
}
