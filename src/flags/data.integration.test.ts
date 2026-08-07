import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { Actor, Role } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  organizations,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { getPerformanceFlagsData, getTransferFlagsData } from "@/flags/data";
import { resetEnvForTests } from "@/env";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];
const membershipIds: string[] = [];
const versionIds: string[] = [];
const scopeKeys: string[] = [];
const metricIds: string[] = [];
const week = { start: "2026-08-03", end: "2026-08-09" };

async function createOrganization() {
  const id = newId();
  organizationIds.push(id);
  await getDb().insert(organizations).values({ id, name: `Flags Test ${id}` });
  return id;
}

async function createProfile(organizationId: string, role: Role) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    organizationId,
    email: `${id}@flags.example.test`,
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
    name: `Flags Team ${id}`,
    active: true,
  });
  return id;
}

async function assign(
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
  role: Role,
  organizationId: string,
  assignedTeamIds: string[] = [],
): Actor {
  return { id, role, organizationId, teamIds: assignedTeamIds };
}

async function insertActiveAndInactiveMetrics(input: {
  agentId: string;
  teamId: string;
  wrapSeconds?: number;
  pausedSeconds?: number;
}) {
  const activeVersionId = newId();
  const inactiveVersionId = newId();
  const activeScopeKey = `flags-active:${newId()}`;
  const inactiveScopeKey = `flags-inactive:${newId()}`;
  versionIds.push(activeVersionId, inactiveVersionId);
  scopeKeys.push(activeScopeKey);
  await getDb().insert(dialerDatasetVersions).values([
    {
      id: activeVersionId,
      scopeKey: activeScopeKey,
      source: "dialer",
      importType: "agent_hours",
      reportingDate: week.start,
      teamId: input.teamId,
      versionNumber: 1,
      status: "active",
    },
    {
      id: inactiveVersionId,
      scopeKey: inactiveScopeKey,
      source: "dialer",
      importType: "agent_hours",
      reportingDate: week.start,
      teamId: input.teamId,
      versionNumber: 1,
      status: "superseded",
    },
  ]);
  await getDb().insert(dialerDatasetScopes).values({
    scopeKey: activeScopeKey,
    source: "dialer",
    importType: "agent_hours",
    reportingDate: week.start,
    teamId: input.teamId,
    activeVersionId,
  });
  const activeMetricId = newId();
  const inactiveMetricId = newId();
  metricIds.push(activeMetricId, inactiveMetricId);
  await getDb().insert(dialerAgentHourlyMetrics).values([
    {
      id: activeMetricId,
      source: "dialer",
      sourceAgentName: "Active Agent",
      agentProfileId: input.agentId,
      versionId: activeVersionId,
      metricDate: week.start,
      metricHour: 9,
      metricKey: "active",
      talkSeconds: 3600,
      wrapSeconds: input.wrapSeconds ?? 420,
      readySeconds: 0,
      pausedSeconds: input.pausedSeconds ?? 480,
      teamIdSnapshot: input.teamId,
      teamNameSnapshot: "Flags Team",
      rowHash: "a".repeat(64),
    },
    {
      id: inactiveMetricId,
      source: "dialer",
      sourceAgentName: "Inactive Agent",
      agentProfileId: input.agentId,
      versionId: inactiveVersionId,
      metricDate: week.start,
      metricHour: 10,
      metricKey: "inactive",
      talkSeconds: 3600,
      wrapSeconds: 3600,
      readySeconds: 0,
      pausedSeconds: 3600,
      teamIdSnapshot: input.teamId,
      teamNameSnapshot: "Flags Team",
      rowHash: "b".repeat(64),
    },
  ]);
}

afterEach(async () => {
  if (metricIds.length > 0) {
    await getDb()
      .delete(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.id, metricIds.splice(0)));
  }
  if (scopeKeys.length > 0) {
    await getDb()
      .delete(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys.splice(0)));
  }
  if (versionIds.length > 0) {
    await getDb()
      .delete(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.id, versionIds.splice(0)));
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

