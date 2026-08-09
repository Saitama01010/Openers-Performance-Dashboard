import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  emailDeliveryAttempts,
  emailOutbox,
  organizations,
  profiles,
} from "@/db/schema";
import {
  claimNextEmail,
  enqueueEmailOutbox,
  processNextEmail,
  retryFailedEmail,
} from "@/email/outbox";
import type { TransactionalEmail } from "@/email/provider";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const messageIds: string[] = [];
const tokenIds: string[] = [];

async function setup(idempotencyKey: string = newId()) {
  const organizationId = newId();
  const profileId = newId();
  const tokenId = newId();
  tokenIds.push(tokenId);
  organizationIds.push(organizationId);
  profileIds.push(profileId);
  await getDb().insert(organizations).values({ id: organizationId, name: `Outbox ${organizationId}` });
  await getDb().insert(profiles).values({
    id: profileId,
    organizationId,
    email: `${profileId}@example.test`,
    name: "Outbox User",
    role: "admin",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  const messageId = await enqueueEmailOutbox(getDb(), {
    organizationId,
    profileId,
    referenceId: tokenId,
    recipientEmail: `${profileId}@example.test`,
    messageType: "password_reset",
    idempotencyKey,
    payload: { kind: "password_reset", name: "Outbox User", token: "sensitive-raw-token", tokenId },
  });
  messageIds.push(messageId);
  return { organizationId, profileId, tokenId, messageId, idempotencyKey };
}

afterEach(async () => {
  if (messageIds.length) {
    const ids = messageIds.splice(0);
    await getDb().delete(emailOutbox).where(inArray(emailOutbox.id, ids));
  }
  if (tokenIds.length) await getDb().delete(emailDeliveryAttempts).where(inArray(emailDeliveryAttempts.tokenId, tokenIds.splice(0)));
  if (organizationIds.length) await getDb().delete(auditLogs).where(inArray(auditLogs.organizationId, organizationIds));
  if (profileIds.length) await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  if (organizationIds.length) await getDb().delete(organizations).where(inArray(organizations.id, organizationIds.splice(0)));
});

describe("email outbox", () => {
  it("encrypts queued token payloads and deduplicates the email intent", async () => {
    const first = await setup("dedupe-key");
    const duplicateId = await enqueueEmailOutbox(getDb(), {
      organizationId: first.organizationId,
      profileId: first.profileId,
      referenceId: first.tokenId,
      recipientEmail: `${first.profileId}@example.test`,
      messageType: "password_reset",
      idempotencyKey: "dedupe-key",
      payload: { kind: "password_reset", name: "Outbox User", token: "another-token", tokenId: first.tokenId },
    });
    const rows = await getDb().select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, "dedupe-key"));
    expect(rows).toHaveLength(1);
    expect(duplicateId).toBe(first.messageId);
    expect(rows[0].encryptedPayload).not.toContain("sensitive-raw-token");
  });

  it("claims only once and scrubs encrypted content after successful delivery", async () => {
    const { messageId, idempotencyKey } = await setup();
    const [first, second] = await Promise.all([
      claimNextEmail("email-a", new Date(), messageId),
      claimNextEmail("email-b", new Date(), messageId),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const claimed = first ?? second!;
    await getDb().update(emailOutbox).set({ status: "queued", leaseOwner: null, leaseExpiresAt: null, attemptCount: 0 }).where(eq(emailOutbox.id, claimed.id));
    const deliver = vi.fn(async (message: TransactionalEmail) => {
      expect(message.idempotencyKey).toBe(idempotencyKey);
      return { ok: true as const, provider: "resend" as const, acceptedAt: new Date(), providerMessageId: "provider-1" };
    });
    const result = await processNextEmail("email-worker", {
      messageId,
      deliver,
    });
    expect(result).toEqual({ messageId, status: "sent" });
    expect(deliver).toHaveBeenCalledOnce();
    const [row] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    expect(row).toMatchObject({ status: "sent", encryptedPayload: null, providerMessageId: "provider-1" });
  });

  it("backs off transient failures and stops on permanent provider failures", async () => {
    const transient = await setup();
    expect((await processNextEmail("retry", {
      messageId: transient.messageId,
      deliver: async () => ({ ok: false, provider: "resend", error: "provider timeout" }),
    }))?.status).toBe("retry");
    const [retryRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, transient.messageId));
    expect(retryRow).toMatchObject({ status: "retry", attemptCount: 1, failureCode: "transient_provider_failure" });
    await getDb().update(emailOutbox).set({ nextAttemptAt: new Date("2100-01-01T00:00:00Z") }).where(eq(emailOutbox.id, transient.messageId));

    const permanent = await setup();
    expect((await processNextEmail("permanent", {
      messageId: permanent.messageId,
      now: new Date(Date.now() + 60_000),
      deliver: async () => ({ ok: false, provider: "resend", error: "Email provider authentication failed." }),
    }))?.status).toBe("failed");
    const [failedRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, permanent.messageId));
    expect(failedRow).toMatchObject({ status: "failed", failureCode: "permanent_provider_failure" });
    expect(failedRow.failureReason).not.toContain("authentication");
  });

  it("preserves operational history while nulling a deleted user reference", async () => {
    const { messageId, profileId } = await setup();
    await getDb().delete(profiles).where(eq(profiles.id, profileId));
    profileIds.splice(profileIds.indexOf(profileId), 1);
    const [row] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    expect(row.profileId).toBeNull();
  });

  it("permanently rejects a tampered encrypted payload without calling the provider", async () => {
    const { messageId } = await setup();
    const [row] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    const envelope = row.encryptedPayload!.split(".");
    envelope[2] = `${envelope[2]!.startsWith("A") ? "B" : "A"}${envelope[2]!.slice(1)}`;
    await getDb()
      .update(emailOutbox)
      .set({ encryptedPayload: envelope.join(".") })
      .where(eq(emailOutbox.id, messageId));
    const deliver = vi.fn();

    expect((await processNextEmail("tamper", { messageId, deliver }))?.status).toBe("failed");
    expect(deliver).not.toHaveBeenCalled();
    const [failed] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    expect(failed).toMatchObject({ status: "failed", failureCode: "permanent_provider_failure" });
  });

  it("turns an unbounded provider call into a transient bounded retry", async () => {
    const { messageId } = await setup();
    const deliver = vi.fn(() => new Promise<never>(() => undefined));

    expect((await processNextEmail("timeout", { messageId, deliver, timeoutMs: 5 }))?.status).toBe("retry");
    const [row] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    expect(row).toMatchObject({ status: "retry", failureCode: "transient_provider_failure" });
  });

  it("does not mutate delivery state after another worker takes the lease", async () => {
    const success = await setup();
    const successfulDelivery = await processNextEmail("stale-success", {
      messageId: success.messageId,
      deliver: async () => {
        await getDb()
          .update(emailOutbox)
          .set({ leaseOwner: "replacement", leaseExpiresAt: new Date("2100-01-01T00:00:00Z") })
          .where(eq(emailOutbox.id, success.messageId));
        return { ok: true, provider: "resend", acceptedAt: new Date(), providerMessageId: "accepted-by-provider" };
      },
    });
    expect(successfulDelivery).toEqual({ messageId: success.messageId, status: "lease_lost" });
    const [successRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, success.messageId));
    expect(successRow).toMatchObject({ status: "processing", leaseOwner: "replacement", providerMessageId: null });

    const failure = await setup();
    const failedDelivery = await processNextEmail("stale-failure", {
      messageId: failure.messageId,
      deliver: async () => {
        await getDb()
          .update(emailOutbox)
          .set({ leaseOwner: "replacement", leaseExpiresAt: new Date("2100-01-01T00:00:00Z") })
          .where(eq(emailOutbox.id, failure.messageId));
        return { ok: false, provider: "resend", error: "provider timeout" };
      },
    });
    expect(failedDelivery).toEqual({ messageId: failure.messageId, status: "lease_lost" });
    const [failureRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, failure.messageId));
    expect(failureRow).toMatchObject({ status: "processing", leaseOwner: "replacement", failureCode: null });
  });

  it("terminally recovers an exhausted stale lease without another send", async () => {
    const { messageId, tokenId } = await setup();
    await getDb()
      .update(emailOutbox)
      .set({
        status: "processing",
        attemptCount: 1,
        maxAttempts: 1,
        leaseOwner: "crashed",
        leaseExpiresAt: new Date("2026-01-01T00:00:00Z"),
      })
      .where(eq(emailOutbox.id, messageId));

    expect(await claimNextEmail("replacement", new Date("2026-01-01T00:01:00Z"), messageId)).toBeNull();
    const [row] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, messageId));
    expect(row).toMatchObject({ status: "failed", attemptCount: 1, failureCode: "retry_exhausted", leaseOwner: null });
    const attempts = await getDb()
      .select()
      .from(emailDeliveryAttempts)
      .where(eq(emailDeliveryAttempts.tokenId, tokenId));
    expect(attempts).toContainEqual(
      expect.objectContaining({
        status: "failed",
        errorMessage: "Retry limit exhausted after a stale worker lease.",
      }),
    );
  });

  it("allows only an administrator from the owning organization to retry a terminal failure", async () => {
    const owned = await setup();
    const foreign = await setup();
    await getDb().update(emailOutbox).set({ status: "failed" }).where(inArray(emailOutbox.id, [owned.messageId, foreign.messageId]));
    const actor = { id: owned.profileId, role: "admin" as const, teamIds: [], organizationId: owned.organizationId };

    await retryFailedEmail(actor, owned.messageId);
    await expect(retryFailedEmail(actor, foreign.messageId)).rejects.toThrow("Email message was not found.");
    const [ownedRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, owned.messageId));
    const [foreignRow] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.id, foreign.messageId));
    expect(ownedRow.status).toBe("queued");
    expect(foreignRow.status).toBe("failed");
  });
});
