import "@/test/integration-env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";

vi.mock("server-only", () => ({}));

import type { Actor } from "@/auth/authorization";
import { createAdminUser, createTeamAgent } from "@/admin/data";
import { getDb, getPool } from "@/db";
import {
  auditLogs,
  accountInvitationTokens,
  coachingSessionParticipants,
  coachingSessions,
  emailDeliveryAttempts,
  employmentStatusEvents,
  manualFlagCaseEvents,
  manualFlagCases,
  organizations,
  profiles,
  sessions,
  shadowingSessions,
  sourceUserMappings,
  teamMemberships,
  teamTransferRequests,
  teams,
} from "@/db/schema";
import {
  applyTeamTransferRequest,
  completeShadowingSession,
  createManualFlagCase,
  createShadowingSession,
  createTeamTransferRequest,
  listManualFlagCases,
  listShadowingSessions,
  reviewTeamTransferRequest,
  updateManualFlagCase,
} from "@/operations/service";
import { recordEmploymentStatus } from "@/operations/settings";

const suffix = randomUUID().slice(0, 8);
const ids = {
  organization: `ops-org-${suffix}`,
  otherOrganization: `ops-other-org-${suffix}`,
  east: `ops-east-${suffix}`,
  west: `ops-west-${suffix}`,
  otherTeam: `ops-other-team-${suffix}`,
  admin: `ops-admin-${suffix}`,
  manager: `ops-manager-${suffix}`,
  noTeamManager: `ops-no-team-manager-${suffix}`,
  staleManager: `ops-stale-manager-${suffix}`,
  eastAgent: `ops-east-agent-${suffix}`,
  westAgent: `ops-west-agent-${suffix}`,
  transferAgent: `ops-transfer-agent-${suffix}`,
  concurrentAgent: `ops-concurrent-agent-${suffix}`,
  lifecycleAgent: `ops-lifecycle-agent-${suffix}`,
  lifecycleSession: `ops-session-${suffix}`,
  coachingSession: `ops-coaching-${suffix}`,
  otherCoachingSession: `ops-other-coaching-${suffix}`,
  otherAdmin: `ops-other-admin-${suffix}`,
  otherAgent: `ops-other-agent-${suffix}`,
};
const profileIds = [ids.admin, ids.manager, ids.noTeamManager, ids.staleManager, ids.eastAgent, ids.westAgent, ids.transferAgent, ids.concurrentAgent, ids.lifecycleAgent];
const eastManager: Actor = { id: ids.manager, role: "manager", teamIds: [ids.east], organizationId: ids.organization };
const noTeamManager: Actor = { id: ids.noTeamManager, role: "manager", teamIds: [], organizationId: ids.organization };
const staleManager: Actor = { id: ids.staleManager, role: "manager", teamIds: [ids.east], organizationId: ids.organization };
const admin: Actor = { id: ids.admin, role: "admin", teamIds: [], organizationId: ids.organization };
let createdAgentId: string | null = null;

