import { eq } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  importErrors,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  previewDialerCsv,
  type ExistingDialerMetric,
  type SourceMapping,
} from "@/import/dialer";

export async function confirmDialerImport(input: {
  actor: Actor;
  source: string;
  fileName: string;
  fileContent: string;
  existingFileHashes: Set<string>;
  mappings: SourceMapping[];
  existingMetrics: ExistingDialerMetric[];
}) {
  const preview = previewDialerCsv(input);

  if (preview.duplicateFile) {
    throw new Error("Duplicate file blocked");
  }

  const invalidRows = preview.rows.filter((row) =>
    ["invalid", "unknown", "out_of_scope"].includes(row.status),
  );

  if (invalidRows.length > 0) {
    throw new Error("Import contains invalid, unknown, or out-of-scope rows");
  }

  const batchId = newId();
  await getDb().insert(dialerImportBatches).values({
    id: batchId,
    source: input.source,
    fileName: input.fileName,
    fileHash: preview.fileHash,
    status: "confirmed",
    uploadedById: input.actor.id,
    rowCount: preview.rows.length,
    previewSummary: preview.summary,
    confirmedAt: new Date(),
  });

  for (const row of preview.rows) {
    if (!row.metric || !row.rowHash) {
      await getDb().insert(importErrors).values({
        id: newId(),
        batchId,
        rowNumber: row.rowNumber,
        status: row.status,
        message: row.message ?? "Import row could not be confirmed.",
        rawRow: row.rawRow,
      });
      continue;
    }

    await getDb()
      .insert(dialerAgentHourlyMetrics)
      .values({
        id: newId(),
        source: row.metric.source,
        sourceAgentName: row.metric.sourceAgentName,
        agentProfileId: row.metric.agentProfileId,
        batchId,
        metricDate: row.metric.metricDate,
        metricHour: row.metric.metricHour,
        calls: row.metric.calls,
        loginTime: row.metric.loginTime,
        readyTime: row.metric.readyTime,
        talkTime: row.metric.talkTime,
        ringingTime: row.metric.ringingTime,
        wrapTime: row.metric.wrapTime,
        pausedTime: row.metric.pausedTime,
        idleTime: row.metric.idleTime,
        untrackedTime: row.metric.untrackedTime,
        rowHash: row.rowHash,
      })
      .onDuplicateKeyUpdate({
        set: {
          batchId,
          sourceAgentName: row.metric.sourceAgentName,
          calls: row.metric.calls,
          loginTime: row.metric.loginTime,
          readyTime: row.metric.readyTime,
          talkTime: row.metric.talkTime,
          ringingTime: row.metric.ringingTime,
          wrapTime: row.metric.wrapTime,
          pausedTime: row.metric.pausedTime,
          idleTime: row.metric.idleTime,
          untrackedTime: row.metric.untrackedTime,
          rowHash: row.rowHash,
        },
      });
  }

  await getDb().insert(auditLogs).values({
    id: newId(),
    actorProfileId: input.actor.id,
    action: "dialer_import.confirmed",
    entityType: "dialer_import_batch",
    entityId: batchId,
    metadata: preview.summary,
  });

  await getDb()
    .update(dialerImportBatches)
    .set({ status: "confirmed" })
    .where(eq(dialerImportBatches.id, batchId));

  return { batchId, preview };
}
