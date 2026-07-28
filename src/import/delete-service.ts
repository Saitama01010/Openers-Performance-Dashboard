import "server-only";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  isNotNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertPermission, hasPermission } from "@/auth/permissions";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  importErrors,
} from "@/db/schema";
import {
  IMPORT_REASON_MIN_LENGTH,
  IMPORT_RETENTION_POLICY,
} from "@/import/config";
import {
  resolveActiveImportWithinTransaction,
} from "@/import/active-lifecycle";
import { newId } from "@/lib/ids";

const ELIGIBLE_DELETION_STATUSES = new Set([
  "draft",
  "validation_failed",
  "ready_to_publish",
  "failed",
  "rejected",
  "deactivated",
  "superseded",
  "rolled_back",
]);

const VALID_HISTORICAL_VERSION_STATUSES = [
  "superseded",
  "rolled_back",
] as const;

type DeletionBatchRecord = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  importType: string;
  source: string;
  dialerId: string | null;
  status: string;
  uploadedById: string;
  reportingStartDate: string | null;
  reportingEndDate: string | null;
  rowCount: number;
  storageProvider: string;
  storageLocation: string | null;
  storedFileBytes?: number;
  createdAt: Date;
};

type DeletionVersionRecord = {
  id: string;
  importBatchId: string | null;
  scopeKey: string;
  source: string;
  importType: string;
  reportingDate: string;
  teamId: string | null;
  dialerId: string | null;
  versionNumber: number;
  status: string;
  previousVersionId: string | null;
};

export type ImportDeletionCounts = {
  metricRows: number;
  stagingRows: number;
  validationRows: number;
  versionRows: number;
  importRecords: number;
  totalRecords: number;
};

export type ImportDeletionAssessment = {
  allowed: boolean;
  code: string | null;
  reason: string | null;
  counts: ImportDeletionCounts;
  activeVersionCount: number;
  requiresActiveResolution: boolean;
  activeMetricRowCount: number;
  sharedMetricRowCount: number;
  retentionBlockedScopes: string[];
  storedFilePresent: boolean;
  storedFileProvider: string;
  approximateStorageBytes: number;
};

type AssessmentFacts = {
  batch: DeletionBatchRecord;
  hasDeletePermission: boolean;
  versions: DeletionVersionRecord[];
  activeVersionIds: Set<string>;
  activeMetricRowCount: number;
  sharedMetricRowCount: number;
  remainingHistoricalVersionsByScope: Map<string, number>;
  metricRows: number;
  stagingRows: number;
  validationRows: number;
};

export class ImportDeletionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ImportDeletionError";
  }
}

function countValue(
  rows: Array<{ batchId: string | null; count: number }>,
  batchId: string,
) {
  return Number(rows.find((row) => row.batchId === batchId)?.count ?? 0);
}

function storedFilePresent(batch: DeletionBatchRecord) {
  return (
    Number(batch.storedFileBytes ?? batch.fileSizeBytes) > 0 ||
    Boolean(batch.storageLocation)
  );
}

export function evaluateImportDeletion(
  facts: AssessmentFacts,
): ImportDeletionAssessment {
  const activeVersionCount = facts.versions.filter((version) =>
    facts.activeVersionIds.has(version.id),
  ).length;
  const retentionBlockedScopes = Array.from(
    new Set(
      facts.versions
        .filter((version) =>
          VALID_HISTORICAL_VERSION_STATUSES.includes(
            version.status as (typeof VALID_HISTORICAL_VERSION_STATUSES)[number],
          ),
        )
        .filter(
          (version) =>
            (facts.remainingHistoricalVersionsByScope.get(version.scopeKey) ??
              0) <
            IMPORT_RETENTION_POLICY.minimumValidHistoricalVersionsPerScope,
        )
        .map((version) => version.scopeKey),
    ),
  ).sort();
  const counts = {
    metricRows: facts.metricRows,
    stagingRows: facts.stagingRows,
    validationRows: facts.validationRows,
    versionRows: facts.versions.length,
    importRecords: 1,
    totalRecords:
      facts.metricRows +
      facts.stagingRows +
      facts.validationRows +
      facts.versions.length +
      1,
  };
  const base = {
    counts,
    activeVersionCount,
    requiresActiveResolution: activeVersionCount > 0,
    activeMetricRowCount: facts.activeMetricRowCount,
    sharedMetricRowCount: facts.sharedMetricRowCount,
    retentionBlockedScopes,
    storedFilePresent: storedFilePresent(facts.batch),
    storedFileProvider: facts.batch.storageProvider,
    approximateStorageBytes: storedFilePresent(facts.batch)
      ? Number(facts.batch.storedFileBytes ?? facts.batch.fileSizeBytes)
      : 0,
  };

  if (!facts.hasDeletePermission) {
    return {
      ...base,
      allowed: false,
      code: "delete_forbidden",
      reason: "You do not have permission to permanently delete imports.",
    };
  }

  if (["uploaded", "processing"].includes(facts.batch.status)) {
    return {
      ...base,
      allowed: false,
      code: "import_processing",
      reason: "This import is still processing.",
    };
  }

  if (
    activeVersionCount === 0 &&
    !ELIGIBLE_DELETION_STATUSES.has(facts.batch.status)
  ) {
    return {
      ...base,
      allowed: false,
      code: "status_not_deletable",
      reason:
        facts.batch.status === "ready_to_publish"
          ? "Reject this draft before deleting it."
          : "This import status is not eligible for permanent deletion.",
    };
  }

  return {
    ...base,
    allowed: true,
    code: null,
    reason: null,
  };
}

