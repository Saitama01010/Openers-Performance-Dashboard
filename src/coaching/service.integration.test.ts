import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

import { permanentlyDeleteValidatedUsers } from "@/admin/data";
import type { Actor, Role } from "@/auth/authorization";
import { getCoachingLeaderboardData } from "@/coaching/data";
import { createCoachingSession } from "@/coaching/service";
import { getDb } from "@/db";
import {
  auditLogs,
  coachingSessionParticipants,
  coachingSessions,
  organizations,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];
const membershipIds: string[] = [];
const sessionIds: string[] = [];
const triggerNames: string[] = [];

async function createOrganization() {
  const id = newId();
  organizationIds.push(id);
  await getDb().insert(organizations).values({
    id,
    name: `Coaching Test ${id}`,
  });
  return id;
}

async function createProfile(organizationId: string, role: Role) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    organizationId,
    email: `${id}@coaching.example.test`,
    name: `${role} ${id.slice(0, 8)}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return id;
}

async function createTeam(organizationId: string) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({
    id,
    organizationId,
    name: `Coaching Team ${id}`,
    active: true,
  });
  return id;
}

async function assignToTeam(
  teamId: string,
  profileId: string,
  role: "manager" | "agent",
) {
  const id = newId();
  membershipIds.push(id);
  await getDb().insert(teamMemberships).values({
    id,
    teamId,
    profileId,
    role,
    active: true,
  });
}

function actor(
  id: string,
  role: "admin" | "manager",
  organizationId: string,
  teamIds: string[] = [],
): Actor {
  return { id, role, organizationId, teamIds };
}

afterEach(async () => {
  for (const triggerName of triggerNames.splice(0)) {
    await getDb().execute(
      sql.raw(`DROP TRIGGER IF EXISTS \`${triggerName}\``),
    );
  }

  if (profileIds.length > 0) {
    await getDb()
      .delete(auditLogs)
      .where(inArray(auditLogs.actorProfileId, profileIds));
  }
  if (sessionIds.length > 0) {
    await getDb()
      .delete(coachingSessionParticipants)
      .where(inArray(coachingSessionParticipants.sessionId, sessionIds));
    await getDb()
      .delete(coachingSessions)
      .where(inArray(coachingSessions.id, sessionIds.splice(0)));
  }
  if (membershipIds.length > 0) {
    await getDb()
      .delete(teamMemberships)
      .where(inArray(teamMemberships.id, membershipIds.splice(0)));
  }
  if (profileIds.length > 0) {
    await getDb()
      .delete(profiles)
      .where(inArray(profiles.id, profileIds.splice(0)));
  }
  if (teamIds.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, teamIds.splice(0)));
  }
  if (organizationIds.length > 0) {
    await getDb()
      .delete(organizations)
      .where(inArray(organizations.id, organizationIds.splice(0)));
  }
});

