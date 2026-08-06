import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import { activeMappingKey, primaryMappingKey } from "@/admin/policy";
import { getDb } from "@/db";
import {
  organizations,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { listMatchableUsers } from "@/leaderboard/data";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];

afterEach(async () => {
  if (profileIds.length > 0) {
    await getDb().delete(sourceUserMappings)
      .where(inArray(sourceUserMappings.profileId, profileIds));
    await getDb().delete(teamMemberships)
      .where(inArray(teamMemberships.profileId, profileIds));
  }
  if (teamIds.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, teamIds.splice(0)));
  }
  if (profileIds.length > 0) {
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  }
  if (organizationIds.length > 0) {
    await getDb().delete(organizations)
      .where(inArray(organizations.id, organizationIds.splice(0)));
  }
});

describe("leaderboard profile visibility", () => {
  it("excludes deleted profiles and retains active agents", async () => {
    const organizationId = newId();
    const teamId = newId();
    const activeId = newId();
    const deletedId = newId();
    organizationIds.push(organizationId);
    teamIds.push(teamId);
    profileIds.push(activeId, deletedId);
    await getDb().insert(organizations).values({
      id: organizationId,
      name: `Leaderboard ${organizationId}`,
    });
    await getDb().insert(teams).values({
      id: teamId,
      organizationId,
      name: `Leaderboard Team ${teamId}`,
      active: true,
    });
    await getDb().insert(profiles).values([
      {
        id: activeId,
        organizationId,
        email: `${activeId}@example.test`,
        name: "Active Leaderboard Agent",
        role: "agent",
        active: true,
        accountStatus: "active",
        passwordHash: "test-hash",
      },
      {
        id: deletedId,
        organizationId,
        email: `${deletedId}@example.test`,
        name: "Deleted Leaderboard Agent",
        role: "agent",
        active: false,
        accountStatus: "deleted",
        deletedAt: new Date(),
        passwordHash: "test-hash",
      },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: newId(), teamId, profileId: activeId, role: "agent", active: true },
      { id: newId(), teamId, profileId: deletedId, role: "agent", active: true },
    ]);
    await getDb().insert(sourceUserMappings).values([
      {
        id: newId(),
        source: "dialer",
        sourceAgentName: "Active Leaderboard Agent",
        normalizedAgentName: `active-${activeId}`,
        activeMappingKey: activeMappingKey("dialer", `active-${activeId}`),
        primaryMappingKey: primaryMappingKey("dialer", activeId),
        profileId: activeId,
        active: true,
        isPrimary: true,
      },
      {
        id: newId(),
        source: "dialer",
        sourceAgentName: "Deleted Leaderboard Agent",
        normalizedAgentName: `deleted-${deletedId}`,
        activeMappingKey: activeMappingKey("dialer", `deleted-${deletedId}`),
        primaryMappingKey: primaryMappingKey("dialer", deletedId),
        profileId: deletedId,
        active: true,
        isPrimary: true,
      },
    ]);

    const users = await listMatchableUsers({
      id: activeId,
      role: "admin",
      teamIds: [],
      organizationId,
    });
    expect(users.map((user) => user.id)).toEqual([activeId]);
  });

  it("enforces admin, manager, empty-manager, and agent scopes at the profile query", async () => {
    const organizationId = newId();
    const eastTeamId = newId();
    const westTeamId = newId();
    const eastAgentId = newId();
    const westAgentId = newId();
    organizationIds.push(organizationId);
    teamIds.push(eastTeamId, westTeamId);
    profileIds.push(eastAgentId, westAgentId);

    await getDb().insert(organizations).values({
      id: organizationId,
      name: `Leaderboard scope ${organizationId}`,
    });
    await getDb().insert(teams).values([
      { id: eastTeamId, organizationId, name: "Leaderboard East", active: true },
      { id: westTeamId, organizationId, name: "Leaderboard West", active: true },
    ]);
    await getDb().insert(profiles).values([
      {
        id: eastAgentId,
        organizationId,
        email: `${eastAgentId}@example.test`,
        name: "Scoped East Agent",
        role: "agent",
        active: true,
        accountStatus: "active",
        passwordHash: "test-hash",
      },
      {
        id: westAgentId,
        organizationId,
        email: `${westAgentId}@example.test`,
        name: "Scoped West Agent",
        role: "agent",
        active: true,
        accountStatus: "active",
        passwordHash: "test-hash",
      },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: newId(), teamId: eastTeamId, profileId: eastAgentId, role: "agent", active: true },
      { id: newId(), teamId: westTeamId, profileId: westAgentId, role: "agent", active: true },
    ]);
    await getDb().insert(sourceUserMappings).values([
      {
        id: newId(),
        source: "dialer",
        sourceAgentName: "Scoped East",
        normalizedAgentName: `scoped-east-${eastAgentId}`,
        activeMappingKey: activeMappingKey("dialer", `scoped-east-${eastAgentId}`),
        primaryMappingKey: primaryMappingKey("dialer", eastAgentId),
        profileId: eastAgentId,
        active: true,
        isPrimary: true,
      },
      {
        id: newId(),
        source: "dialer",
        sourceAgentName: "Scoped West",
        normalizedAgentName: `scoped-west-${westAgentId}`,
        activeMappingKey: activeMappingKey("dialer", `scoped-west-${westAgentId}`),
        primaryMappingKey: primaryMappingKey("dialer", westAgentId),
        profileId: westAgentId,
        active: true,
        isPrimary: true,
      },
    ]);

    const adminUsers = await listMatchableUsers({
      id: newId(), role: "admin", teamIds: [], organizationId,
    });
    const managerUsers = await listMatchableUsers({
      id: newId(), role: "manager", teamIds: [eastTeamId], organizationId,
    });
    const emptyManagerUsers = await listMatchableUsers({
      id: newId(), role: "manager", teamIds: [], organizationId,
    });
    const agentUsers = await listMatchableUsers({
      id: westAgentId, role: "agent", teamIds: [westTeamId], organizationId,
    });

    expect(adminUsers.map((user) => user.id).sort()).toEqual(
      [eastAgentId, westAgentId].sort(),
    );
    expect(managerUsers.map((user) => user.id)).toEqual([eastAgentId]);
    expect(emptyManagerUsers).toEqual([]);
    expect(agentUsers.map((user) => user.id)).toEqual([westAgentId]);
  });
});
