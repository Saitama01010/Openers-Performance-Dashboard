import "server-only";

import { and, asc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  emailOutbox,
  importErrors,
  passwordResetTokens,
  profiles,
  rateLimitRecords,
  sessions,
  userImportBatches,
} from "@/db/schema";
import { getEnv } from "@/env";
import { newId } from "@/lib/ids";
import { logOperationalEvent } from "@/lib/logging";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type CleanupCounts = {
  sessions: number;
  invitationTokens: number;
  resetTokens: number;
  rateLimits: number;
  userImportPreviews: number;
  ephemeralImports: number;
  rawCsvPayloads: number;
  emailOutboxMessages: number;
  auditLogs: 0;
};

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS);
}

export async function runRetentionCleanup(input: {
  dryRun?: boolean;
  now?: Date;
  organizationId?: string;
  batchSize?: number;
} = {}) {
  const env = getEnv();
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? true;
  const batchSize = Math.min(
    env.CLEANUP_BATCH_SIZE,
    Math.max(1, input.batchSize ?? env.CLEANUP_BATCH_SIZE),
  );
  const sessionCutoff = cutoff(now, env.SESSION_RETENTION_DAYS);
  const tokenCutoff = cutoff(now, env.AUTH_TOKEN_RETENTION_DAYS);
  const outboxCutoff = tokenCutoff;
  const failedImportCutoff = cutoff(now, env.FAILED_IMPORT_RETENTION_DAYS);
  const draftImportCutoff = cutoff(now, env.DRAFT_IMPORT_RETENTION_DAYS);
  const db = getDb();

  const sessionIds = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.profileId))
    .where(
      and(
        or(
          lt(sessions.expiresAt, sessionCutoff),
          and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, sessionCutoff)),
        ),
        input.organizationId
          ? eq(profiles.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(sessions.expiresAt))
    .limit(batchSize);
  const invitationIds = await db
    .select({ id: accountInvitationTokens.id })
    .from(accountInvitationTokens)
    .innerJoin(profiles, eq(profiles.id, accountInvitationTokens.profileId))
    .where(
      and(
        lt(accountInvitationTokens.expiresAt, tokenCutoff),
        or(isNotNull(accountInvitationTokens.usedAt), isNotNull(accountInvitationTokens.revokedAt)),
        input.organizationId
          ? eq(profiles.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(accountInvitationTokens.expiresAt))
    .limit(batchSize);
  const resetIds = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .innerJoin(profiles, eq(profiles.id, passwordResetTokens.profileId))
    .where(
      and(
        lt(passwordResetTokens.expiresAt, tokenCutoff),
        or(isNotNull(passwordResetTokens.usedAt), isNotNull(passwordResetTokens.revokedAt)),
        input.organizationId
          ? eq(profiles.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(passwordResetTokens.expiresAt))
    .limit(batchSize);
  const rateLimitIds = await db
    .select({ id: rateLimitRecords.id })
    .from(rateLimitRecords)
    .where(lt(rateLimitRecords.expiresAt, now))
    .orderBy(asc(rateLimitRecords.expiresAt))
    .limit(batchSize);
  const userImportIds = await db
    .select({ id: userImportBatches.id })
    .from(userImportBatches)
    .where(
      and(
        lt(userImportBatches.expiresAt, now),
        sql`${userImportBatches.status} <> 'confirmed'`,
        input.organizationId
          ? eq(userImportBatches.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(userImportBatches.expiresAt))
    .limit(batchSize);
  const rawCsvIds = await db
    .select({ id: dialerImportBatches.id })
    .from(dialerImportBatches)
    .where(
      and(
        isNotNull(dialerImportBatches.rawFileContent),
        isNotNull(dialerImportBatches.rawFileRetainUntil),
        lt(dialerImportBatches.rawFileRetainUntil, now),
        sql`${dialerImportBatches.status} not in ('uploaded', 'processing', 'draft', 'ready_to_publish')`,
        input.organizationId
          ? eq(dialerImportBatches.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(dialerImportBatches.rawFileRetainUntil))
    .limit(batchSize);
  const ephemeralImportIds = await db
    .select({ id: dialerImportBatches.id })
    .from(dialerImportBatches)
    .where(
      and(
        or(
          and(
            sql`${dialerImportBatches.status} in ('failed', 'rejected', 'validation_failed')`,
            lt(dialerImportBatches.createdAt, failedImportCutoff),
          ),
          and(
            sql`${dialerImportBatches.status} in ('uploaded', 'draft', 'ready_to_publish')`,
            lt(dialerImportBatches.createdAt, draftImportCutoff),
          ),
        ),
        input.organizationId
          ? eq(dialerImportBatches.organizationId, input.organizationId)
          : sql`true`,
        sql`not exists (
          select 1 from ${dialerDatasetVersions} versions
          inner join ${dialerDatasetScopes} scopes on scopes.active_version_id = versions.id
          where versions.import_batch_id = ${dialerImportBatches.id}
        )`,
      ),
    )
    .orderBy(asc(dialerImportBatches.createdAt))
    .limit(batchSize);
  const outboxIds = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        sql`${emailOutbox.status} in ('sent', 'failed', 'cancelled')`,
        lt(emailOutbox.updatedAt, outboxCutoff),
        input.organizationId
          ? eq(emailOutbox.organizationId, input.organizationId)
          : sql`true`,
      ),
    )
    .orderBy(asc(emailOutbox.updatedAt))
    .limit(batchSize);

  const counts: CleanupCounts = {
    sessions: sessionIds.length,
    invitationTokens: invitationIds.length,
    resetTokens: resetIds.length,
    rateLimits: rateLimitIds.length,
    userImportPreviews: userImportIds.length,
    ephemeralImports: ephemeralImportIds.length,
    rawCsvPayloads: rawCsvIds.length,
    emailOutboxMessages: outboxIds.length,
    auditLogs: 0,
  };

  if (!dryRun) {
    await db.transaction(async (tx) => {
      if (sessionIds.length) await tx.delete(sessions).where(inArray(sessions.id, sessionIds.map((row) => row.id)));
      if (invitationIds.length) await tx.delete(accountInvitationTokens).where(inArray(accountInvitationTokens.id, invitationIds.map((row) => row.id)));
      if (resetIds.length) await tx.delete(passwordResetTokens).where(inArray(passwordResetTokens.id, resetIds.map((row) => row.id)));
      if (rateLimitIds.length) await tx.delete(rateLimitRecords).where(inArray(rateLimitRecords.id, rateLimitIds.map((row) => row.id)));
      if (userImportIds.length) await tx.delete(userImportBatches).where(inArray(userImportBatches.id, userImportIds.map((row) => row.id)));
      if (rawCsvIds.length) {
        await tx
          .update(dialerImportBatches)
          .set({ rawFileContent: null, rawFilePurgedAt: now })
          .where(inArray(dialerImportBatches.id, rawCsvIds.map((row) => row.id)));
      }
      if (ephemeralImportIds.length) {
        const ids = ephemeralImportIds.map((row) => row.id);
        await tx.delete(dialerAgentHourlyMetrics).where(inArray(dialerAgentHourlyMetrics.batchId, ids));
        await tx.delete(dialerImportRows).where(inArray(dialerImportRows.batchId, ids));
        await tx.delete(importErrors).where(inArray(importErrors.batchId, ids));
        await tx.delete(dialerDatasetVersions).where(inArray(dialerDatasetVersions.importBatchId, ids));
        await tx.delete(dialerImportBatches).where(inArray(dialerImportBatches.id, ids));
      }
      if (outboxIds.length) await tx.delete(emailOutbox).where(inArray(emailOutbox.id, outboxIds.map((row) => row.id)));
      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: input.organizationId ?? null,
        action: "system.retention_cleanup",
        entityType: "system",
        metadata: { dryRun: false, counts, batchSize },
      });
    });
  }

  logOperationalEvent({
    action: "cleanup.completed",
    organizationId: input.organizationId,
    details: { dryRun, counts, batchSize },
  });
  return { dryRun, counts, batchSize };
}
