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
    await enqueueEmailOutbox(getDb(), {
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
    expect(rows[0].encryptedPayload).not.toContain("sensitive-raw-token");
  });

  it("claims only once and scrubs encrypted content after successful delivery", async () => {
    const { messageId } = await setup();
    const [first, second] = await Promise.all([
      claimNextEmail("email-a", new Date(), messageId),
      claimNextEmail("email-b", new Date(), messageId),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const claimed = first ?? second!;
    await getDb().update(emailOutbox).set({ status: "queued", leaseOwner: null, leaseExpiresAt: null, attemptCount: 0 }).where(eq(emailOutbox.id, claimed.id));
    const result = await processNextEmail("email-worker", {
      messageId,
      deliver: async () => ({ ok: true, provider: "resend", acceptedAt: new Date(), providerMessageId: "provider-1" }),
    });
    expect(result).toEqual({ messageId, status: "sent" });
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
