import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { runRetentionCleanup } from "@/cleanup/service";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  dialerImportBatches,
  emailOutbox,
  organizations,
  passwordResetTokens,
  profiles,
  rateLimitRecords,
  sessions,
  userImportBatches,
} from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const ids = {
  organizations: [] as string[],
  profiles: [] as string[],
  batches: [] as string[],
  sessions: [] as string[],
  audit: [] as string[],
  invitations: [] as string[],
  resets: [] as string[],
  limits: [] as string[],
  userImports: [] as string[],
  outbox: [] as string[],
};

async function fixture() {
  const organizationId = newId();
  const profileId = newId();
  ids.organizations.push(organizationId);
  ids.profiles.push(profileId);
  await getDb().insert(organizations).values({ id: organizationId, name: `Cleanup ${organizationId}` });
  await getDb().insert(profiles).values({
    id: profileId,
    organizationId,
    email: `${profileId}@example.test`,
    name: "Cleanup User",
    role: "admin",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  const old = new Date("2020-01-01T00:00:00Z");
  const future = new Date("2100-01-01T00:00:00Z");
  const expiredSession = newId();
  const activeSession = newId();
  ids.sessions.push(expiredSession, activeSession);
  await getDb().insert(sessions).values([
    { id: expiredSession, profileId, expiresAt: old, lastSeenAt: old },
    { id: activeSession, profileId, expiresAt: future, lastSeenAt: new Date() },
  ]);
  const invitationId = newId();
  const resetId = newId();
  ids.invitations.push(invitationId);
  ids.resets.push(resetId);
  await getDb().insert(accountInvitationTokens).values({ id: invitationId, profileId, tokenHash: "a".repeat(64), expiresAt: old, revokedAt: old });
  await getDb().insert(passwordResetTokens).values({ id: resetId, profileId, tokenHash: "b".repeat(64), expiresAt: old, usedAt: old });
  const rateId = newId();
  ids.limits.push(rateId);
  await getDb().insert(rateLimitRecords).values({ id: rateId, scope: "cleanup", identifierHash: "c".repeat(64), windowStartedAt: old, expiresAt: old });
  const userImportId = newId();
  ids.userImports.push(userImportId);
  await getDb().insert(userImportBatches).values({
    id: userImportId,
    organizationId,
    fileName: "expired.csv",
    fileHash: "d".repeat(64),
    uploadedById: profileId,
    rawFileContent: "expired",
    expiresAt: old,
  });
  const failedBatchId = newId();
  const activeBatchId = newId();
  ids.batches.push(failedBatchId, activeBatchId);
  await getDb().insert(dialerImportBatches).values([
    {
      id: failedBatchId,
      organizationId,
      source: "dialer",
      fileName: "failed.csv",
      fileHash: "e".repeat(64),
      uploadedById: profileId,
      rawFileContent: "failed raw",
      rawFileRetainUntil: old,
      status: "failed",
      createdAt: old,
    },
    {
      id: activeBatchId,
      organizationId,
      source: "dialer",
      fileName: "active.csv",
      fileHash: "f".repeat(64),
      uploadedById: profileId,
      rawFileContent: "active raw",
      rawFileRetainUntil: old,
      status: "active",
      createdAt: old,
    },
  ]);
  const auditId = newId();
  ids.audit.push(auditId);
  await getDb().insert(auditLogs).values({ id: auditId, organizationId, actorProfileId: profileId, action: "security.evidence", entityType: "profile", entityId: profileId, createdAt: old });
  const outboxId = newId();
  ids.outbox.push(outboxId);
  await getDb().insert(emailOutbox).values({
    id: outboxId,
    organizationId,
    profileId,
    messageType: "password_changed",
    recipientEmail: `${profileId}@example.test`,
    idempotencyKey: `cleanup:${outboxId}`,
    status: "sent",
    sentAt: old,
    nextAttemptAt: old,
    createdAt: old,
    updatedAt: old,
  });
  return { organizationId, expiredSession, activeSession, failedBatchId, activeBatchId, auditId };
}

afterEach(async () => {
  if (ids.outbox.length) await getDb().delete(emailOutbox).where(inArray(emailOutbox.id, ids.outbox.splice(0)));
  if (ids.sessions.length) await getDb().delete(sessions).where(inArray(sessions.id, ids.sessions.splice(0)));
  if (ids.invitations.length) await getDb().delete(accountInvitationTokens).where(inArray(accountInvitationTokens.id, ids.invitations.splice(0)));
  if (ids.resets.length) await getDb().delete(passwordResetTokens).where(inArray(passwordResetTokens.id, ids.resets.splice(0)));
  if (ids.limits.length) await getDb().delete(rateLimitRecords).where(inArray(rateLimitRecords.id, ids.limits.splice(0)));
  if (ids.userImports.length) await getDb().delete(userImportBatches).where(inArray(userImportBatches.id, ids.userImports.splice(0)));
  if (ids.batches.length) await getDb().delete(dialerImportBatches).where(inArray(dialerImportBatches.id, ids.batches.splice(0)));
  ids.audit.splice(0);
  if (ids.organizations.length) await getDb().delete(auditLogs).where(inArray(auditLogs.organizationId, ids.organizations));
  if (ids.profiles.length) await getDb().delete(profiles).where(inArray(profiles.id, ids.profiles.splice(0)));
  if (ids.organizations.length) await getDb().delete(organizations).where(inArray(organizations.id, ids.organizations.splice(0)));
});

describe("bounded retention cleanup", () => {
  it("supports dry run and then removes only expired ephemeral data", async () => {
    const data = await fixture();
    const preview = await runRetentionCleanup({ dryRun: true, organizationId: data.organizationId, now: new Date("2026-08-09T00:00:00Z"), batchSize: 50 });
    expect(preview.counts).toMatchObject({
      sessions: 1,
      invitationTokens: 1,
      resetTokens: 1,
      rateLimits: 1,
      userImportPreviews: 1,
      ephemeralImports: 1,
      rawCsvPayloads: 2,
      auditLogs: 0,
    });
    expect((await getDb().select().from(sessions).where(eq(sessions.id, data.expiredSession)))).toHaveLength(1);

    await runRetentionCleanup({ dryRun: false, organizationId: data.organizationId, now: new Date("2026-08-09T00:00:00Z"), batchSize: 50 });
    expect(await getDb().select().from(sessions).where(eq(sessions.id, data.expiredSession))).toHaveLength(0);
    expect(await getDb().select().from(sessions).where(eq(sessions.id, data.activeSession))).toHaveLength(1);
    expect(await getDb().select().from(dialerImportBatches).where(eq(dialerImportBatches.id, data.failedBatchId))).toHaveLength(0);
    const [active] = await getDb().select().from(dialerImportBatches).where(eq(dialerImportBatches.id, data.activeBatchId));
    expect(active).toMatchObject({ status: "active", rawFileContent: null });
    expect(await getDb().select().from(auditLogs).where(eq(auditLogs.id, data.auditId))).toHaveLength(1);
  });

  it("respects the configured batch bound", async () => {
    const data = await fixture();
    const result = await runRetentionCleanup({ dryRun: true, organizationId: data.organizationId, now: new Date("2026-08-09T00:00:00Z"), batchSize: 1 });
    expect(Math.max(...Object.values(result.counts))).toBeLessThanOrEqual(1);
  });
});