async function readDeletionFacts(
  actor: Actor,
  batches: DeletionBatchRecord[],
) {
  const batchIds = batches.map((batch) => batch.id);

  if (batchIds.length === 0) {
    return new Map<string, ImportDeletionAssessment>();
  }

  const canDelete =
    actor.role === "admin" && (await hasPermission(actor, "imports.delete"));
  const [
    versions,
    stagingCounts,
    validationCounts,
    metricCounts,
    activeMetricCounts,
  ] = await Promise.all([
    getDb()
      .select({
        id: dialerDatasetVersions.id,
        importBatchId: dialerDatasetVersions.importBatchId,
        scopeKey: dialerDatasetVersions.scopeKey,
        source: dialerDatasetVersions.source,
        importType: dialerDatasetVersions.importType,
        reportingDate: dialerDatasetVersions.reportingDate,
        teamId: dialerDatasetVersions.teamId,
        dialerId: dialerDatasetVersions.dialerId,
        versionNumber: dialerDatasetVersions.versionNumber,
        status: dialerDatasetVersions.status,
        previousVersionId: dialerDatasetVersions.previousVersionId,
      })
      .from(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.importBatchId, batchIds)),
    getDb()
      .select({
        batchId: dialerImportRows.batchId,
        count: sql<number>`count(*)`,
      })
      .from(dialerImportRows)
      .where(inArray(dialerImportRows.batchId, batchIds))
      .groupBy(dialerImportRows.batchId),
    getDb()
      .select({
        batchId: importErrors.batchId,
        count: sql<number>`count(*)`,
      })
      .from(importErrors)
      .where(inArray(importErrors.batchId, batchIds))
      .groupBy(importErrors.batchId),
    getDb()
      .select({
        batchId: dialerAgentHourlyMetrics.batchId,
        count: sql<number>`count(*)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.batchId, batchIds))
      .groupBy(dialerAgentHourlyMetrics.batchId),
    getDb()
      .select({
        batchId: dialerAgentHourlyMetrics.batchId,
        count: sql<number>`count(*)`,
      })
      .from(dialerAgentHourlyMetrics)
      .innerJoin(
        dialerDatasetScopes,
        eq(
          dialerDatasetScopes.activeVersionId,
          dialerAgentHourlyMetrics.versionId,
        ),
      )
      .where(inArray(dialerAgentHourlyMetrics.batchId, batchIds))
      .groupBy(dialerAgentHourlyMetrics.batchId),
  ]);
  const scopeKeys = Array.from(new Set(versions.map((version) => version.scopeKey)));
  const [scopes, historicalVersions, ownershipPairs] = await Promise.all([
    scopeKeys.length > 0
      ? getDb()
          .select({
            scopeKey: dialerDatasetScopes.scopeKey,
            activeVersionId: dialerDatasetScopes.activeVersionId,
          })
          .from(dialerDatasetScopes)
          .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
      : Promise.resolve([]),
    scopeKeys.length > 0
      ? getDb()
          .select({
            id: dialerDatasetVersions.id,
            importBatchId: dialerDatasetVersions.importBatchId,
            scopeKey: dialerDatasetVersions.scopeKey,
            status: dialerDatasetVersions.status,
          })
          .from(dialerDatasetVersions)
          .where(
            and(
              inArray(dialerDatasetVersions.scopeKey, scopeKeys),
              inArray(
                dialerDatasetVersions.status,
                VALID_HISTORICAL_VERSION_STATUSES,
              ),
            ),
          )
      : Promise.resolve([]),
    getDb()
      .select({
        metricBatchId: dialerAgentHourlyMetrics.batchId,
        versionBatchId: dialerDatasetVersions.importBatchId,
        count: sql<number>`count(*)`,
      })
      .from(dialerAgentHourlyMetrics)
      .leftJoin(
        dialerDatasetVersions,
        eq(dialerDatasetVersions.id, dialerAgentHourlyMetrics.versionId),
      )
      .where(
        or(
          inArray(dialerAgentHourlyMetrics.batchId, batchIds),
          inArray(dialerDatasetVersions.importBatchId, batchIds),
        ),
      )
      .groupBy(
        dialerAgentHourlyMetrics.batchId,
        dialerDatasetVersions.importBatchId,
      ),
  ]);
  const activeVersionIds = new Set(
    scopes
      .map((scope) => scope.activeVersionId)
      .filter((id): id is string => Boolean(id)),
  );

  return new Map(
    batches.map((batch) => {
      const batchVersions = versions.filter(
        (version) => version.importBatchId === batch.id,
      );
      const remainingHistoricalVersionsByScope = new Map<string, number>();

      for (const version of batchVersions) {
        remainingHistoricalVersionsByScope.set(
          version.scopeKey,
          historicalVersions.filter(
            (historical) =>
              historical.scopeKey === version.scopeKey &&
              historical.importBatchId !== batch.id,
          ).length,
        );
      }

      const sharedMetricRowCount = ownershipPairs
        .filter(
          (pair) =>
            pair.metricBatchId === batch.id &&
            pair.versionBatchId !== batch.id,
        )
        .reduce((total, pair) => total + Number(pair.count), 0);

      return [
        batch.id,
        evaluateImportDeletion({
          batch,
          hasDeletePermission: canDelete,
          versions: batchVersions,
          activeVersionIds,
          activeMetricRowCount: countValue(activeMetricCounts, batch.id),
          sharedMetricRowCount,
          remainingHistoricalVersionsByScope,
          metricRows: countValue(metricCounts, batch.id),
          stagingRows: countValue(stagingCounts, batch.id),
          validationRows: countValue(validationCounts, batch.id),
        }),
      ];
    }),
  );
}

export async function getImportDeletionAssessments(
  actor: Actor,
  batches: DeletionBatchRecord[],
) {
  return readDeletionFacts(actor, batches);
}

function validateDeletionInput(input: {
  actor: Actor;
  reason: string;
}) {
  if (input.actor.role !== "admin") {
    throw new ImportDeletionError(
      "Administrator access is required.",
      "delete_forbidden",
    );
  }

  if (input.reason.trim().length < IMPORT_REASON_MIN_LENGTH) {
    throw new ImportDeletionError(
      `Deletion reason must be at least ${IMPORT_REASON_MIN_LENGTH} characters.`,
      "delete_reason_required",
    );
  }
}

export async function deleteDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  confirmation: string;
  reason: string;
}) {
  validateDeletionInput(input);
  try {
    await assertPermission(input.actor, "imports.delete");
  } catch {
    throw new ImportDeletionError(
      "You do not have permission to permanently delete imports.",
      "delete_forbidden",
    );
  }

  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        fileSizeBytes: dialerImportBatches.fileSizeBytes,
        importType: dialerImportBatches.importType,
        source: dialerImportBatches.source,
        dialerId: dialerImportBatches.dialerId,
        status: dialerImportBatches.status,
        uploadedById: dialerImportBatches.uploadedById,
        reportingStartDate: dialerImportBatches.reportingStartDate,
        reportingEndDate: dialerImportBatches.reportingEndDate,
        rowCount: dialerImportBatches.rowCount,
        storageProvider: dialerImportBatches.storageProvider,
        storageLocation: dialerImportBatches.storageLocation,
        storedFileBytes: sql<number>`octet_length(${dialerImportBatches.rawFileContent})`,
        createdAt: dialerImportBatches.createdAt,
        previousImportId: dialerImportBatches.previousImportId,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.batchId))
      .limit(1)
      .for("update");

    if (!batch) {
      throw new ImportDeletionError(
        "Import was not found or was already deleted.",
        "import_not_found",
      );
    }

    const versions = await tx
      .select({
        id: dialerDatasetVersions.id,
        importBatchId: dialerDatasetVersions.importBatchId,
        scopeKey: dialerDatasetVersions.scopeKey,
        source: dialerDatasetVersions.source,
        importType: dialerDatasetVersions.importType,
        reportingDate: dialerDatasetVersions.reportingDate,
        teamId: dialerDatasetVersions.teamId,
        dialerId: dialerDatasetVersions.dialerId,
        versionNumber: dialerDatasetVersions.versionNumber,
        status: dialerDatasetVersions.status,
        previousVersionId: dialerDatasetVersions.previousVersionId,
      })
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, batch.id))
      .orderBy(asc(dialerDatasetVersions.scopeKey))
      .for("update");
    const scopeKeys = Array.from(new Set(versions.map((version) => version.scopeKey)));
    const scopes =
      scopeKeys.length > 0
        ? await tx
            .select({
              scopeKey: dialerDatasetScopes.scopeKey,
              activeVersionId: dialerDatasetScopes.activeVersionId,
            })
            .from(dialerDatasetScopes)
            .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
            .orderBy(asc(dialerDatasetScopes.scopeKey))
            .for("update")
        : [];
    const versionIds = versions.map((version) => version.id);
    const [
      [metricCount],
      [stagingCount],
      [validationCount],
      [activeMetricCount],
      historicalVersions,
      ownershipPairs,
    ] = await Promise.all([
      tx
        .select({ count: sql<number>`count(*)` })
        .from(dialerAgentHourlyMetrics)
        .where(eq(dialerAgentHourlyMetrics.batchId, batch.id)),
      tx
        .select({ count: sql<number>`count(*)` })
        .from(dialerImportRows)
        .where(eq(dialerImportRows.batchId, batch.id)),
      tx
        .select({ count: sql<number>`count(*)` })
        .from(importErrors)
        .where(eq(importErrors.batchId, batch.id)),
      tx
        .select({ count: sql<number>`count(*)` })
        .from(dialerAgentHourlyMetrics)
        .innerJoin(
          dialerDatasetScopes,
          eq(
            dialerDatasetScopes.activeVersionId,
            dialerAgentHourlyMetrics.versionId,
          ),
        )
        .where(eq(dialerAgentHourlyMetrics.batchId, batch.id)),
      scopeKeys.length > 0
        ? tx
            .select({
              id: dialerDatasetVersions.id,
              importBatchId: dialerDatasetVersions.importBatchId,
              scopeKey: dialerDatasetVersions.scopeKey,
            })
            .from(dialerDatasetVersions)
            .where(
              and(
                inArray(dialerDatasetVersions.scopeKey, scopeKeys),
                inArray(
                  dialerDatasetVersions.status,
                  VALID_HISTORICAL_VERSION_STATUSES,
                ),
                ne(dialerDatasetVersions.importBatchId, batch.id),
              ),
            )
        : Promise.resolve([]),
      tx
        .select({
          metricBatchId: dialerAgentHourlyMetrics.batchId,
          versionBatchId: dialerDatasetVersions.importBatchId,
          count: sql<number>`count(*)`,
        })
        .from(dialerAgentHourlyMetrics)
        .leftJoin(
          dialerDatasetVersions,
          eq(dialerDatasetVersions.id, dialerAgentHourlyMetrics.versionId),
        )
        .where(
          or(
            eq(dialerAgentHourlyMetrics.batchId, batch.id),
            eq(dialerDatasetVersions.importBatchId, batch.id),
          ),
        )
        .groupBy(
          dialerAgentHourlyMetrics.batchId,
          dialerDatasetVersions.importBatchId,
        ),
    ]);
    const remainingHistoricalVersionsByScope = new Map<string, number>();

    for (const version of versions) {
      remainingHistoricalVersionsByScope.set(
        version.scopeKey,
        historicalVersions.filter(
          (historical) => historical.scopeKey === version.scopeKey,
        ).length,
      );
    }

    const assessment = evaluateImportDeletion({
      batch,
      hasDeletePermission: true,
      versions,
      activeVersionIds: new Set(
        scopes
          .map((scope) => scope.activeVersionId)
          .filter((id): id is string => Boolean(id)),
      ),
      activeMetricRowCount: Number(activeMetricCount?.count ?? 0),
      sharedMetricRowCount: ownershipPairs
        .filter(
          (pair) =>
            pair.metricBatchId === batch.id &&
            pair.versionBatchId !== batch.id,
        )
        .reduce((total, pair) => total + Number(pair.count), 0),
      remainingHistoricalVersionsByScope,
      metricRows: Number(metricCount?.count ?? 0),
      stagingRows: Number(stagingCount?.count ?? 0),
      validationRows: Number(validationCount?.count ?? 0),
    });

    if (!assessment.allowed) {
      throw new ImportDeletionError(
        assessment.reason ?? "Import cannot be deleted.",
        assessment.code ?? "delete_not_allowed",
      );
    }

    let activeTransition:
      | Awaited<ReturnType<typeof resolveActiveImportWithinTransaction>>
      | undefined;

    if (assessment.activeVersionCount > 0) {
      if (input.confirmation.trim() !== "DELETE ACTIVE IMPORT") {
        throw new ImportDeletionError(
          "Type DELETE ACTIVE IMPORT to confirm permanent deletion.",
          "delete_confirmation_required",
        );
      }
      try {
        activeTransition = await resolveActiveImportWithinTransaction(tx, {
          batch,
          resolution: { mode: "automatic_previous" },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
        ) {
          throw new ImportDeletionError(
            error instanceof Error
              ? error.message
              : "Active import resolution failed.",
            error.code,
          );
        }
        throw error;
      }
    } else if (input.confirmation.trim() !== "DELETE IMPORT") {
      throw new ImportDeletionError(
        "Type DELETE IMPORT to confirm permanent deletion.",
        "delete_confirmation_required",
      );
    }
    const fallbackAuditVersions =
      activeTransition?.replacementVersionIds.length
        ? await tx
            .select({
              id: dialerDatasetVersions.id,
              versionNumber: dialerDatasetVersions.versionNumber,
              scopeKey: dialerDatasetVersions.scopeKey,
              importBatchId: dialerDatasetVersions.importBatchId,
              fileName: dialerImportBatches.fileName,
              publishedAt: dialerImportBatches.publishedAt,
              createdAt: dialerImportBatches.createdAt,
            })
            .from(dialerDatasetVersions)
            .leftJoin(
              dialerImportBatches,
              eq(
                dialerImportBatches.id,
                dialerDatasetVersions.importBatchId,
              ),
            )
            .where(
              inArray(
                dialerDatasetVersions.id,
                activeTransition.replacementVersionIds,
              ),
            )
        : [];

    const retainedMetricWhere =
      versionIds.length > 0
        ? and(
            eq(dialerAgentHourlyMetrics.batchId, batch.id),
            isNotNull(dialerAgentHourlyMetrics.versionId),
            notInArray(dialerAgentHourlyMetrics.versionId, versionIds),
          )
        : and(
            eq(dialerAgentHourlyMetrics.batchId, batch.id),
            isNotNull(dialerAgentHourlyMetrics.versionId),
          );
    const retainedMetricGroups = await tx
      .select({
        versionId: dialerAgentHourlyMetrics.versionId,
        ownerBatchId: dialerDatasetVersions.importBatchId,
        count: sql<number>`count(*)`,
      })
      .from(dialerAgentHourlyMetrics)
      .innerJoin(
        dialerDatasetVersions,
        eq(dialerDatasetVersions.id, dialerAgentHourlyMetrics.versionId),
      )
      .where(retainedMetricWhere)
      .groupBy(
        dialerAgentHourlyMetrics.versionId,
        dialerDatasetVersions.importBatchId,
      );
    const sharedRecordsRetained = retainedMetricGroups.reduce(
      (total, group) => total + Number(group.count),
      0,
    );

    for (const group of retainedMetricGroups) {
      if (!group.versionId) continue;
      await tx
        .update(dialerAgentHourlyMetrics)
        .set({ batchId: group.ownerBatchId })
        .where(
          and(
            eq(dialerAgentHourlyMetrics.batchId, batch.id),
            eq(dialerAgentHourlyMetrics.versionId, group.versionId),
          ),
        );
    }

    const exclusiveMetricWhere =
      versionIds.length > 0
        ? or(
            inArray(dialerAgentHourlyMetrics.versionId, versionIds),
            and(
              eq(dialerAgentHourlyMetrics.batchId, batch.id),
              isNull(dialerAgentHourlyMetrics.versionId),
            ),
          )
        : and(
            eq(dialerAgentHourlyMetrics.batchId, batch.id),
            isNull(dialerAgentHourlyMetrics.versionId),
          );
    const [exclusiveMetricCount] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(dialerAgentHourlyMetrics)
      .where(exclusiveMetricWhere);
    const zeroReferenceMetricRowsDeleted = Number(
      exclusiveMetricCount?.count ?? 0,
    );

    for (const version of versions) {
      await tx
        .update(dialerDatasetVersions)
        .set({ previousVersionId: version.previousVersionId })
        .where(eq(dialerDatasetVersions.previousVersionId, version.id));
    }

    await tx
      .update(dialerImportBatches)
      .set({ previousImportId: batch.previousImportId })
      .where(eq(dialerImportBatches.previousImportId, batch.id));

    await tx
      .delete(dialerImportRows)
      .where(eq(dialerImportRows.batchId, batch.id));
    await tx.delete(importErrors).where(eq(importErrors.batchId, batch.id));
    await tx
      .delete(dialerAgentHourlyMetrics)
      .where(exclusiveMetricWhere);

    if (versionIds.length > 0) {
      await tx
        .delete(dialerDatasetVersions)
        .where(inArray(dialerDatasetVersions.id, versionIds));
    }

    const deletedAt = new Date();
    const reason = input.reason.trim();
    const deletedCounts = {
      ...assessment.counts,
      metricRows: zeroReferenceMetricRowsDeleted,
      totalRecords:
        zeroReferenceMetricRowsDeleted +
        assessment.counts.stagingRows +
        assessment.counts.validationRows +
        assessment.counts.versionRows +
        assessment.counts.importRecords,
    };
    const databaseStoredFile = batch.storageProvider === "database";
    const storedFileDeleted =
      databaseStoredFile && assessment.storedFilePresent;
    const storageCleanupPending =
      !databaseStoredFile && assessment.storedFilePresent;
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.deleted",
      entityType: "dialer_import_deletion",
      entityId: batch.id,
      metadata: {
        deletedImportId: batch.id,
        originalFileName: batch.fileName,
        importType: batch.importType,
        reportingStartDate: batch.reportingStartDate,
        reportingEndDate: batch.reportingEndDate,
        datasetScopes: versions.map((version) => ({
          scopeKey: version.scopeKey,
          source: version.source,
          importType: version.importType,
          reportingDate: version.reportingDate,
          teamId: version.teamId,
          dialerId: version.dialerId,
          versionNumber: version.versionNumber,
        })),
        deletedVersionNumbers: versions.map(
          (version) => version.versionNumber,
        ),
        previousStatus: batch.status,
        previousActiveStatus: assessment.activeVersionCount > 0,
        replacementVersionIds:
          activeTransition?.replacementVersionIds ?? [],
        replacementImportIds:
          activeTransition?.replacementImportIds ?? [],
        automaticallyActivatedFallbacks: fallbackAuditVersions.map(
          (fallback) => ({
            versionId: fallback.id,
            versionNumber: fallback.versionNumber,
            scopeKey: fallback.scopeKey,
            importBatchId: fallback.importBatchId,
            fileName: fallback.fileName,
            publishedAt: fallback.publishedAt?.toISOString() ?? null,
            uploadedAt: fallback.createdAt?.toISOString() ?? null,
          }),
        ),
        noActiveVersionSelected:
          activeTransition?.noActiveVersionSelected ?? false,
        sharedRecordsRetained,
        zeroReferenceMetricRowsDeleted,
        rowCount: batch.rowCount,
        uploadedByUserId: batch.uploadedById,
        deletedByAdministratorId: input.actor.id,
        deletionTimestamp: deletedAt.toISOString(),
        deletionReason: reason,
        storageProvider: batch.storageProvider,
        storageLocation: storageCleanupPending
          ? batch.storageLocation
          : undefined,
        storedFileDeleted,
        storedFileWasAlreadyMissing: !assessment.storedFilePresent,
        storageCleanupPending,
        deletedCounts,
      },
    });
    await tx
      .delete(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batch.id));

    return {
      deletedImportId: batch.id,
      storedFileDeleted,
      storedFileWasAlreadyMissing: !assessment.storedFilePresent,
      storageCleanupPending,
      sharedRecordsRetained,
      zeroReferenceMetricRowsDeleted,
      deletedCounts,
    };
  });
}
