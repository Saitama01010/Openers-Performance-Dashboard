import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertPermission, hasPermission } from "@/auth/permissions";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
} from "@/db/schema";
import { IMPORT_REASON_MIN_LENGTH } from "@/import/config";
import { newId } from "@/lib/ids";
import { actorOrganizationId } from "@/teams/visibility";

const VALID_FALLBACK_STATUSES = [
  "superseded",
  "rolled_back",
  "deactivated",
] as const;

type DialerTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export type ActiveImportResolution = {
  mode: "previous" | "selected" | "none" | "automatic_previous";
  fallbackBatchId?: string | null;
};

export type AutomaticFallbackOption = {
  scopeKey: string;
  versionId: string;
  versionNumber: number;
  batchId: string;
  fileName: string;
  uploadedAt: Date;
  publishedAt: Date | null;
};

export type ImportFallbackOption = {
  batchId: string;
  fileName: string;
  status: string;
  uploadedAt: Date;
  versionCount: number;
};

export type ActiveImportLifecycleOptions = {
  isActive: boolean;
  activeVersionCount: number;
  canDeactivate: boolean;
  canDelete: boolean;
  previousAvailable: boolean;
  automaticFallbacks: AutomaticFallbackOption[];
  activeVersions: Array<{
    scopeKey: string;
    versionNumber: number;
  }>;
  fallbackOptions: ImportFallbackOption[];
  totals: {
    calls: number;
    loggedInSeconds: number;
    talkSeconds: number;
    wrapSeconds: number;
  };
};

export type ActiveImportTransition = {
  batchId: string;
  previousStatus: string;
  previousActiveVersionIds: string[];
  replacementVersionIds: string[];
  replacementImportIds: string[];
  noActiveVersionSelected: boolean;
  datasetScopes: Array<{
    scopeKey: string;
    source: string;
    importType: string;
    reportingDate: string;
    teamId: string | null;
    dialerId: string | null;
  }>;
};

export class ActiveImportLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ActiveImportLifecycleError";
  }
}

function validateReason(reason: string) {
  const normalized = reason.trim();

  if (normalized.length < IMPORT_REASON_MIN_LENGTH) {
    throw new ActiveImportLifecycleError(
      `Reason must be at least ${IMPORT_REASON_MIN_LENGTH} characters.`,
      "deactivation_reason_required",
    );
  }

  return normalized;
}

