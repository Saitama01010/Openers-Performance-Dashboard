import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type ScopedTeam = {
  id: string;
  name: string;
};

export type ScopedAgent = {
  id: string;
  name: string;
  americanName: string | null;
  teams: ScopedTeam[];
  managerIds: string[];
};

export type ScopedManager = {
  id: string;
  name: string;
  teams: ScopedTeam[];
};

export async function listOrganizationActiveManagers(actor: Actor) {
  const rows = await getDb()
    .select({
      id: profiles.id,
      name: profiles.name,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(profiles)
    .leftJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, profiles.id),
        eq(teamMemberships.role, "manager"),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .leftJoin(
      teams,
      and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)),
    )
    .where(
      and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "manager"),
      ),
    )
    .orderBy(asc(profiles.name), asc(profiles.id), asc(teams.name));

  const managers = new Map<string, ScopedManager>();
  for (const row of rows) {
    const manager = managers.get(row.id) ?? {
      id: row.id,
      name: row.name,
      teams: [],
    };
    if (row.teamId && row.teamName) {
      if (!manager.teams.some((team) => team.id === row.teamId)) {
        manager.teams.push({ id: row.teamId, name: row.teamName });
      }
    }
    managers.set(row.id, manager);
  }
  return Array.from(managers.values());
}

export async function listScopedActiveAgents(actor: Actor) {
  const scopeWhere =
    actor.role === "manager"
      ? actor.teamIds.length > 0
        ? inArray(teams.id, actor.teamIds)
        : eq(profiles.id, "__empty_manager_scope__")
      : actor.role === "agent"
        ? eq(profiles.id, actor.id)
        : undefined;

  const rows = await getDb()
    .select({
      id: profiles.id,
      name: profiles.name,
      americanName: sourceUserMappings.sourceAgentName,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(profiles)
    .leftJoin(
      sourceUserMappings,
      and(
        eq(sourceUserMappings.profileId, profiles.id),
        eq(sourceUserMappings.source, "dialer"),
        eq(sourceUserMappings.active, true),
        eq(sourceUserMappings.isPrimary, true),
      ),
    )
    .leftJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, profiles.id),
        eq(teamMemberships.role, "agent"),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .leftJoin(
      teams,
      and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)),
    )
    .where(
      and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
        scopeWhere,
      ),
    )
    .orderBy(asc(profiles.name), asc(profiles.id), asc(teams.name));

  const managers =
    actor.role === "agent" ? [] : await listOrganizationActiveManagers(actor);
  const managerIdsByTeam = new Map<string, string[]>();
  for (const manager of managers) {
    for (const team of manager.teams) {
      const current = managerIdsByTeam.get(team.id) ?? [];
      if (!current.includes(manager.id)) current.push(manager.id);
      managerIdsByTeam.set(team.id, current);
    }
  }

  const agents = new Map<string, ScopedAgent>();
  for (const row of rows) {
    const agent = agents.get(row.id) ?? {
      id: row.id,
      name: row.name,
      americanName: row.americanName,
      teams: [],
      managerIds: [],
    };
    if (row.teamId && row.teamName && !agent.teams.some((team) => team.id === row.teamId)) {
      agent.teams.push({ id: row.teamId, name: row.teamName });
      for (const managerId of managerIdsByTeam.get(row.teamId) ?? []) {
        if (!agent.managerIds.includes(managerId)) agent.managerIds.push(managerId);
      }
    }
    agents.set(row.id, agent);
  }

  return Array.from(agents.values());
}

export function uniqueScopedTeams(agents: readonly ScopedAgent[]) {
  const teamsById = new Map<string, ScopedTeam>();
  for (const agent of agents) {
    for (const team of agent.teams) teamsById.set(team.id, team);
  }
  return Array.from(teamsById.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
