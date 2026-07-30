import "dotenv/config";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

import {
  createAdminUser,
  listAdminUsers,
  permanentlyDeleteUser,
  permanentlyDeleteUsers,
  regenerateTemporaryPassword,
  revealTemporaryPassword,
} from "@/admin/data";
import type { Actor } from "@/auth/authorization";
import { verifyPassword } from "@/auth/password";
import { authenticateCredentials } from "@/auth/service";
import { decryptTemporaryPassword } from "@/auth/temporary-password";
import { hashOpaqueToken } from "@/auth/security";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  passwordResetTokens,
  profiles,
  sessions,
  sourceUserMappings,
  teamMemberships,
  teams,
  userPermissionOverrides,
} from "@/db/schema";
import { resetEnvForTests } from "@/env";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];
const batchIds: string[] = [];

function actor(id: string, role: Actor["role"] = "admin"): Actor {
  return { id, role, teamIds: [] };
}

async function createActorProfile(role: Actor["role"]) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Provisioning ${role}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return id;
}

async function createTeam() {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({
    id,
    name: `Provisioning Team ${id.slice(0, 8)}`,
    active: true,
  });
  return id;
}

describe("admin user provisioning integration", () => {
  beforeEach(() => {
    process.env.TEMP_PASSWORD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );
    resetEnvForTests();
  });

  afterEach(async () => {
    const ids = profileIds.splice(0);
    const batches = batchIds.splice(0);
    const teamIdsToDelete = teamIds.splice(0);

    if (ids.length > 0) {
      await getDb()
        .delete(dialerAgentHourlyMetrics)
        .where(inArray(dialerAgentHourlyMetrics.agentProfileId, ids));
      await getDb()
        .delete(accountInvitationTokens)
        .where(inArray(accountInvitationTokens.profileId, ids));
      await getDb()
        .delete(passwordResetTokens)
        .where(inArray(passwordResetTokens.profileId, ids));
      await getDb().delete(sessions).where(inArray(sessions.profileId, ids));
      await getDb()
        .delete(userPermissionOverrides)
        .where(inArray(userPermissionOverrides.profileId, ids));
      await getDb()
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.actorProfileId, ids),
            inArray(auditLogs.entityId, ids),
          ),
        );
      await getDb()
        .delete(sourceUserMappings)
        .where(inArray(sourceUserMappings.profileId, ids));
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, ids));
    }
    if (batches.length > 0) {
      await getDb()
        .delete(dialerImportBatches)
        .where(inArray(dialerImportBatches.id, batches));
    }
    if (ids.length > 0) {
      await getDb().delete(profiles).where(inArray(profiles.id, ids));
    }
    if (teamIdsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamIdsToDelete));
    }
  });

  it("creates an immediately usable temporary account without sending an invitation", async () => {
    const adminId = await createActorProfile("admin");
    const managerId = await createActorProfile("manager");
    const teamId = await createTeam();

    await expect(
      createAdminUser(actor(managerId, "manager"), {
        name: "Blocked User",
        email: "blocked@example.test",
        role: "agent",
        teamId,
        dialerName: "Blocked Dialer",
        dialerAliases: [],
        permissionOverrides: [],
      }),
    ).rejects.toThrow("Forbidden");

    const created = await createAdminUser(actor(adminId), {
      name: "Temporary Agent",
      email: "temporary.agent@example.test",
      role: "agent",
      teamId,
      dialerName: "Temporary Dialer",
      dialerAliases: [],
      permissionOverrides: [],
    });
    profileIds.push(created.profileId);

    const [profile] = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.id, created.profileId));
    expect(profile).toMatchObject({
      accountStatus: "active",
      passwordState: "temporary",
      active: true,
    });
    expect(profile.passwordHash).toBeTruthy();
    expect(profile.encryptedTemporaryPassword).toBeTruthy();
    expect(profile.encryptedTemporaryPassword).not.toContain(
      "temporary.agent@example.test",
    );

    const invitationRows = await getDb()
      .select()
      .from(accountInvitationTokens)
      .where(eq(accountInvitationTokens.profileId, created.profileId));
    expect(invitationRows).toEqual([]);

    const temporaryPassword = decryptTemporaryPassword(
      profile.encryptedTemporaryPassword!,
    );
    expect(await verifyPassword(temporaryPassword, profile.passwordHash!)).toBe(
      true,
    );
    expect(
      await authenticateCredentials(profile.email!, temporaryPassword),
    ).toMatchObject({ ok: true });

    const listed = await listAdminUsers(actor(adminId), {
      page: 1,
      pageSize: 50,
      query: profile.email!,
    });
    expect(listed.users[0]).not.toHaveProperty(
      "encryptedTemporaryPassword",
    );

    expect(
      await revealTemporaryPassword(actor(adminId), created.profileId),
    ).toBe(temporaryPassword);
    const [revealAudit] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, created.profileId),
          eq(auditLogs.action, "user.temporary_password_viewed"),
        ),
      );
    expect(JSON.stringify(revealAudit.metadata ?? {})).not.toContain(
      temporaryPassword,
    );

    await regenerateTemporaryPassword(actor(adminId), created.profileId);
    const replacement = await revealTemporaryPassword(
      actor(adminId),
      created.profileId,
    );
    expect(replacement).not.toBe(temporaryPassword);
    expect(
      await authenticateCredentials(profile.email!, temporaryPassword),
    ).toMatchObject({ ok: false });
    expect(
      await authenticateCredentials(profile.email!, replacement),
    ).toMatchObject({ ok: true });
  });

  it("scrubs authentication data while preserving historical metrics", async () => {
    const adminId = await createActorProfile("admin");
    const teamId = await createTeam();
    const created = await createAdminUser(actor(adminId), {
      name: "Historical Agent",
      email: "historical.agent@example.test",
      role: "agent",
      teamId,
      dialerName: "Historical Dialer",
      dialerAliases: [],
      permissionOverrides: [],
    });
    profileIds.push(created.profileId);

    const batchId = newId();
    batchIds.push(batchId);
    await getDb().insert(dialerImportBatches).values({
      id: batchId,
      source: "dialer",
      fileName: "historical.csv",
      fileHash: "a".repeat(64),
      uploadedById: adminId,
      rowCount: 1,
      rawFileContent: "historical",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await getDb().insert(dialerAgentHourlyMetrics).values({
      id: newId(),
      source: "dialer",
      sourceAgentName: "Historical Dialer",
      agentProfileId: created.profileId,
      batchId,
      metricDate: "2026-07-25",
      metricHour: 9,
      metricKey: "hour:09",
      calls: 12,
      loggedInSeconds: 3600,
      readySeconds: 1200,
      talkSeconds: 1800,
      ringingSeconds: 60,
      wrapSeconds: 300,
      pausedSeconds: 120,
      idleSeconds: 120,
      untrackedSeconds: 0,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Historical Team",
      rowHash: "b".repeat(64),
    });
    await getDb().insert(sessions).values({
      id: hashOpaqueToken("historical-session"),
      profileId: created.profileId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await permanentlyDeleteUser(actor(adminId), {
      userId: created.profileId,
    });

    const [deleted] = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.id, created.profileId));
    expect(deleted).toMatchObject({
      email: null,
      passwordHash: null,
      encryptedTemporaryPassword: null,
      accountStatus: "deleted",
      active: false,
    });
    expect(deleted.deletedAt).toBeInstanceOf(Date);

    const metricRows = await getDb()
      .select()
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.agentProfileId, created.profileId));
    expect(metricRows).toHaveLength(1);
    expect(metricRows[0].calls).toBe(12);

    expect(
      await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.profileId, created.profileId)),
    ).toEqual([]);
    const [membership] = await getDb()
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.profileId, created.profileId));
    expect(membership.active).toBe(false);
    expect(membership.endedAt).toBeInstanceOf(Date);
    const [mapping] = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, created.profileId));
    expect(mapping.active).toBe(false);
    expect(
      await authenticateCredentials(
        "historical.agent@example.test",
        "anything",
      ),
    ).toMatchObject({ ok: false });
  });

  it("keeps the self-deletion safeguard", async () => {
    const actorId = await createActorProfile("admin");

    await expect(
      permanentlyDeleteUser(actor(actorId), { userId: actorId }),
    ).rejects.toThrow("You cannot permanently delete your own account.");
  });

  it("bulk deletes multiple users in one authorized operation", async () => {
    const adminId = await createActorProfile("admin");
    const teamId = await createTeam();
    const first = await createAdminUser(actor(adminId), {
      name: "Bulk One",
      email: "bulk.one@example.test",
      role: "agent",
      teamId,
      shift: "Morning",
      dialerName: "Bulk Dialer One",
      dialerAliases: [],
      permissionOverrides: [],
    });
    const second = await createAdminUser(actor(adminId), {
      name: "Bulk Two",
      email: "bulk.two@example.test",
      role: "agent",
      teamId,
      shift: "",
      dialerName: "Bulk Dialer Two",
      dialerAliases: [],
      permissionOverrides: [],
    });
    profileIds.push(first.profileId, second.profileId);

    const result = await permanentlyDeleteUsers(actor(adminId), {
      userIds: [first.profileId, second.profileId, first.profileId],
    });

    expect(result.deletedIds).toEqual([first.profileId, second.profileId]);
    const deleted = await getDb()
      .select({ id: profiles.id, status: profiles.accountStatus })
      .from(profiles)
      .where(inArray(profiles.id, result.deletedIds));
    expect(deleted).toHaveLength(2);
    expect(deleted.every((row) => row.status === "deleted")).toBe(true);
  });
});
