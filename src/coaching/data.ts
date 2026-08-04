import "server-only";

import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import {
  assertCoachingLeaderboardAccess,
  assertCoachingViewAccess,
} from "@/auth/feature-access";
import {
  listOrganizationActiveManagers,
  listScopedActiveAgents,
  uniqueScopedTeams,
} from "@/agents/scope";
import type { CoachingCategory } from "@/coaching/domain";
import { buildCoachingLeaderboardRows } from "@/coaching/leaderboard";
import type { DashboardDateWindow } from "@/dashboard/date-range";
import { getDb } from "@/db";
import {
  coachingSessionParticipants,
  coachingSessions,
  profiles,
} from "@/db/schema";
import { actorOrganizationId } from "@/teams/visibility";

export type CoachingRoomFilters = {
  coachProfileId?: string;
  teamId?: string;
  agentProfileId?: string;
  category?: CoachingCategory;
  dateRange?: DashboardDateWindow;
  page: number;
  pageSize: number;
};

export type CoachingRoomRow = {
  id: string;
  sessionDate: string;
  coachProfileId: string;
  coachName: string;
  category: CoachingCategory;
  note: string | null;
  createdAt: string;
  participants: Array<{
    id: string;
    name: string;
    teamId: string | null;
    teamName: string;
  }>;
};

function emptyScopeCondition() {
  return eq(coachingSessions.id, "__empty_scope__");
}

export async function getCoachingRoomData(
  actor: Actor,
  filters: CoachingRoomFilters,
) {
  await assertCoachingViewAccess(actor);
  const [agents, managers] = await Promise.all([
    listScopedActiveAgents(actor),
    listOrganizationActiveManagers(actor),
  ]);
  const teams = uniqueScopedTeams(agents);
  const allowedTeamIds = new Set(teams.map((team) => team.id));
  const allowedAgentIds = new Set(agents.map((agent) => agent.id));
  const allowedCoachIds = new Set([
    actor.id,
    ...managers.map((manager) => manager.id),
  ]);
  const requestedTeamIsInvalid =
    Boolean(filters.teamId) && !allowedTeamIds.has(filters.teamId ?? "");
  const requestedAgentIsInvalid =
    Boolean(filters.agentProfileId) &&
    !allowedAgentIds.has(filters.agentProfileId ?? "");
  const requestedCoachIsInvalid =
    actor.role !== "admin" ||
    (Boolean(filters.coachProfileId) &&
      !allowedCoachIds.has(filters.coachProfileId ?? ""));

  const conditions: Array<SQL | undefined> = [
    eq(coachingSessions.organizationId, actorOrganizationId(actor)),
    actor.role === "manager"
      ? actor.teamIds.length > 0
        ? inArray(coachingSessionParticipants.teamIdSnapshot, actor.teamIds)
        : emptyScopeCondition()
      : undefined,
    requestedTeamIsInvalid || requestedAgentIsInvalid
      ? emptyScopeCondition()
      : undefined,
    filters.teamId
      ? eq(coachingSessionParticipants.teamIdSnapshot, filters.teamId)
      : undefined,
    filters.agentProfileId
      ? eq(coachingSessionParticipants.agentProfileId, filters.agentProfileId)
      : undefined,
    filters.category ? eq(coachingSessions.category, filters.category) : undefined,
    filters.dateRange
      ? and(
          filters.dateRange.from
            ? sql`${coachingSessions.sessionDate} >= ${filters.dateRange.from}`
            : undefined,
          filters.dateRange.to
            ? sql`${coachingSessions.sessionDate} <= ${filters.dateRange.to}`
            : undefined,
        )
      : undefined,
    actor.role === "admin" && filters.coachProfileId && !requestedCoachIsInvalid
      ? eq(coachingSessions.coachProfileId, filters.coachProfileId)
      : requestedCoachIsInvalid && filters.coachProfileId
        ? emptyScopeCondition()
        : undefined,
  ];
  const where = and(...conditions);
  const offset = (filters.page - 1) * filters.pageSize;
  const [countRows, idRows] = await Promise.all([
    getDb()
      .select({ total: countDistinct(coachingSessions.id) })
      .from(coachingSessions)
      .innerJoin(
        coachingSessionParticipants,
        eq(coachingSessionParticipants.sessionId, coachingSessions.id),
      )
      .where(where),
    getDb()
      .selectDistinct({
        id: coachingSessions.id,
        sessionDate: coachingSessions.sessionDate,
        createdAt: coachingSessions.createdAt,
      })
      .from(coachingSessions)
      .innerJoin(
        coachingSessionParticipants,
        eq(coachingSessionParticipants.sessionId, coachingSessions.id),
      )
      .where(where)
      .orderBy(
        desc(coachingSessions.sessionDate),
        desc(coachingSessions.createdAt),
        desc(coachingSessions.id),
      )
      .limit(filters.pageSize)
      .offset(offset),
  ]);
  const sessionIds = idRows.map((row) => row.id);
  let rows: CoachingRoomRow[] = [];

  if (sessionIds.length > 0) {
    const sessionRows = await getDb()
      .select({
        id: coachingSessions.id,
        sessionDate: coachingSessions.sessionDate,
        coachProfileId: coachingSessions.coachProfileId,
        category: coachingSessions.category,
        note: coachingSessions.note,
        createdAt: coachingSessions.createdAt,
        participantId: coachingSessionParticipants.agentProfileId,
        participantName: profiles.name,
        teamId: coachingSessionParticipants.teamIdSnapshot,
        teamName: coachingSessionParticipants.teamNameSnapshot,
      })
      .from(coachingSessions)
      .innerJoin(
        coachingSessionParticipants,
        eq(coachingSessionParticipants.sessionId, coachingSessions.id),
      )
      .innerJoin(
        profiles,
        eq(profiles.id, coachingSessionParticipants.agentProfileId),
      )
      .where(
        and(
          inArray(coachingSessions.id, sessionIds),
          actor.role === "manager"
            ? inArray(coachingSessionParticipants.teamIdSnapshot, actor.teamIds)
            : undefined,
        ),
      )
      .orderBy(asc(profiles.name), asc(profiles.id));
    const coachIds = Array.from(
      new Set(sessionRows.map((row) => row.coachProfileId)),
    );
    const coachRows =
      coachIds.length > 0
        ? await getDb()
            .select({ id: profiles.id, name: profiles.name })
            .from(profiles)
            .where(inArray(profiles.id, coachIds))
        : [];
    const coachNames = new Map(coachRows.map((row) => [row.id, row.name]));
    const bySession = new Map<string, CoachingRoomRow>();
    for (const row of sessionRows) {
      const session = bySession.get(row.id) ?? {
        id: row.id,
        sessionDate: String(row.sessionDate),
        coachProfileId: row.coachProfileId,
        coachName: coachNames.get(row.coachProfileId) ?? "Unknown coach",
        category: row.category,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        participants: [],
      };
      session.participants.push({
        id: row.participantId,
        name: row.participantName,
        teamId: row.teamId,
        teamName: row.teamName,
      });
      bySession.set(row.id, session);
    }
    rows = sessionIds.flatMap((id) => {
      const row = bySession.get(id);
      return row ? [row] : [];
    });
  }

  return {
    rows,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: Number(countRows[0]?.total ?? 0),
    },
    filters,
    teams,
    agents,
    coaches:
      actor.role === "admin"
        ? [
            { id: actor.id, name: "Myself (administrator)", teams: [] },
            ...managers,
          ]
        : [{ id: actor.id, name: "Myself", teams: [] }],
    creationAgents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      teamNames: agent.teams.map((team) => team.name),
      allowedCoachIds:
        actor.role === "admin"
          ? [actor.id, ...agent.managerIds]
          : [actor.id],
    })),
  };
}