describe("flag data authorization and active-version integration", () => {
  it("returns only the agent's record, ignores broadening filters, and omits aggregate metadata", async () => {
    const organizationId = await createOrganization();
    const managerId = await createProfile(organizationId, "manager");
    const agentId = await createProfile(organizationId, "agent");
    const otherAgentId = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    const otherTeamId = await createTeam(organizationId);
    await assign(teamId, managerId, "manager");
    await assign(teamId, agentId, "agent");
    await assign(otherTeamId, otherAgentId, "agent");
    await insertActiveAndInactiveMetrics({ agentId, teamId });

    const data = await getPerformanceFlagsData(
      actor(agentId, "agent", organizationId, [teamId]),
      {
        dateRange: { from: week.start, to: week.end },
        profileId: agentId,
        teamId: otherTeamId,
        managerId: "another-manager",
        flaggedOnly: true,
      },
    );

    expect(data.rows).toEqual([]);
    expect(data.summary).toBeNull();
    expect(data.agents).toEqual([]);
    expect(data.teams).toEqual([]);
    expect(data.managers).toEqual([]);
    expect(data.filters).toMatchObject({
      profileId: agentId,
      teamId: undefined,
      managerId: undefined,
    });
  });

  it("rejects another profile without an existence signal and gives an unassigned manager an empty scope", async () => {
    const organizationId = await createOrganization();
    const agentId = await createProfile(organizationId, "agent");
    const managerId = await createProfile(organizationId, "manager");

    await expect(
      getPerformanceFlagsData(actor(agentId, "agent", organizationId), {
        dateRange: { from: week.start, to: week.end },
        profileId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow("Forbidden");
    const managerData = await getPerformanceFlagsData(
      actor(managerId, "manager", organizationId),
      { dateRange: { from: week.start, to: week.end } },
    );
    expect(managerData.rows).toEqual([]);
    expect(managerData.summary).toMatchObject({ scopedAgents: 0 });
  });

  it("returns only organization-scoped Manager and Agent options for an administrator", async () => {
    const organizationId = await createOrganization();
    const otherOrganizationId = await createOrganization();
    const adminId = await createProfile(organizationId, "admin");
    const managerId = await createProfile(organizationId, "manager");
    const agentId = await createProfile(organizationId, "agent");
    const otherManagerId = await createProfile(otherOrganizationId, "manager");
    const otherAgentId = await createProfile(otherOrganizationId, "agent");
    const teamId = await createTeam(organizationId);
    const otherTeamId = await createTeam(otherOrganizationId);
    await assign(teamId, managerId, "manager");
    await assign(teamId, agentId, "agent");
    await assign(otherTeamId, otherManagerId, "manager");
    await assign(otherTeamId, otherAgentId, "agent");

    const data = await getPerformanceFlagsData(
      actor(adminId, "admin", organizationId),
      { dateRange: { from: week.start, to: week.end } },
    );

    expect(data.managers.map((manager) => manager.id)).toEqual([managerId]);
    expect(data.agents.map((agent) => agent.id)).toEqual([agentId]);
    expect(data.teams.map((team) => team.id)).toEqual([teamId]);
  });

  it("limits manager Agent options to assigned active teams and rejects a forged profile ID", async () => {
    const organizationId = await createOrganization();
    const managerId = await createProfile(organizationId, "manager");
    const otherManagerId = await createProfile(organizationId, "manager");
    const agentId = await createProfile(organizationId, "agent");
    const otherAgentId = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    const otherTeamId = await createTeam(organizationId);
    await assign(teamId, managerId, "manager");
    await assign(teamId, agentId, "agent");
    await assign(otherTeamId, otherManagerId, "manager");
    await assign(otherTeamId, otherAgentId, "agent");
    const managerActor = actor(managerId, "manager", organizationId, [teamId]);

    const data = await getPerformanceFlagsData(managerActor, {
      dateRange: { from: week.start, to: week.end },
    });

    expect(data.managers.map((manager) => manager.id)).toEqual([managerId]);
    expect(data.agents.map((agent) => agent.id)).toEqual([agentId]);
    expect(data.teams.map((team) => team.id)).toEqual([teamId]);
    await expect(
      getPerformanceFlagsData(managerActor, {
        dateRange: { from: week.start, to: week.end },
        profileId: otherAgentId,
      }),
    ).rejects.toThrow("Forbidden");
    await expect(
      getPerformanceFlagsData(managerActor, {
        dateRange: { from: week.start, to: week.end },
        managerId: otherManagerId,
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("returns only agents who actually triggered a performance flag", async () => {
    const organizationId = await createOrganization();
    const adminId = await createProfile(organizationId, "admin");
    const flaggedId = await createProfile(organizationId, "agent");
    const unflaggedId = await createProfile(organizationId, "agent");
    const teamId = await createTeam(organizationId);
    await assign(teamId, flaggedId, "agent");
    await assign(teamId, unflaggedId, "agent");
    await insertActiveAndInactiveMetrics({
      agentId: flaggedId,
      teamId,
      wrapSeconds: 421,
    });
    await insertActiveAndInactiveMetrics({ agentId: unflaggedId, teamId });

    const data = await getPerformanceFlagsData(
      actor(adminId, "admin", organizationId),
      { dateRange: { from: week.start, to: week.end } },
    );

    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      agentId: flaggedId,
      wrapFlag: true,
      pauseFlag: false,
    });
    expect(data.summary).toMatchObject({
      scopedAgents: 2,
      flaggedAgents: 1,
      wrapFlags: 1,
      pauseFlags: 0,
    });
    expect(data.analytics.composition).toEqual([
      expect.objectContaining({ key: "wrap", count: 1, agents: 1 }),
      expect.objectContaining({ key: "pause", count: 0, agents: 0 }),
    ]);
    expect(data.analytics.teams[0]).toMatchObject({
      total: 1,
      wrapFlags: 1,
      pauseFlags: 0,
      agents: 1,
    });
    expect(data.analytics.trend[0]).toMatchObject({
      weekStart: week.start,
      wrapFlags: 1,
      pauseFlags: 0,
      agents: 1,
    });
    expect(data.pagination).toMatchObject({ total: 1, page: 1 });

    const pauseOnly = await getPerformanceFlagsData(
      actor(adminId, "admin", organizationId),
      { dateRange: { from: week.start, to: week.end }, pause: "flagged" },
    );
    expect(pauseOnly.rows).toEqual([]);
    expect(pauseOnly.analytics.composition.every((item) => item.count === 0)).toBe(true);
  });

  it("does not turn a Closed source failure into a false zero-deal Strong Flag", async () => {
    const organizationId = await createOrganization();
    const agentId = await createProfile(organizationId, "agent");
    const endpoint = process.env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL;
    const secret = process.env.LEADERBOARD_API_SECRET;
    process.env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL = "";
    process.env.LEADERBOARD_API_SECRET = "";
    resetEnvForTests();
    const data = await getTransferFlagsData(
      actor(agentId, "agent", organizationId),
      { dateRange: { from: week.start, to: week.end } },
    ).finally(() => {
      process.env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL = endpoint;
      process.env.LEADERBOARD_API_SECRET = secret;
      resetEnvForTests();
    });
    expect(data.source.status).toBe("unavailable");
    expect(data.rows).toEqual([]);
    expect(data.summary).toBeNull();
    expect(data.agents).toEqual([]);
    expect(data.teams).toEqual([]);
    expect(data.managers).toEqual([]);
  });
});
