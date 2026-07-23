import { and, eq, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  importErrors,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  getImportConfirmationBlockReason,
  normalizeAgentName,
  previewDialerCsv,
  sha256,
  type ExistingDialerMetric,
  type ImportPreview,
  type SourceMapping,
} from "@/import/dialer";

export const PREVIEW_EXPIRATION_MS = 1000 * 60 * 30;

export type StoredImportPreview = {
  batchId: string;
  fileName: string;
  createdAt: Date;
  expiresAt: Date;
  preview: ImportPreview;
};

function previewSummary(preview: ImportPreview) {
  return {
    fileName: undefined,
    ...preview.fileSummary,
  };
}

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

function previewErrorRows(batchId: string, preview: ImportPreview) {
  return preview.rows
    .filter((row) => row.validationMessage)
    .map((row) => ({
      id: newId(),
      batchId,
      rowNumber: row.rowNumber,
      status: row.status,
      message: row.validationMessage ?? "Row is not importable.",
      rawRow: row.rawRow,
    }));
}

async function replacePreviewPersistence(
  tx: DbTransaction,
  input: {
    batchId: string;
    fileName: string;
    preview: ImportPreview;
  },
) {
  await tx
    .update(dialerImportBatches)
    .set({
      rowCount: input.preview.totalCsvRows,
      previewSummary: {
        ...previewSummary(input.preview),
        fileName: input.fileName,
      },
      detectedHeaders: input.preview.headers,
      missingRequiredHeaders: input.preview.missingHeaders,
    })
    .where(eq(dialerImportBatches.id, input.batchId));

  await tx.delete(importErrors).where(eq(importErrors.batchId, input.batchId));

  const errorRows = previewErrorRows(input.batchId, input.preview);

  if (errorRows.length > 0) {
    await tx.insert(importErrors).values(errorRows);
  }
}

async function getConfirmedFileHashes(source: string) {
  const rows = await getDb()
    .select({ fileHash: dialerImportBatches.fileHash })
    .from(dialerImportBatches)
    .where(
      and(
        eq(dialerImportBatches.source, source),
        eq(dialerImportBatches.status, "confirmed"),
      ),
    );

  return new Set(rows.map((row) => row.fileHash));
}

async function getMappings(source: string) {
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
        eq(teams.active, true),
      ),
    );
  const mappingByAgent = new Map<string, SourceMapping>();

  for (const mapping of rows) {
    const key = `${normalizeAgentName(mapping.sourceAgentName)}:${mapping.profileId}`;
    const current = mappingByAgent.get(key) ?? {
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

async function getExistingMetrics() {
  const rows = await getDb()
    .select({
      source: dialerAgentHourlyMetrics.source,
      agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
      metricDate: dialerAgentHourlyMetrics.metricDate,
      metricHour: dialerAgentHourlyMetrics.metricHour,
      rowHash: dialerAgentHourlyMetrics.rowHash,
    })
    .from(dialerAgentHourlyMetrics);

  return rows.map((row) => ({
    ...row,
    metricDate: String(row.metricDate),
  })) satisfies ExistingDialerMetric[];
}

export async function createDialerPreviewBatch(input: {
  actor: Actor;
  source: string;
  fileName: string;
  fileContent: string;
}) {
  const [existingFileHashes, mappings, existingMetrics] = await Promise.all([
    getConfirmedFileHashes(input.source),
    getMappings(input.source),
    getExistingMetrics(),
  ]);
  const preview = previewDialerCsv({
    ...input,
    existingFileHashes,
    mappings,
    existingMetrics,
  });
  const batchId = newId();
  const expiresAt = new Date(Date.now() + PREVIEW_EXPIRATION_MS);

  await getDb().transaction(async (tx) => {
    await tx.insert(dialerImportBatches).values({
      id: batchId,
      source: input.source,
      fileName: input.fileName,
      fileHash: preview.fileHash,
      status: "previewed",
      uploadedById: input.actor.id,
      rowCount: preview.totalCsvRows,
      previewSummary: {
        ...previewSummary(preview),
        fileName: input.fileName,
      },
      detectedHeaders: preview.headers,
      missingRequiredHeaders: preview.missingHeaders,
      rawFileContent: input.fileContent,
      expiresAt,
    });

    await replacePreviewPersistence(tx, {
      batchId,
      fileName: input.fileName,
      preview,
    });

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: preview.duplicateFile
        ? "dialer_import.duplicate_blocked"
        : "dialer_import.preview_created",
      entityType: "dialer_import_batch",
      entityId: batchId,
      metadata: {
        ...previewSummary(preview),
        fileName: input.fileName,
        fileHash: preview.fileHash,
      },
    });
  });

  return { batchId, preview };
}

export async function getStoredImportPreview(input: {
  actor: Actor;
  batchId: string;
}) {
  const rows = await getDb()
    .select()
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, input.batchId))
    .limit(1);
  const batch = rows[0];

  if (
    !batch ||
    batch.status !== "previewed" ||
    (input.actor.role !== "admin" && batch.uploadedById !== input.actor.id) ||
    batch.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const [existingFileHashes, mappings, existingMetrics] = await Promise.all([
    getConfirmedFileHashes(batch.source),
    getMappings(batch.source),
    getExistingMetrics(),
  ]);
  const preview = previewDialerCsv({
    source: batch.source,
    fileContent: batch.rawFileContent,
    existingFileHashes,
    mappings,
    existingMetrics,
    actor: input.actor,
  });

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: dialerImportBatches.id,
        status: dialerImportBatches.status,
        uploadedById: dialerImportBatches.uploadedById,
        expiresAt: dialerImportBatches.expiresAt,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batch.id))
      .limit(1)
      .for("update");
    const lockedBatch = rows[0];

    if (
      !lockedBatch ||
      lockedBatch.status !== "previewed" ||
      (input.actor.role !== "admin" && lockedBatch.uploadedById !== input.actor.id) ||
      lockedBatch.expiresAt.getTime() <= Date.now()
    ) {
      return;
    }

    await replacePreviewPersistence(tx, {
      batchId: batch.id,
      fileName: batch.fileName,
      preview,
    });
  });

  return {
    batchId: batch.id,
    fileName: batch.fileName,
    createdAt: batch.createdAt,
    expiresAt: batch.expiresAt,
    preview,
  } satisfies StoredImportPreview;
}