describe("team-scoped performance operations", () => {
  beforeAll(async () => {
    await getDb().insert(organizations).values({ id: ids.organization, name: `Operations ${suffix}` });
    await getDb().insert(organizations).values({ id: ids.otherOrganization, name: `Other Operations ${suffix}` });
    await getDb().insert(teams).values([
      { id: ids.east, organizationId: ids.organization, name: `East ${suffix}` },
      { id: ids.west, organizationId: ids.organization, name: `West ${suffix}` },
      { id: ids.otherTeam, organizationId: ids.otherOrganization, name: `Other ${suffix}` },
    ]);
    await getDb().insert(profiles).values([
      { id: ids.admin, organizationId: ids.organization, name: "Admin", email: `${ids.admin}@example.com`, role: "admin", accountStatus: "active" },
      { id: ids.manager, organizationId: ids.organization, name: "Manager", email: `${ids.manager}@example.com`, role: "manager", accountStatus: "active" },
      { id: ids.noTeamManager, organizationId: ids.organization, name: "No Team Manager", email: `${ids.noTeamManager}@example.com`, role: "manager", accountStatus: "active" },
      { id: ids.staleManager, organizationId: ids.organization, name: "Stale Manager", email: `${ids.staleManager}@example.com`, role: "manager", accountStatus: "active" },
      { id: ids.eastAgent, organizationId: ids.organization, name: "East Agent", email: `${ids.eastAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.westAgent, organizationId: ids.organization, name: "West Agent", email: `${ids.westAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.transferAgent, organizationId: ids.organization, name: "Transfer Agent", email: `${ids.transferAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.concurrentAgent, organizationId: ids.organization, name: "Concurrent Agent", email: `${ids.concurrentAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.lifecycleAgent, organizationId: ids.organization, name: "Lifecycle Agent", email: `${ids.lifecycleAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.otherAdmin, organizationId: ids.otherOrganization, name: "Other Admin", email: `${ids.otherAdmin}@example.com`, role: "admin", accountStatus: "active" },
      { id: ids.otherAgent, organizationId: ids.otherOrganization, name: "Other Agent", email: `${ids.otherAgent}@example.com`, role: "agent", accountStatus: "active" },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: randomUUID(), teamId: ids.east, profileId: ids.manager, role: "manager" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.staleManager, role: "manager" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.eastAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.west, profileId: ids.westAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.transferAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.concurrentAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.lifecycleAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.otherTeam, profileId: ids.otherAgent, role: "agent" },
    ]);
    await getDb().insert(sessions).values({
      id: ids.lifecycleSession,
      profileId: ids.lifecycleAgent,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await getDb().insert(coachingSessions).values([
      {
        id: ids.coachingSession,
        organizationId: ids.organization,
        createdByProfileId: ids.manager,
        coachProfileId: ids.manager,
        category: "performance",
        sessionDate: "2026-08-05",
      },
      {
        id: ids.otherCoachingSession,
        organizationId: ids.otherOrganization,
        createdByProfileId: ids.otherAdmin,
        coachProfileId: ids.otherAdmin,
        category: "performance",
        sessionDate: "2026-08-05",
      },
    ]);
    await getDb().insert(coachingSessionParticipants).values([
      {
        id: randomUUID(),
        sessionId: ids.coachingSession,
        agentProfileId: ids.eastAgent,
        teamIdSnapshot: ids.east,
        teamNameSnapshot: `East ${suffix}`,
      },
      {
        id: randomUUID(),
        sessionId: ids.otherCoachingSession,
        agentProfileId: ids.otherAgent,
        teamIdSnapshot: ids.otherTeam,
        teamNameSnapshot: `Other ${suffix}`,
      },
    ]);
  });

  afterAll(async () => {
    await getDb().delete(manualFlagCaseEvents).where(inArray(manualFlagCaseEvents.actorProfileId, profileIds));
    await getDb().delete(manualFlagCases).where(eq(manualFlagCases.organizationId, ids.organization));
    await getDb().delete(coachingSessionParticipants).where(inArray(coachingSessionParticipants.sessionId, [ids.coachingSession, ids.otherCoachingSession]));
    await getDb().delete(coachingSessions).where(inArray(coachingSessions.id, [ids.coachingSession, ids.otherCoachingSession]));
    await getDb().delete(shadowingSessions).where(eq(shadowingSessions.organizationId, ids.organization));
    await getDb().delete(teamTransferRequests).where(eq(teamTransferRequests.organizationId, ids.organization));
    await getDb().delete(employmentStatusEvents).where(eq(employmentStatusEvents.organizationId, ids.organization));
    await getDb().delete(auditLogs).where(inArray(auditLogs.actorProfileId, profileIds));
    if (createdAgentId) {
      await getDb().delete(emailDeliveryAttempts).where(eq(emailDeliveryAttempts.profileId, createdAgentId));
      await getDb().delete(accountInvitationTokens).where(eq(accountInvitationTokens.profileId, createdAgentId));
      await getDb().delete(sourceUserMappings).where(eq(sourceUserMappings.profileId, createdAgentId));
      await getDb().delete(teamMemberships).where(eq(teamMemberships.profileId, createdAgentId));
      await getDb().delete(profiles).where(eq(profiles.id, createdAgentId));
    }
    await getDb().delete(sessions).where(inArray(sessions.profileId, profileIds));
    await getDb().delete(teamMemberships).where(inArray(teamMemberships.profileId, [...profileIds, ids.otherAgent]));
    await getDb().delete(profiles).where(inArray(profiles.id, [...profileIds, ids.otherAdmin, ids.otherAgent]));
    await getDb().delete(teams).where(inArray(teams.id, [ids.east, ids.west, ids.otherTeam]));
    await getDb().delete(organizations).where(inArray(organizations.id, [ids.organization, ids.otherOrganization]));
    await getPool().end();
  });

  it("allows assigned-team shadowing and manual flags while rejecting another team", async () => {
    const shadowingId = await createShadowingSession(eastManager, {
      agentProfileId: ids.eastAgent,
      scheduledDate: "2026-08-10",
      objective: "Observe discovery calls",
    });
    await expect(createShadowingSession(eastManager, {
      agentProfileId: ids.westAgent,
      scheduledDate: "2026-08-10",
      objective: "Out of scope",
    })).rejects.toThrow("Forbidden");

    const manualFlagId = await createManualFlagCase(eastManager, {
      agentProfileId: ids.eastAgent,
      category: "Quality",
      severity: "high",
      reason: "Published reason",
      internalNotes: "Manager-only investigation detail",
      requiredAction: "Attend coaching",
      relatedCoachingSessionId: ids.coachingSession,
      publishToAgent: true,
    });
    await expect(createManualFlagCase(eastManager, {
      agentProfileId: ids.westAgent,
      category: "Quality",
      severity: "high",
      reason: "Out of scope",
      publishToAgent: true,
    })).rejects.toThrow("Forbidden");
    await expect(createManualFlagCase(eastManager, {
      agentProfileId: ids.eastAgent,
      category: "Cross-organization coaching link",
      severity: "high",
      reason: "Forged related session",
      relatedCoachingSessionId: ids.otherCoachingSession,
      publishToAgent: false,
    })).rejects.toThrow("Forbidden");

    const agentRows = await listManualFlagCases({
      id: ids.eastAgent,
      role: "agent",
      teamIds: [ids.east],
      organizationId: ids.organization,
    });
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]).toMatchObject({ reason: "Published reason", internalNotes: null });
    await updateManualFlagCase(admin, {
      caseId: manualFlagId,
      status: "under_review",
      assignedOwnerId: ids.admin,
      publishToAgent: true,
    });
    await expect(updateManualFlagCase(admin, {
      caseId: manualFlagId,
      status: "action_required",
      assignedOwnerId: ids.otherAdmin,
    })).rejects.toThrow("Forbidden");
    const events = await getDb().select().from(manualFlagCaseEvents)
      .where(eq(manualFlagCaseEvents.caseId, manualFlagId));
    expect(events).toHaveLength(2);

    expect(await listShadowingSessions({ id: ids.eastAgent, role: "agent", teamIds: [ids.east], organizationId: ids.organization })).toEqual([]);
    await completeShadowingSession(eastManager, {
      sessionId: shadowingId,
      internalNotes: "Leader-only note",
      publishedOutcome: "Observed a complete discovery call",
      publishToAgent: true,
    });
    const agentShadowing = await listShadowingSessions({ id: ids.eastAgent, role: "agent", teamIds: [ids.east], organizationId: ids.organization });
    expect(agentShadowing).toHaveLength(1);
    expect(agentShadowing[0]).toMatchObject({ publishedOutcome: "Observed a complete discovery call", internalNotes: null });
    await expect(createManualFlagCase(admin, {
      agentProfileId: ids.otherAgent,
      category: "Cross organization",
      severity: "high",
      reason: "Forbidden",
      publishToAgent: false,
    })).rejects.toThrow("Forbidden");
  });

  it("requires management review and applies an approved transfer transactionally", async () => {
    const requestId = await createTeamTransferRequest(eastManager, {
      agentProfileId: ids.transferAgent,
      destinationTeamId: ids.west,
      reason: "Balance staffing",
    });
    await expect(createTeamTransferRequest(eastManager, {
      agentProfileId: ids.transferAgent,
      destinationTeamId: ids.west,
      reason: "Duplicate",
    })).rejects.toThrow(/open transfer request/);
    await expect(reviewTeamTransferRequest(eastManager, {
      requestId,
      decision: "approved",
    })).rejects.toThrow("Forbidden");
    await reviewTeamTransferRequest(admin, { requestId, decision: "approved", reviewNote: "Approved" });
    await applyTeamTransferRequest(admin, requestId);

    const activeMemberships = await getDb().select({ teamId: teamMemberships.teamId })
      .from(teamMemberships)
      .where(and(eq(teamMemberships.profileId, ids.transferAgent), eq(teamMemberships.active, true), isNull(teamMemberships.endedAt)));
    expect(activeMemberships).toEqual([{ teamId: ids.west }]);
    const [request] = await getDb().select({ status: teamTransferRequests.status, appliedAt: teamTransferRequests.appliedAt })
      .from(teamTransferRequests).where(eq(teamTransferRequests.id, requestId));
    expect(request?.status).toBe("applied");
    expect(request?.appliedAt).toBeInstanceOf(Date);
    const requestAudit = await getDb().select({ action: auditLogs.action }).from(auditLogs)
      .where(eq(auditLogs.entityId, requestId));
    expect(requestAudit.map((row) => row.action)).toEqual(expect.arrayContaining([
      "team_transfer.submitted",
      "team_transfer.approved",
      "team_transfer.applied",
    ]));
  });

  it("rejects same-team, cross-organization, and stale transfer requests", async () => {
    await expect(createTeamTransferRequest(eastManager, {
      agentProfileId: ids.eastAgent,
      destinationTeamId: ids.east,
      reason: "Same team",
    })).rejects.toThrow(/must differ/);
    await expect(createTeamTransferRequest(eastManager, {
      agentProfileId: ids.eastAgent,
      destinationTeamId: ids.otherTeam,
      reason: "Cross organization",
    })).rejects.toThrow(/not found/);
    const requestId = await createTeamTransferRequest(eastManager, {
      agentProfileId: ids.eastAgent,
      destinationTeamId: ids.west,
      reason: "Will become stale",
    });
    const [membership] = await getDb().select({ id: teamMemberships.id }).from(teamMemberships)
      .where(and(eq(teamMemberships.profileId, ids.eastAgent), eq(teamMemberships.active, true), isNull(teamMemberships.endedAt)));
    await getDb().update(teamMemberships).set({ active: false, endedAt: new Date() }).where(eq(teamMemberships.id, membership!.id));
    await getDb().insert(teamMemberships).values({ id: randomUUID(), teamId: ids.west, profileId: ids.eastAgent, role: "agent" });
    expect(await listManualFlagCases(eastManager)).toEqual([]);
    expect(await listShadowingSessions(eastManager)).toEqual([]);
    await reviewTeamTransferRequest(admin, { requestId, decision: "approved" });
    await expect(applyTeamTransferRequest(admin, requestId)).rejects.toThrow(/stale/);
  });

  it("serializes duplicate transfer submissions and concurrent application", async () => {
    const submissions = await Promise.allSettled([
      createTeamTransferRequest(eastManager, {
        agentProfileId: ids.concurrentAgent,
        destinationTeamId: ids.west,
        reason: "Concurrent one",
      }),
      createTeamTransferRequest(eastManager, {
        agentProfileId: ids.concurrentAgent,
        destinationTeamId: ids.west,
        reason: "Concurrent two",
      }),
    ]);
    expect(submissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(submissions.filter((result) => result.status === "rejected")).toHaveLength(1);
    const requestId = (submissions.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<string>).value;
    await reviewTeamTransferRequest(admin, { requestId, decision: "approved" });

    const applications = await Promise.allSettled([
      applyTeamTransferRequest(admin, requestId),
      applyTeamTransferRequest(admin, requestId),
    ]);
    expect(applications.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(applications.filter((result) => result.status === "rejected")).toHaveLength(1);
    const memberships = await getDb().select({ teamId: teamMemberships.teamId })
      .from(teamMemberships)
      .where(and(
        eq(teamMemberships.profileId, ids.concurrentAgent),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ));
    expect(memberships).toEqual([{ teamId: ids.west }]);
  });

  it("keeps a manager with no team at empty mutation scope", async () => {
    await expect(createTeamTransferRequest(noTeamManager, {
      agentProfileId: ids.eastAgent,
      destinationTeamId: ids.west,
      reason: "No scope",
    })).rejects.toThrow("Forbidden");
  });

  it("rejects stale manager team claims after the persisted assignment ends", async () => {
    await getDb().update(teamMemberships).set({ active: false, endedAt: new Date() }).where(
      and(
        eq(teamMemberships.profileId, ids.staleManager),
        eq(teamMemberships.teamId, ids.east),
      ),
    );

    await expect(createShadowingSession(staleManager, {
      agentProfileId: ids.eastAgent,
      scheduledDate: "2026-08-12",
      objective: "Stale scope",
    })).rejects.toThrow("Forbidden");
    await expect(recordEmploymentStatus(staleManager, {
      profileId: ids.eastAgent,
      status: "deactivated",
      reason: "Stale scope",
    })).rejects.toThrow("Forbidden");
    await expect(createTeamAgent(staleManager, {
      name: "Stale Agent",
      email: `stale-agent-${suffix}@example.com`,
      teamId: ids.east,
      dialerName: `Stale Dialer ${suffix}`,
    })).rejects.toThrow(/assigned teams/);
  });

  it("lets a manager create only an agent in an assigned team without custom permissions", async () => {
    const created = await createTeamAgent(eastManager, {
      name: "Created Agent",
      email: `created-agent-${suffix}@example.com`,
      teamId: ids.east,
      dialerName: `Created Dialer ${suffix}`,
      employmentStartDate: "2026-08-01",
    });
    createdAgentId = created.profileId;
    const [profile] = await getDb().select({ role: profiles.role, employmentStartDate: profiles.employmentStartDate })
      .from(profiles).where(eq(profiles.id, created.profileId));
    expect(profile).toEqual({ role: "agent", employmentStartDate: "2026-08-01" });
    const invitations = await getDb().select({ id: accountInvitationTokens.id })
      .from(accountInvitationTokens).where(eq(accountInvitationTokens.profileId, created.profileId));
    expect(invitations).toHaveLength(1);
    await expect(createTeamAgent(eastManager, {
      name: "Wrong Team Agent",
      email: `wrong-team-${suffix}@example.com`,
      teamId: ids.west,
      dialerName: `Wrong Team ${suffix}`,
    })).rejects.toThrow(/assigned teams/);
    await expect(createAdminUser(eastManager, {
      name: "Forbidden Manager",
      email: `forbidden-manager-${suffix}@example.com`,
      role: "manager",
      teamId: ids.east,
      dialerName: `Forbidden Manager ${suffix}`,
      dialerAliases: [],
      permissionOverrides: [],
    })).rejects.toThrow("Forbidden");
  });

  it("soft-deactivates only an assigned-team agent, preserves history, and revokes sessions", async () => {
    const concurrentActions = await Promise.allSettled([
      recordEmploymentStatus(eastManager, {
        profileId: ids.lifecycleAgent,
        status: "deactivated",
        reason: "Operational deactivation A",
      }),
      recordEmploymentStatus(eastManager, {
        profileId: ids.lifecycleAgent,
        status: "deactivated",
        reason: "Operational deactivation B",
      }),
    ]);
    expect(concurrentActions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrentActions.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [profile] = await getDb().select({ active: profiles.active, accountStatus: profiles.accountStatus, employmentStatus: profiles.employmentStatus })
      .from(profiles).where(eq(profiles.id, ids.lifecycleAgent));
    const [session] = await getDb().select({ revokedAt: sessions.revokedAt }).from(sessions).where(eq(sessions.id, ids.lifecycleSession));
    const events = await getDb().select().from(employmentStatusEvents).where(eq(employmentStatusEvents.profileId, ids.lifecycleAgent));
    expect(profile).toEqual({ active: false, accountStatus: "deactivated", employmentStatus: "deactivated" });
    expect(session?.revokedAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    await expect(recordEmploymentStatus(eastManager, {
      profileId: ids.lifecycleAgent,
      status: "active",
      reason: "Forged manager reactivation",
    })).rejects.toThrow("Forbidden");
    await expect(recordEmploymentStatus(eastManager, {
      profileId: ids.lifecycleAgent,
      status: "deactivated",
      reason: "Duplicate deactivation",
    })).rejects.toThrow(/already deactivated/);
    await expect(recordEmploymentStatus(eastManager, {
      profileId: ids.westAgent,
      status: "terminated",
      reason: "Out of scope",
    })).rejects.toThrow("Forbidden");
  });
});
