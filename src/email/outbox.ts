import "server-only";

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  emailDeliveryAttempts,
  emailOutbox,
} from "@/db/schema";
import { getEnv } from "@/env";
import {
  accessRevokedEmail,
  deliverEmail,
  invitationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  type TransactionalEmail,
} from "@/email/provider";
import {
  decryptOutboxPayload,
  encryptOutboxPayload,
} from "@/email/outbox-crypto";
import { newId } from "@/lib/ids";
import { logOperationalEvent, logServerError } from "@/lib/logging";
import { actorOrganizationId } from "@/teams/visibility";

const payloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("account_invitation"), name: z.string().max(255), token: z.string().min(1).max(512), tokenId: z.string().uuid(), resent: z.boolean() }).strict(),
  z.object({ kind: z.literal("password_reset"), name: z.string().max(255), token: z.string().min(1).max(512), tokenId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("password_changed"), name: z.string().max(255) }).strict(),
  z.object({ kind: z.literal("access_revoked"), name: z.string().max(255) }).strict(),
]);

export type OutboxPayload = z.infer<typeof payloadSchema>;

type OutboxTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export async function enqueueEmailOutbox(
  database: ReturnType<typeof getDb> | OutboxTransaction,
  input: {
    organizationId?: string | null;
    profileId?: string | null;
    referenceId?: string | null;
    recipientEmail: string;
    messageType: string;
    idempotencyKey: string;
    payload: OutboxPayload;
  },
) {
  const id = newId();
  await database
    .insert(emailOutbox)
    .values({
      id,
      organizationId: input.organizationId ?? null,
      profileId: input.profileId ?? null,
      referenceId: input.referenceId ?? null,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      messageType: input.messageType,
      idempotencyKey: input.idempotencyKey,
      encryptedPayload: encryptOutboxPayload(input.payload),
      status: "queued",
    })
    .onDuplicateKeyUpdate({
      set: { idempotencyKey: sql`${emailOutbox.idempotencyKey}` },
    });
  const [persisted] = await database
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(eq(emailOutbox.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!persisted) {
    throw new Error("Queued email intent could not be resolved.");
  }
  logOperationalEvent({
    action: "email.queued",
    organizationId: input.organizationId,
    actorId: input.profileId,
    entityId: persisted.id,
    details: { messageType: input.messageType },
  });
  return persisted.id;
}

class PermanentOutboxError extends Error {}

function messageFor(row: typeof emailOutbox.$inferSelect): TransactionalEmail {
  if (!row.encryptedPayload) throw new PermanentOutboxError("Queued email payload is unavailable.");
  let payload: OutboxPayload;
  try {
    payload = payloadSchema.parse(decryptOutboxPayload(row.encryptedPayload));
  } catch {
    throw new PermanentOutboxError("Queued email payload is invalid.");
  }
  switch (payload.kind) {
    case "account_invitation":
      return invitationEmail({
        email: row.recipientEmail,
        name: payload.name,
        token: payload.token,
        tokenId: payload.tokenId,
        resent: payload.resent,
      });
    case "password_reset":
      return passwordResetEmail({
        email: row.recipientEmail,
        name: payload.name,
        token: payload.token,
        tokenId: payload.tokenId,
      });
    case "password_changed":
      return passwordChangedEmail({ email: row.recipientEmail, name: payload.name });
    case "access_revoked":
      return accessRevokedEmail({ email: row.recipientEmail, name: payload.name });
  }
}

export async function claimNextEmail(
  workerId: string,
  now = new Date(),
  messageId?: string,
) {
  const leaseExpiresAt = new Date(
    now.getTime() + getEnv().EMAIL_WORKER_LEASE_SECONDS * 1_000,
  );
  return getDb().transaction(async (tx) => {
    const [exhausted] = await tx
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, "processing"),
          lte(emailOutbox.leaseExpiresAt, now),
          sql`${emailOutbox.attemptCount} >= ${emailOutbox.maxAttempts}`,
          messageId ? eq(emailOutbox.id, messageId) : undefined,
        ),
      )
      .orderBy(asc(emailOutbox.leaseExpiresAt), asc(emailOutbox.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (exhausted) {
      await tx
        .update(emailOutbox)
        .set({
          status: "failed",
          failedAt: now,
          failureCode: "retry_exhausted",
          failureReason: "Email delivery stopped after the retry limit.",
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(eq(emailOutbox.id, exhausted.id));
      await tx.insert(emailDeliveryAttempts).values({
        id: newId(),
        profileId: exhausted.profileId,
        tokenId: exhausted.referenceId,
        messageType: exhausted.messageType,
        provider: getEnv().EMAIL_PROVIDER,
        recipientEmail: exhausted.recipientEmail,
        status: "failed",
        errorMessage: "Retry limit exhausted after a stale worker lease.",
      });
      if (
        exhausted.messageType === "account_invitation" &&
        exhausted.referenceId
      ) {
        await tx
          .update(accountInvitationTokens)
          .set({ deliveryStatus: "delivery_failed" })
          .where(
            and(
              eq(accountInvitationTokens.id, exhausted.referenceId),
              isNull(accountInvitationTokens.usedAt),
              isNull(accountInvitationTokens.revokedAt),
            ),
          );
      }
    }
    const available = or(
      and(
        or(eq(emailOutbox.status, "queued"), eq(emailOutbox.status, "retry")),
        lte(emailOutbox.nextAttemptAt, now),
      ),
      and(eq(emailOutbox.status, "processing"), lte(emailOutbox.leaseExpiresAt, now)),
    )!;
    const [message] = await tx
      .select()
      .from(emailOutbox)
      .where(
        and(
          messageId ? eq(emailOutbox.id, messageId) : undefined,
          available,
          sql`${emailOutbox.attemptCount} < ${emailOutbox.maxAttempts}`,
        ),
      )
      .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!message) return null;
    const attemptCount = message.attemptCount + 1;
    await tx
      .update(emailOutbox)
      .set({
        status: "processing",
        attemptCount,
        processingStartedAt: now,
        leaseOwner: workerId,
        leaseExpiresAt,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(emailOutbox.id, message.id));
    return {
      ...message,
      status: "processing" as const,
      attemptCount,
      processingStartedAt: now,
      leaseOwner: workerId,
      leaseExpiresAt,
      failureCode: null,
      failureReason: null,
    };
  });
}

function permanentEmailFailure(message: string) {
  return /authentication failed|sender address|invalid recipient|payload|envelope/i.test(message);
}

async function deliverWithTimeout(
  deliver: typeof deliverEmail,
  message: TransactionalEmail,
  timeoutMs: number,
) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      deliver(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Email provider timeout.")),
          timeoutMs,
        );
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function processNextEmail(
  workerId: string,
  options: {
    now?: Date;
    deliver?: typeof deliverEmail;
    timeoutMs?: number;
    messageId?: string;
  } = {},
) {
  const now = options.now ?? new Date();
  const row = await claimNextEmail(workerId, now, options.messageId);
  if (!row) return null;
  const startedAt = Date.now();

  try {
    const result = await deliverWithTimeout(
      options.deliver ?? deliverEmail,
      { ...messageFor(row), idempotencyKey: row.idempotencyKey },
      options.timeoutMs ?? getEnv().EMAIL_PROVIDER_TIMEOUT_MS,
    );
    if (!result.ok) throw new Error(result.error);
    const recorded = await getDb().transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: emailOutbox.id })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.id, row.id),
            eq(emailOutbox.status, "processing"),
            eq(emailOutbox.leaseOwner, workerId),
          ),
        )
        .limit(1)
        .for("update");
      if (!owned) return false;
      await tx
        .update(emailOutbox)
        .set({
          status: "sent",
          sentAt: new Date(),
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          encryptedPayload: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.leaseOwner, workerId)));
      await tx.insert(emailDeliveryAttempts).values({
        id: newId(),
        profileId: row.profileId,
        tokenId: row.referenceId,
        messageType: row.messageType,
        provider: result.provider,
        recipientEmail: row.recipientEmail,
        status: "accepted",
        providerMessageId: result.providerMessageId,
        acceptedAt: result.acceptedAt,
      });
      return true;
    });
    if (!recorded) {
      logOperationalEvent({
        action: "email.lease_lost",
        organizationId: row.organizationId,
        actorId: row.profileId,
        entityId: row.id,
        durationMs: Date.now() - startedAt,
      });
      return { messageId: row.id, status: "lease_lost" as const };
    }
    logOperationalEvent({
      action: "email.sent",
      organizationId: row.organizationId,
      actorId: row.profileId,
      entityId: row.id,
      durationMs: Date.now() - startedAt,
      details: { messageType: row.messageType, attemptCount: row.attemptCount },
    });
    return { messageId: row.id, status: "sent" as const };
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "Email delivery failed.";
    const permanent = error instanceof PermanentOutboxError || permanentEmailFailure(safeMessage);
    const exhausted = row.attemptCount >= row.maxAttempts;
    const retry = !permanent && !exhausted;
    const nextAttemptAt = new Date(
      now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, row.attemptCount - 1)),
    );
    const recorded = await getDb().transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: emailOutbox.id })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.id, row.id),
            eq(emailOutbox.status, "processing"),
            eq(emailOutbox.leaseOwner, workerId),
          ),
        )
        .limit(1)
        .for("update");
      if (!owned) return false;
      await tx
        .update(emailOutbox)
        .set({
          status: retry ? "retry" : "failed",
          nextAttemptAt: retry ? nextAttemptAt : row.nextAttemptAt,
          failedAt: retry ? null : new Date(),
          failureCode: permanent ? "permanent_provider_failure" : exhausted ? "retry_exhausted" : "transient_provider_failure",
          failureReason: permanent
            ? "The email provider permanently rejected this message."
            : retry
              ? "Email delivery was interrupted and will be retried."
              : "Email delivery failed after the retry limit.",
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.leaseOwner, workerId)));
      await tx.insert(emailDeliveryAttempts).values({
        id: newId(),
        profileId: row.profileId,
        tokenId: row.referenceId,
        messageType: row.messageType,
        provider: getEnv().EMAIL_PROVIDER,
        recipientEmail: row.recipientEmail,
        status: "failed",
        errorMessage: permanent
          ? "Permanent provider failure."
          : "Transient provider failure.",
      });
      if (!retry && row.messageType === "account_invitation" && row.referenceId) {
        await tx
          .update(accountInvitationTokens)
          .set({ deliveryStatus: "delivery_failed" })
          .where(
            and(
              eq(accountInvitationTokens.id, row.referenceId),
              isNull(accountInvitationTokens.usedAt),
              isNull(accountInvitationTokens.revokedAt),
            ),
          );
      }
      return true;
    });
    if (!recorded) {
      logOperationalEvent({
        action: "email.lease_lost",
        organizationId: row.organizationId,
        actorId: row.profileId,
        entityId: row.id,
        durationMs: Date.now() - startedAt,
      });
      return { messageId: row.id, status: "lease_lost" as const };
    }
    logServerError({
      action: retry ? "email.retry" : "email.failed",
      actorId: row.profileId,
      entityId: row.id,
      category: permanent ? "permanent_provider_failure" : "provider_failure",
      error,
    });
    return { messageId: row.id, status: retry ? ("retry" as const) : ("failed" as const) };
  }
}

export async function retryFailedEmail(actor: Actor, messageId: string) {
  if (actor.role !== "admin") throw new Error("Forbidden");
  await getDb().transaction(async (tx) => {
    const [message] = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.id, messageId),
          eq(emailOutbox.organizationId, actorOrganizationId(actor)),
          eq(emailOutbox.status, "failed"),
        ),
      )
      .limit(1)
      .for("update");
    if (!message) throw new Error("Email message was not found.");
    await tx
      .update(emailOutbox)
      .set({
        status: "queued",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        failedAt: null,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(emailOutbox.id, message.id));
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: actorOrganizationId(actor),
      actorProfileId: actor.id,
      action: "email_outbox.retry_requested",
      entityType: "email_outbox",
      entityId: message.id,
    });
  });
}

export async function emailQueueDepth() {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(emailOutbox)
    .where(or(eq(emailOutbox.status, "queued"), eq(emailOutbox.status, "retry"), eq(emailOutbox.status, "processing")));
  return Number(row?.count ?? 0);
}