export type CoachingLeaderboardSort = "coverage" | "coached" | "manager";

export async function getCoachingLeaderboardData(
  actor: Actor,
  input: {
    dateRange: DashboardDateWindow;
    managerId?: string;
    teamId?: string;
    sort: CoachingLeaderboardSort;
    direction: "asc" | "desc";
  },
) {
  await assertCoachingLeaderboardAccess(actor);
  const [allManagers, allAgents] = await Promise.all([
    listOrganizationActiveManagers(actor),
    listScopedActiveAgents(actor),
  ]);
  const allTeams = uniqueScopedTeams(allAgents);
  const validTeamId =
    !input.teamId || allTeams.some((team) => team.id === input.teamId);
  const managers = allManagers.filter(
    (manager) =>
      validTeamId &&
      (!input.teamId || manager.teams.some((team) => team.id === input.teamId)) &&
      (!input.managerId || manager.id === input.managerId),
  );
  const managerIds = managers.map((manager) => manager.id);
  const participantRows =
    managerIds.length === 0
      ? []
      : await getDb()
          .select({
            sessionId: coachingSessions.id,
            coachProfileId: coachingSessions.coachProfileId,
            agentProfileId: coachingSessionParticipants.agentProfileId,
            teamIdSnapshot: coachingSessionParticipants.teamIdSnapshot,
          })
          .from(coachingSessions)
          .innerJoin(
            coachingSessionParticipants,
            eq(coachingSessionParticipants.sessionId, coachingSessions.id),
          )
          .where(
            and(
              eq(coachingSessions.organizationId, actorOrganizationId(actor)),
              inArray(coachingSessions.coachProfileId, managerIds),
              input.dateRange.from
                ? sql`${coachingSessions.sessionDate} >= ${input.dateRange.from}`
                : undefined,
              input.dateRange.to
                ? sql`${coachingSessions.sessionDate} <= ${input.dateRange.to}`
                : undefined,
              input.teamId
                ? eq(coachingSessionParticipants.teamIdSnapshot, input.teamId)
                : undefined,
            ),
          );

  const rows = buildCoachingLeaderboardRows({
    managers,
    agents: allAgents,
    participants: participantRows,
    teamId: input.teamId,
  });

  rows.sort((left, right) => {
    const direction = input.direction === "asc" ? 1 : -1;
    if (input.sort === "manager") {
      return direction * left.managerName.localeCompare(right.managerName);
    }
    const leftValue =
      input.sort === "coached"
        ? left.coachedAgents
        : left.coveragePercentage ?? -1;
    const rightValue =
      input.sort === "coached"
        ? right.coachedAgents
        : right.coveragePercentage ?? -1;
    if (leftValue !== rightValue) return direction * (leftValue - rightValue);
    return left.managerName.localeCompare(right.managerName);
  });

  return { rows, teams: allTeams, managers: allManagers, filters: input };
}
