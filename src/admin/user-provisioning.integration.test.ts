import "@/test/integration-env";

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
  coachingReportRevisions,
  coachingReports,
  coachingRubricTemplates,
  coachingSessionParticipants,
  coachingSessions,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  employmentStatusEvents,
  manualFlagCaseEvents,
  manualFlagCases,
  passwordResetTokens,
  profiles,
  performanceTargets,
  sessions,
  shadowingSessions,
  sourceUserMappings,
  teamMemberships,
  teams,
  tenureThresholds,
  userPermissionOverrides,
} from "@/db/schema";
import { resetEnvForTests } from "@/env";
import { newId } from "@/lib/ids";
import { DEFAULT_ORGANIZATION_ID } from "@/tenancy/constants";

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
      mustResetPassword: true,
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
    ).toMatchObject({ ok: true, requiresPasswordChange: true });

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
    await expect(
      revealTemporaryPassword(actor(adminId), created.profileId),
    ).rejects.toThrow("Temporary password is no longer available");
    const [revealedProfile] = await getDb()
      .select({ encryptedTemporaryPassword: profiles.encryptedTemporaryPassword })
      .from(profiles)
      .where(eq(profiles.id, created.profileId));
    expect(revealedProfile.encryptedTemporaryPassword).toBeNull();
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

    await regenerateTemporaryPassword(
      actor(adminId),
      created.profileId,
      "Credential rotation requested by administrator",
    );
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
    ).toMatchObject({ ok: true, requiresPasswordChange: true });
    await expect(
      revealTemporaryPassword(actor(adminId), created.profileId),
    ).rejects.toThrow("Temporary password is no longer available");

    const securityAudits = await getDb()
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.profileId));
    expect(securityAudits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "user.temporary_password_viewed",
        "user.temporary_password_regenerated",
      ]),
    );
    expect(JSON.stringify(securityAudits)).not.toContain(replacement);
  });

  it("fails closed on a tampered temporary-password ciphertext", async () => {
    const adminId = await createActorProfile("admin");
    const teamId = await createTeam();
    const created = await createAdminUser(actor(adminId), {
      name: "Tampered Cipher Agent",
      email: "tampered.cipher@example.test",
      role: "agent",
      teamId,
      dialerName: "Tampered Cipher Dialer",
      dialerAliases: [],
      permissionOverrides: [],
    });
    profileIds.push(created.profileId);

    await getDb()
      .update(profiles)
      .set({ encryptedTemporaryPassword: "v1.invalid.invalid.invalid" })
      .where(eq(profiles.id, created.profileId));

    await expect(
      revealTemporaryPassword(actor(adminId), created.profileId),
    ).rejects.toThrow();
    const [profile] = await getDb()
      .select({ encryptedTemporaryPassword: profiles.encryptedTemporaryPassword })
      .from(profiles)
      .where(eq(profiles.id, created.profileId));
    expect(profile.encryptedTemporaryPassword).toBe(
      "v1.invalid.invalid.invalid",
    );
  });

  it("physically removes the auth account and all user-owned application data", async () => {
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
    const employmentEventId = newId();
    const shadowingId = newId();
    const manualFlagId = newId();
    const manualFlagEventId = newId();
    const coachingSessionId = newId();
    const coachingParticipantId = newId();
    const rubricTemplateId = newId();
    const coachingReportId = newId();
    const coachingRevisionId = newId();
    const performanceTargetId = newId();
    const tenureThresholdId = newId();
    await getDb().insert(employmentStatusEvents).values({
      id: employmentEventId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      profileId: created.profileId,
      status: "active",
      effectiveAt: new Date(),
      reason: "Existing operational history",
      createdById: adminId,
    });
    await getDb().insert(shadowingSessions).values({
      id: shadowingId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      agentProfileId: created.profileId,
      teamIdSnapshot: teamId,
      assignedLeaderId: adminId,
      scheduledDate: "2026-08-10",
      objective: "Existing shadowing",
      createdById: adminId,
    });
    await getDb().insert(manualFlagCases).values({
      id: manualFlagId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      agentProfileId: created.profileId,
      teamIdSnapshot: teamId,
      raisedById: adminId,
      assignedOwnerId: adminId,
      category: "Existing case",
      severity: "medium",
      reason: "Existing operational case",
    });
    await getDb().insert(manualFlagCaseEvents).values({
      id: manualFlagEventId,
      caseId: manualFlagId,
      actorProfileId: adminId,
      eventType: "created",
    });
    await getDb().insert(coachingSessions).values({
      id: coachingSessionId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      createdByProfileId: adminId,
      coachProfileId: adminId,
      category: "performance",
      sessionDate: "2026-08-06",
    });
    await getDb().insert(coachingSessionParticipants).values({
      id: coachingParticipantId,
      sessionId: coachingSessionId,
      agentProfileId: created.profileId,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Historical Team",
    });
    await getDb().insert(coachingRubricTemplates).values({
      id: rubricTemplateId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      name: "Deletion compatibility",
      version: 1,
      sections: [],
      createdById: created.profileId,
    });
    await getDb().insert(coachingReports).values({
      id: coachingReportId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      coachingSessionId,
      agentProfileId: created.profileId,
      coachProfileId: adminId,
      templateId: rubricTemplateId,
      templateVersion: 1,
      criterionScores: [],
      overallScore: "0.00",
    });
    await getDb().insert(coachingReportRevisions).values({
      id: coachingRevisionId,
      reportId: coachingReportId,
      revision: 1,
      snapshot: {},
      createdById: adminId,
    });
    await getDb().insert(performanceTargets).values({
      id: performanceTargetId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      metric: "transfers",
      targetValue: "10.00",
      effectiveFrom: "2026-08-01",
      createdById: created.profileId,
    });
    await getDb().insert(tenureThresholds).values({
      id: tenureThresholdId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      bandLabel: "Existing threshold",
      minimumDays: 0,
      effectiveFrom: "2026-08-01",
      createdById: created.profileId,
    });

    await permanentlyDeleteUser(actor(adminId), {
      userId: created.profileId,
    });

    const deleted = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.id, created.profileId));
    expect(deleted).toEqual([]);

    const metricRows = await getDb()
      .select()
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.agentProfileId, created.profileId));
    expect(metricRows).toEqual([]);

    expect(
      await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.profileId, created.profileId)),
    ).toEqual([]);
    const memberships = await getDb()
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.profileId, created.profileId));
    expect(memberships).toEqual([]);
    const mappings = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, created.profileId));
    expect(mappings).toEqual([]);
    for (const [table, id] of [
      [employmentStatusEvents, employmentEventId],
      [shadowingSessions, shadowingId],
      [manualFlagCases, manualFlagId],
      [manualFlagCaseEvents, manualFlagEventId],
      [coachingReports, coachingReportId],
      [coachingReportRevisions, coachingRevisionId],
      [coachingSessions, coachingSessionId],
    ] as const) {
      expect(await getDb().select().from(table).where(eq(table.id, id))).toEqual([]);
    }
    expect(
      await getDb().select({ createdById: coachingRubricTemplates.createdById })
        .from(coachingRubricTemplates)
        .where(eq(coachingRubricTemplates.id, rubricTemplateId)),
    ).toEqual([{ createdById: adminId }]);
    expect(
      await getDb().select({ createdById: performanceTargets.createdById })
        .from(performanceTargets)
        .where(eq(performanceTargets.id, performanceTargetId)),
    ).toEqual([{ createdById: adminId }]);
    expect(
      await getDb().select({ createdById: tenureThresholds.createdById })
        .from(tenureThresholds)
        .where(eq(tenureThresholds.id, tenureThresholdId)),
    ).toEqual([{ createdById: adminId }]);
    await getDb().delete(performanceTargets).where(eq(performanceTargets.id, performanceTargetId));
    await getDb().delete(tenureThresholds).where(eq(tenureThresholds.id, tenureThresholdId));
    await getDb().delete(coachingRubricTemplates).where(eq(coachingRubricTemplates.id, rubricTemplateId));
    const listed = await listAdminUsers(actor(adminId), {
      page: 1,
      pageSize: 20,
    });
    expect(listed.users.some((user) => user.id === created.profileId)).toBe(false);
    expect(
      await authenticateCredentials(
        "historical.agent@example.test",
        "anything",
      ),
    ).toMatchObject({ ok: false });

    const preservedAudits = await getDb()
      .select({
        action: auditLogs.action,
        organizationId: auditLogs.organizationId,
        actorDisplayName: auditLogs.actorDisplayName,
      })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.profileId));
    expect(preservedAudits.map((row) => row.action)).toEqual(
      expect.arrayContaining(["user.created", "user.permanently_deleted"]),
    );
    expect(
      preservedAudits.every(
        (row) => row.organizationId === DEFAULT_ORGANIZATION_ID,
      ),
    ).toBe(true);
    expect(preservedAudits.some((row) => row.actorDisplayName)).toBe(true);
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
    expect(deleted).toEqual([]);
  });

  it("rejects a permanent deletion requested by a non-admin", async () => {
    const adminId = await createActorProfile("admin");
    const managerId = await createActorProfile("manager");

    await expect(
      permanentlyDeleteUser(actor(managerId, "manager"), { userId: adminId }),
    ).rejects.toThrow("Forbidden");
    expect(
      await getDb().select().from(profiles).where(eq(profiles.id, adminId)),
    ).toHaveLength(1);
  });

  it("removes an administrator account without orphaning shared import history", async () => {
    const deletingAdminId = await createActorProfile("admin");
    const targetAdminId = await createActorProfile("admin");
    const batchId = newId();
    batchIds.push(batchId);
    await getDb().insert(dialerImportBatches).values({
      id: batchId,
      source: "dialer",
      fileName: "shared-history.csv",
      fileHash: "c".repeat(64),
      uploadedById: targetAdminId,
      confirmedById: targetAdminId,
      publishedById: targetAdminId,
      rejectedById: targetAdminId,
      rolledBackById: targetAdminId,
      rawFileContent: "shared-history",
    });

    await permanentlyDeleteUser(actor(deletingAdminId), {
      userId: targetAdminId,
    });

    expect(
      await getDb().select().from(profiles).where(eq(profiles.id, targetAdminId)),
    ).toEqual([]);
    const [retainedBatch] = await getDb()
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batchId));
    expect(retainedBatch).toMatchObject({
      uploadedById: deletingAdminId,
      confirmedById: null,
      publishedById: null,
      rejectedById: null,
      rolledBackById: null,
    });
  });

  it("paginates a stable unique user set without duplicates or skipped rows", async () => {
    const adminId = await createActorProfile("admin");
    for (let index = 0; index < 12; index += 1) {
      await createActorProfile("agent");
    }

    const firstPage = await listAdminUsers(actor(adminId), {
      query: "Provisioning agent",
      role: "agent",
      page: 1,
      pageSize: 5,
    });
    const secondPage = await listAdminUsers(actor(adminId), {
      query: "Provisioning agent",
      role: "agent",
      page: 2,
      pageSize: 5,
    });
    const thirdPage = await listAdminUsers(actor(adminId), {
      query: "Provisioning agent",
      role: "agent",
      page: 3,
      pageSize: 5,
    });
    const ids = [...firstPage.users, ...secondPage.users, ...thirdPage.users].map(
      (user) => user.id,
    );

    expect(firstPage.pagination.total).toBe(12);
    expect(firstPage.users).toHaveLength(5);
    expect(secondPage.users).toHaveLength(5);
    expect(thirdPage.users).toHaveLength(2);
    expect(new Set(ids).size).toBe(12);
  });
});