describe("coaching session persistence integration", () => {
  it("stores one manager-created group session with deduplicated participants, snapshots, and safe audit metadata", async () => {
    const organizationId = await createOrganization();
    const managerId = await createProfile(organizationId, "manager");
    const agentA = await createProfile(organizationId, "agent");
    const agentB = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    await assignToTeam(teamId, managerId, "manager");
    await assignToTeam(teamId, agentA, "agent");
    await assignToTeam(teamId, agentB, "agent");

    const result = await createCoachingSession(
      actor(managerId, "manager", organizationId, [teamId]),
      {
        agentProfileIds: [agentA, agentA, agentB],
        category: "performance",
        coachProfileId: managerId,
        note: "  Focus on discovery questions.  ",
        sessionDate: "2026-01-05",
      },
    );
    sessionIds.push(result.sessionId);

    const [session] = await getDb()
      .select()
      .from(coachingSessions)
      .where(eq(coachingSessions.id, result.sessionId));
    const participants = await getDb()
      .select()
      .from(coachingSessionParticipants)
      .where(eq(coachingSessionParticipants.sessionId, result.sessionId));
    const [audit] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "coaching.session_created"),
          eq(auditLogs.entityId, result.sessionId),
        ),
      );

    expect(session).toMatchObject({
      organizationId,
      createdByProfileId: managerId,
      coachProfileId: managerId,
      note: "Focus on discovery questions.",
    });
    expect(participants).toHaveLength(2);
    expect(
      participants.map((participant) => participant.agentProfileId).sort(),
    ).toEqual([agentA, agentB].sort());
    expect(participants.every((participant) => participant.teamIdSnapshot === teamId)).toBe(true);
    expect(audit?.metadata).toMatchObject({
      participantCount: 2,
      createdByProfileId: managerId,
      coachProfileId: managerId,
      managerId,
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain("discovery questions");
  });

  it("stores an administrator submitter separately from self or manager coach attribution and rejects invalid credit", async () => {
    const organizationId = await createOrganization();
    const foreignOrganizationId = await createOrganization();
    const adminId = await createProfile(organizationId, "admin");
    const managerId = await createProfile(organizationId, "manager");
    const foreignManagerId = await createProfile(foreignOrganizationId, "manager");
    const assignedAgentId = await createProfile(organizationId, "agent");
    const unassignedAgentId = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    await assignToTeam(teamId, managerId, "manager");
    await assignToTeam(teamId, assignedAgentId, "agent");
    const admin = actor(adminId, "admin", organizationId);

    const selfCoached = await createCoachingSession(admin, {
      agentProfileIds: [assignedAgentId, unassignedAgentId],
      category: "improvement",
      coachProfileId: adminId,
      sessionDate: "2026-01-06",
    });
    const managerCredited = await createCoachingSession(admin, {
      agentProfileIds: [assignedAgentId],
      category: "adherence",
      coachProfileId: managerId,
      sessionDate: "2026-01-07",
    });
    sessionIds.push(selfCoached.sessionId, managerCredited.sessionId);

    await expect(
      createCoachingSession(admin, {
        agentProfileIds: [unassignedAgentId],
        category: "performance",
        coachProfileId: managerId,
        sessionDate: "2026-01-08",
      }),
    ).rejects.toThrow("not available for coaching");
    await expect(
      createCoachingSession(admin, {
        agentProfileIds: [assignedAgentId],
        category: "performance",
        coachProfileId: foreignManagerId,
        sessionDate: "2026-01-08",
      }),
    ).rejects.toThrow("coach selection");

    const stored = await getDb()
      .select({
        id: coachingSessions.id,
        createdByProfileId: coachingSessions.createdByProfileId,
        coachProfileId: coachingSessions.coachProfileId,
      })
      .from(coachingSessions)
      .where(
        inArray(coachingSessions.id, [
          selfCoached.sessionId,
          managerCredited.sessionId,
        ]),
      );
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selfCoached.sessionId,
          createdByProfileId: adminId,
          coachProfileId: adminId,
        }),
        expect.objectContaining({
          id: managerCredited.sessionId,
          createdByProfileId: adminId,
          coachProfileId: managerId,
        }),
      ]),
    );

    const leaderboard = await getCoachingLeaderboardData(admin, {
      dateRange: { from: "2026-01-05", to: "2026-01-11" },
      managerId,
      teamId,
      sort: "oneToOne",
      direction: "desc",
    });
    expect(leaderboard.applicableWeeks).toBe(1);
    expect(leaderboard.rows).toHaveLength(1);
    expect(leaderboard.rows[0]).toMatchObject({
      managerId,
      oneToOneCompleted: 1,
      oneToOneTarget: 25,
      teamCoachingCompleted: 0,
      teamCoachingTarget: 1,
    });
  });

  it("fails closed for an unassigned manager, empty selection, and future dates", async () => {
    const organizationId = await createOrganization();
    const managerId = await createProfile(organizationId, "manager");
    const agentId = await createProfile(organizationId, "agent");
    const manager = actor(managerId, "manager", organizationId);

    await expect(
      createCoachingSession(manager, {
        agentProfileIds: [agentId],
        category: "performance",
        coachProfileId: managerId,
        sessionDate: "2026-01-05",
      }),
    ).rejects.toThrow("not available for coaching");
    await expect(
      createCoachingSession(manager, {
        agentProfileIds: [],
        category: "performance",
        coachProfileId: managerId,
        sessionDate: "2026-01-05",
      }),
    ).rejects.toThrow("Select at least one agent");
    await expect(
      createCoachingSession(manager, {
        agentProfileIds: [agentId],
        category: "performance",
        coachProfileId: managerId,
        sessionDate: "2999-01-01",
      }),
    ).rejects.toThrow("cannot be in the future");
  });

  it("rolls the session and audit back when participant insertion fails", async () => {
    const organizationId = await createOrganization();
    const managerId = await createProfile(organizationId, "manager");
    const agentId = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    await assignToTeam(teamId, managerId, "manager");
    await assignToTeam(teamId, agentId, "agent");
    const triggerName = `coaching_fail_${newId().replaceAll("-", "")}`;
    triggerNames.push(triggerName);
    await getDb().execute(
      sql.raw(
        `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON ` +
          "`coaching_session_participants` FOR EACH ROW " +
          "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced participant failure'",
      ),
    );

    await expect(
      createCoachingSession(
        actor(managerId, "manager", organizationId, [teamId]),
        {
          agentProfileIds: [agentId],
          category: "performance",
          coachProfileId: managerId,
          sessionDate: "2026-01-05",
        },
      ),
    ).rejects.toThrow();

    const storedSessions = await getDb()
      .select({ id: coachingSessions.id })
      .from(coachingSessions)
      .where(eq(coachingSessions.organizationId, organizationId));
    const storedAudits = await getDb()
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorProfileId, managerId));
    expect(storedSessions).toEqual([]);
    expect(storedAudits).toEqual([]);
  });

  it("preserves a group session while participants remain and removes it when permanent deletion empties the group", async () => {
    const organizationId = await createOrganization();
    const adminId = await createProfile(organizationId, "admin");
    const managerId = await createProfile(organizationId, "manager");
    const agentA = await createProfile(organizationId, "agent");
    const agentB = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    await assignToTeam(teamId, managerId, "manager");
    await assignToTeam(teamId, agentA, "agent");
    await assignToTeam(teamId, agentB, "agent");
    const created = await createCoachingSession(
      actor(managerId, "manager", organizationId, [teamId]),
      {
        agentProfileIds: [agentA, agentB],
        category: "performance",
        coachProfileId: managerId,
        sessionDate: "2026-01-05",
      },
    );
    sessionIds.push(created.sessionId);
    const admin = actor(adminId, "admin", organizationId);

    await permanentlyDeleteValidatedUsers(admin, { userIds: [agentA] });
    let participants = await getDb()
      .select({ agentProfileId: coachingSessionParticipants.agentProfileId })
      .from(coachingSessionParticipants)
      .where(eq(coachingSessionParticipants.sessionId, created.sessionId));
    expect(participants).toEqual([{ agentProfileId: agentB }]);

    await permanentlyDeleteValidatedUsers(admin, { userIds: [agentB] });
    const sessions = await getDb()
      .select({ id: coachingSessions.id })
      .from(coachingSessions)
      .where(eq(coachingSessions.id, created.sessionId));
    participants = await getDb()
      .select({ agentProfileId: coachingSessionParticipants.agentProfileId })
      .from(coachingSessionParticipants)
      .where(eq(coachingSessionParticipants.sessionId, created.sessionId));
    expect(sessions).toEqual([]);
    expect(participants).toEqual([]);
  });
});