export async function getActiveImportLifecycleOptions(
  actor: Actor,
  batchId: string,
): Promise<ActiveImportLifecycleOptions> {
  const [canDeactivate, canDelete, ownedVersions] = await Promise.all([
    actor.role === "admin"
      ? hasPermission(actor, "imports.deactivate")
      : Promise.resolve(false),
    actor.role === "admin"
      ? hasPermission(actor, "imports.delete")
      : Promise.resolve(false),
    getDb()
      .select({
        id: dialerDatasetVersions.id,
        scopeKey: dialerDatasetVersions.scopeKey,
        previousVersionId: dialerDatasetVersions.previousVersionId,
        versionNumber: dialerDatasetVersions.versionNumber,
        activeVersionId: dialerDatasetScopes.activeVersionId,
        calls: dialerDatasetVersions.totalCalls,
        loggedInSeconds: dialerDatasetVersions.totalLoggedInSeconds,
        talkSeconds: dialerDatasetVersions.totalTalkSeconds,
        wrapSeconds: dialerDatasetVersions.totalWrapSeconds,
      })
      .from(dialerDatasetVersions)
      .leftJoin(
        dialerDatasetScopes,
        eq(dialerDatasetScopes.scopeKey, dialerDatasetVersions.scopeKey),
      )
      .where(eq(dialerDatasetVersions.importBatchId, batchId)),
  ]);
  const activeVersions = ownedVersions.filter(
    (version) => version.activeVersionId === version.id,
  );
  const scopeKeys = activeVersions.map((version) => version.scopeKey);

  if (scopeKeys.length === 0) {
    return {
      isActive: false,
      activeVersionCount: 0,
      canDeactivate,
      canDelete,
      previousAvailable: false,
      automaticFallbacks: [],
      activeVersions: [],
      fallbackOptions: [],
      totals: { calls: 0, loggedInSeconds: 0, talkSeconds: 0, wrapSeconds: 0 },
    };
  }

  const candidates = await getDb()
    .select({
      id: dialerDatasetVersions.id,
      importBatchId: dialerDatasetVersions.importBatchId,
      scopeKey: dialerDatasetVersions.scopeKey,
      status: dialerDatasetVersions.status,
      versionNumber: dialerDatasetVersions.versionNumber,
      fileName: dialerImportBatches.fileName,
      batchStatus: dialerImportBatches.status,
      uploadedAt: dialerImportBatches.createdAt,
      publishedAt: dialerImportBatches.publishedAt,
    })
    .from(dialerDatasetVersions)
    .innerJoin(
      dialerImportBatches,
      eq(dialerImportBatches.id, dialerDatasetVersions.importBatchId),
    )
    .where(
      and(
        inArray(dialerDatasetVersions.scopeKey, scopeKeys),
        inArray(dialerDatasetVersions.status, VALID_FALLBACK_STATUSES),
      ),
    )
    .orderBy(
      asc(dialerDatasetVersions.scopeKey),
      desc(dialerDatasetVersions.versionNumber),
    );
  const optionsByBatch = new Map<string, typeof candidates>();

  for (const candidate of candidates) {
    if (!candidate.importBatchId || candidate.importBatchId === batchId) {
      continue;
    }
    const rows = optionsByBatch.get(candidate.importBatchId) ?? [];
    rows.push(candidate);
    optionsByBatch.set(candidate.importBatchId, rows);
  }

  const fallbackOptions = Array.from(optionsByBatch.entries())
    .filter(([, versions]) =>
      scopeKeys.every((scopeKey) =>
        versions.some((version) => version.scopeKey === scopeKey),
      ),
    )
    .map(([candidateBatchId, versions]) => ({
      batchId: candidateBatchId,
      fileName: versions[0].fileName,
      status: versions[0].batchStatus,
      uploadedAt: versions[0].uploadedAt,
      versionCount: scopeKeys.length,
    }))
    .sort(
      (left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime(),
    );
  const automaticFallbacks = activeVersions.flatMap((activeVersion) => {
    const fallback = candidates.find(
      (candidate) =>
        candidate.scopeKey === activeVersion.scopeKey &&
        candidate.importBatchId !== batchId &&
        candidate.versionNumber < activeVersion.versionNumber,
    );

    return fallback?.importBatchId
      ? [
          {
            scopeKey: activeVersion.scopeKey,
            versionId: fallback.id,
            versionNumber: fallback.versionNumber,
            batchId: fallback.importBatchId,
            fileName: fallback.fileName,
            uploadedAt: fallback.uploadedAt,
            publishedAt: fallback.publishedAt,
          },
        ]
      : [];
  });

  return {
    isActive: true,
    activeVersionCount: activeVersions.length,
    canDeactivate,
    canDelete,
    previousAvailable: scopeKeys.every((scopeKey) =>
      automaticFallbacks.some((fallback) => fallback.scopeKey === scopeKey),
    ),
    automaticFallbacks,
    activeVersions: activeVersions.map((version) => ({
      scopeKey: version.scopeKey,
      versionNumber: version.versionNumber,
    })),
    fallbackOptions,
    totals: activeVersions.reduce(
      (totals, version) => ({
        calls: totals.calls + version.calls,
        loggedInSeconds: totals.loggedInSeconds + version.loggedInSeconds,
        talkSeconds: totals.talkSeconds + version.talkSeconds,
        wrapSeconds: totals.wrapSeconds + version.wrapSeconds,
      }),
      { calls: 0, loggedInSeconds: 0, talkSeconds: 0, wrapSeconds: 0 },
    ),
  };
}

async function selectReplacementVersions(
  tx: DialerTransaction,
  batchId: string,
  activeVersions: Array<{
    id: string;
    scopeKey: string;
    versionNumber: number;
  }>,
  resolution: ActiveImportResolution,
) {
  if (resolution.mode === "none") {
    return [];
  }

  const scopeKeys = activeVersions.map((version) => version.scopeKey);
  const where =
    resolution.mode === "selected"
      ? and(
          inArray(dialerDatasetVersions.scopeKey, scopeKeys),
          eq(
            dialerDatasetVersions.importBatchId,
            resolution.fallbackBatchId ?? "",
          ),
          inArray(dialerDatasetVersions.status, VALID_FALLBACK_STATUSES),
        )
      : and(
          inArray(dialerDatasetVersions.scopeKey, scopeKeys),
          inArray(dialerDatasetVersions.status, VALID_FALLBACK_STATUSES),
        );
  const candidates = await tx
    .select()
    .from(dialerDatasetVersions)
    .where(where)
    .orderBy(
      asc(dialerDatasetVersions.scopeKey),
      desc(dialerDatasetVersions.versionNumber),
    )
    .for("update");
  const replacements = activeVersions.map((activeVersion) =>
    candidates.find(
      (candidate) =>
        candidate.scopeKey === activeVersion.scopeKey &&
        candidate.importBatchId !== batchId &&
        (resolution.mode === "selected" ||
          candidate.versionNumber < activeVersion.versionNumber),
    ),
  );

  if (
    resolution.mode === "selected" &&
    !resolution.fallbackBatchId?.trim()
  ) {
    throw new ActiveImportLifecycleError(
      "Select a historical import to activate.",
      "fallback_required",
    );
  }

  if (
    resolution.mode !== "automatic_previous" &&
    replacements.some((replacement) => !replacement)
  ) {
    throw new ActiveImportLifecycleError(
      resolution.mode === "previous"
        ? "A previous valid version is unavailable for one or more dataset scopes."
        : "The selected import does not contain a valid version for every exact dataset scope.",
      "invalid_fallback_scope",
    );
  }

  return replacements.filter(
    (replacement): replacement is NonNullable<typeof replacement> =>
      Boolean(replacement),
  );
}

export async function resolveActiveImportWithinTransaction(
  tx: DialerTransaction,
  input: {
    batch: {
      id: string;
      status: string;
    };
    resolution: ActiveImportResolution;
  },
): Promise<ActiveImportTransition> {
  const versions = await tx
    .select()
    .from(dialerDatasetVersions)
    .where(eq(dialerDatasetVersions.importBatchId, input.batch.id))
    .orderBy(asc(dialerDatasetVersions.scopeKey))
    .for("update");
  const scopeKeys = versions.map((version) => version.scopeKey);
  const scopes =
    scopeKeys.length > 0
      ? await tx
          .select()
          .from(dialerDatasetScopes)
          .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys))
          .orderBy(asc(dialerDatasetScopes.scopeKey))
          .for("update")
      : [];
  const activeVersions = versions.filter((version) =>
    scopes.some(
      (scope) =>
        scope.scopeKey === version.scopeKey &&
        scope.activeVersionId === version.id,
    ),
  );

  if (activeVersions.length === 0) {
    throw new ActiveImportLifecycleError(
      "The selected import is no longer active.",
      "import_not_active",
    );
  }

  const replacements = await selectReplacementVersions(
    tx,
    input.batch.id,
    activeVersions,
    input.resolution,
  );
  const now = new Date();

  for (const activeVersion of activeVersions) {
    const scope = scopes.find(
      (candidate) => candidate.scopeKey === activeVersion.scopeKey,
    );
    const replacement = replacements.find(
      (candidate) => candidate.scopeKey === activeVersion.scopeKey,
    );

    if (!scope || scope.activeVersionId !== activeVersion.id) {
      throw new ActiveImportLifecycleError(
        "The active dataset changed while the request was running.",
        "active_import_changed",
      );
    }

    await tx
      .update(dialerDatasetVersions)
      .set({ status: "deactivated", supersededAt: now })
      .where(eq(dialerDatasetVersions.id, activeVersion.id));

    if (replacement) {
      await tx
        .update(dialerDatasetVersions)
        .set({ status: "active", activatedAt: now, supersededAt: null })
        .where(eq(dialerDatasetVersions.id, replacement.id));
    }

    await tx
      .update(dialerDatasetScopes)
      .set({
        activeVersionId: replacement?.id ?? null,
        revision: sql`${dialerDatasetScopes.revision} + 1`,
      })
      .where(eq(dialerDatasetScopes.scopeKey, activeVersion.scopeKey));
  }

  await tx
    .update(dialerImportBatches)
    .set({ status: "deactivated" })
    .where(eq(dialerImportBatches.id, input.batch.id));

  const replacementImportIds = Array.from(
    new Set(
      replacements
        .map((replacement) => replacement.importBatchId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (replacementImportIds.length > 0) {
    await tx
      .update(dialerImportBatches)
      .set({ status: "active" })
      .where(inArray(dialerImportBatches.id, replacementImportIds));
  }

  return {
    batchId: input.batch.id,
    previousStatus: input.batch.status,
    previousActiveVersionIds: activeVersions.map((version) => version.id),
    replacementVersionIds: replacements.map((version) => version.id),
    replacementImportIds,
    noActiveVersionSelected: replacements.length < activeVersions.length,
    datasetScopes: activeVersions.map((version) => ({
      scopeKey: version.scopeKey,
      source: version.source,
      importType: version.importType,
      reportingDate: version.reportingDate,
      teamId: version.teamId,
      dialerId: version.dialerId,
    })),
  };
}

export async function deactivateDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
  reason: string;
  resolution: ActiveImportResolution;
}) {
  if (input.actor.role !== "admin") {
    throw new ActiveImportLifecycleError(
      "Administrator access is required.",
      "deactivate_forbidden",
    );
  }
  validateReason(input.reason);

  try {
    await assertPermission(input.actor, "imports.deactivate");
    if (input.resolution.mode !== "none") {
      await assertPermission(input.actor, "imports.restore");
    }
  } catch {
    throw new ActiveImportLifecycleError(
      "You do not have permission to deactivate or restore imports.",
      "deactivate_forbidden",
    );
  }

  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        status: dialerImportBatches.status,
      })
      .from(dialerImportBatches)
      .where(and(
        eq(dialerImportBatches.id, input.batchId),
        eq(
          dialerImportBatches.organizationId,
          actorOrganizationId(input.actor),
        ),
      ))
      .limit(1)
      .for("update");

    if (!batch) {
      throw new ActiveImportLifecycleError(
        "Import was not found.",
        "import_not_found",
      );
    }

    const transition = await resolveActiveImportWithinTransaction(tx, {
      batch,
      resolution: input.resolution,
    });
    const now = new Date();

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.deactivated",
      entityType: "dialer_import_batch",
      entityId: batch.id,
      metadata: {
        importId: batch.id,
        fileName: batch.fileName,
        datasetScopes: transition.datasetScopes,
        previousStatus: transition.previousStatus,
        newStatus: "deactivated",
        previousActiveVersionIds: transition.previousActiveVersionIds,
        newActiveVersionIds: transition.replacementVersionIds,
        replacementImportIds: transition.replacementImportIds,
        noActiveVersionSelected: transition.noActiveVersionSelected,
        administratorId: input.actor.id,
        reason: input.reason.trim(),
        timestamp: now.toISOString(),
      },
    });

    return transition;
  });
}