export async function confirmDialerImportBatch(input: {
  actor: Actor;
  batchId: string;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const batchRows = await tx
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, input.batchId))
      .limit(1);
    const batch = batchRows[0];

    if (!batch || batch.status !== "previewed") {
      throw new Error("Preview import batch was not found.");
    }

    if (input.actor.role !== "admin" && batch.uploadedById !== input.actor.id) {
      throw new Error("Preview import batch does not belong to this uploader.");
    }

    if (batch.expiresAt.getTime() <= Date.now()) {
      throw new Error("Preview import batch expired. Upload the file again.");
    }

    const fileHash = sha256(batch.rawFileContent);

    if (fileHash !== batch.fileHash) {
      throw new Error("Preview import file hash verification failed.");
    }

    const hashRows = await tx
      .select({ fileHash: dialerImportBatches.fileHash })
      .from(dialerImportBatches)
      .where(
        and(
          eq(dialerImportBatches.source, batch.source),
          eq(dialerImportBatches.status, "confirmed"),
        ),
      );
    const mappingRows = await tx
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
          eq(sourceUserMappings.source, batch.source),
          eq(sourceUserMappings.active, true),
          isNull(teamMemberships.endedAt),
          eq(teams.active, true),
        ),
      );
    const metricRows = await tx
      .select({
        source: dialerAgentHourlyMetrics.source,
        agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
        metricDate: dialerAgentHourlyMetrics.metricDate,
        metricHour: dialerAgentHourlyMetrics.metricHour,
        rowHash: dialerAgentHourlyMetrics.rowHash,
      })
      .from(dialerAgentHourlyMetrics);
    const mappingByAgent = new Map<string, SourceMapping>();

    for (const mapping of mappingRows) {
      const key = `${normalizeAgentName(mapping.sourceAgentName)}:${mapping.profileId}`;
      const current = mappingByAgent.get(key) ?? {
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

    const preview = previewDialerCsv({
      source: batch.source,
      fileContent: batch.rawFileContent,
      existingFileHashes: new Set(hashRows.map((row) => row.fileHash)),
      mappings: Array.from(mappingByAgent.values()),
      existingMetrics: metricRows.map((row) => ({
        ...row,
        metricDate: String(row.metricDate),
      })),
      actor: input.actor,
    });
    const blockReason = getImportConfirmationBlockReason(preview);

    if (blockReason) {
      throw new Error(blockReason);
    }

    await replacePreviewPersistence(tx, {
      batchId: batch.id,
      fileName: batch.fileName,
      preview,
    });

    for (const row of preview.rows) {
      if (!row.importable) {
        continue;
      }

      if (!row.metric || !row.rowHash) {
        throw new Error("Importable preview row is missing metric data.");
      }

      await tx
        .insert(dialerAgentHourlyMetrics)
        .values({
          id: newId(),
          source: row.metric.source,
          sourceAgentName: row.metric.sourceAgentName,
          agentProfileId: row.metric.agentProfileId,
          batchId: batch.id,
          metricDate: row.metric.metricDate,
          metricHour: row.metric.metricHour,
          calls: row.metric.calls,
          loggedInSeconds: row.metric.loggedInSeconds,
          readySeconds: row.metric.readySeconds,
          talkSeconds: row.metric.talkSeconds,
          ringingSeconds: row.metric.ringingSeconds,
          wrapSeconds: row.metric.wrapSeconds,
          pausedSeconds: row.metric.pausedSeconds,
          idleSeconds: row.metric.idleSeconds,
          untrackedSeconds: row.metric.untrackedSeconds,
          teamIdSnapshot: row.metric.teamIdSnapshot,
          teamNameSnapshot: row.metric.teamNameSnapshot,
          rowHash: row.rowHash,
        })
        .onDuplicateKeyUpdate({
          set: {
            batchId: batch.id,
            sourceAgentName: row.metric.sourceAgentName,
            calls: row.metric.calls,
            loggedInSeconds: row.metric.loggedInSeconds,
            readySeconds: row.metric.readySeconds,
            talkSeconds: row.metric.talkSeconds,
            ringingSeconds: row.metric.ringingSeconds,
            wrapSeconds: row.metric.wrapSeconds,
            pausedSeconds: row.metric.pausedSeconds,
            idleSeconds: row.metric.idleSeconds,
            untrackedSeconds: row.metric.untrackedSeconds,
            rowHash: row.rowHash,
          },
        });
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "dialer_import.confirmed",
      entityType: "dialer_import_batch",
      entityId: batch.id,
      metadata: {
        ...previewSummary(preview),
        fileName: batch.fileName,
        fileHash: preview.fileHash,
      },
    });

    await tx
      .update(dialerImportBatches)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(dialerImportBatches.id, batch.id));

    return { batchId: batch.id, preview };
  });
}
