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
  coachingReports,
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

export type CoachingSummary = {
  sessionsCompleted: number;
  agentsCoached: number;
  actionsAssigned: number;
  actionsCompleted: null;
  completionRate: null;
  trend: Array<{ date: string; sessions: number; agents: number; actions: number }>;
};

function coachingScopeCondition(actor: Actor) {
  return actor.role === "manager"
    ? actor.teamIds.length > 0
      ? inArray(coachingSessionParticipants.teamIdSnapshot, actor.teamIds)
      : emptyScopeCondition()
    : undefined;
}

async function coachingSummaryForWindow(
  actor: Actor,
  window: DashboardDateWindow,
  filters: Pick<CoachingRoomFilters, "coachProfileId" | "teamId" | "agentProfileId" | "category"> = {},
): Promise<CoachingSummary> {
  const where = and(
    eq(coachingSessions.organizationId, actorOrganizationId(actor)),
    coachingScopeCondition(actor),
    window.from ? sql`${coachingSessions.sessionDate} >= ${window.from}` : undefined,
    window.to ? sql`${coachingSessions.sessionDate} <= ${window.to}` : undefined,
    filters.coachProfileId ? eq(coachingSessions.coachProfileId, filters.coachProfileId) : undefined,
    filters.teamId ? eq(coachingSessionParticipants.teamIdSnapshot, filters.teamId) : undefined,
    filters.agentProfileId ? eq(coachingSessionParticipants.agentProfileId, filters.agentProfileId) : undefined,
    filters.category ? eq(coachingSessions.category, filters.category) : undefined,
  );
  const rows = await getDb()
    .select({
      sessionId: coachingSessions.id,
      sessionDate: coachingSessions.sessionDate,
      agentProfileId: coachingSessionParticipants.agentProfileId,
    })
    .from(coachingSessions)
    .innerJoin(
      coachingSessionParticipants,
      eq(coachingSessionParticipants.sessionId, coachingSessions.id),
    )
    .where(where)
    .orderBy(asc(coachingSessions.sessionDate));

  const actionRows = rows.length === 0
    ? []
    : await getDb()
        .select({
          actionItems: coachingReports.actionItems,
          agentProfileId: coachingReports.agentProfileId,
          sessionId: coachingReports.coachingSessionId,
        })
        .from(coachingReports)
        .innerJoin(
          coachingSessionParticipants,
          and(
            eq(coachingSessionParticipants.sessionId, coachingReports.coachingSessionId),
            eq(coachingSessionParticipants.agentProfileId, coachingReports.agentProfileId),
          ),
        )
        .innerJoin(coachingSessions, eq(coachingSessions.id, coachingReports.coachingSessionId))
        .where(where);

  const sessionIds = new Set(rows.map((row) => row.sessionId));
  const agentIds = new Set(rows.map((row) => row.agentProfileId));
  const actionsByDate = new Map<string, number>();
  const dateBySession = new Map(rows.map((row) => [row.sessionId, String(row.sessionDate)]));
  let actionsAssigned = 0;
  for (const row of actionRows) {
    const count = Array.isArray(row.actionItems) ? row.actionItems.length : 0;
    actionsAssigned += count;
    const date = dateBySession.get(row.sessionId);
    if (date) actionsByDate.set(date, (actionsByDate.get(date) ?? 0) + count);
  }

  const daily = new Map<string, { sessions: Set<string>; agents: Set<string> }>();
  for (const row of rows) {
    const date = String(row.sessionDate);
    const item = daily.get(date) ?? { sessions: new Set<string>(), agents: new Set<string>() };
    item.sessions.add(row.sessionId);
    item.agents.add(row.agentProfileId);
    daily.set(date, item);
  }

  return {
    sessionsCompleted: sessionIds.size,
    agentsCoached: agentIds.size,
    actionsAssigned,
    actionsCompleted: null,
    completionRate: null,
    trend: Array.from(daily.entries()).map(([date, item]) => ({
      date,
      sessions: item.sessions.size,
      agents: item.agents.size,
      actions: actionsByDate.get(date) ?? 0,
    })),
  };
}

export async function getCoachingSummaryData(
  actor: Actor,
  input: {
    dateRange: DashboardDateWindow & { comparison?: (DashboardDateWindow & { label: string }) | null };
    filters?: Pick<CoachingRoomFilters, "coachProfileId" | "teamId" | "agentProfileId" | "category">;
  },
) {
  await assertCoachingViewAccess(actor);
  const [current, comparison] = await Promise.all([
    coachingSummaryForWindow(actor, input.dateRange, input.filters),
    input.dateRange.comparison
      ? coachingSummaryForWindow(actor, input.dateRange.comparison, input.filters)
      : Promise.resolve(null),
  ]);
  return { current, comparison, comparisonLabel: input.dateRange.comparison?.label ?? null };
}

export async function getCoachingParticipantPage(
  actor: Actor,
  input: { coachProfileId: string; page: number; pageSize: number; search?: string },
) {
  await assertCoachingViewAccess(actor);
  const [agents, managers] = await Promise.all([
    listScopedActiveAgents(actor),
    listOrganizationActiveManagers(actor),
  ]);
  const coachAllowed = actor.role === "manager"
    ? input.coachProfileId === actor.id
    : input.coachProfileId === actor.id || managers.some((manager) => manager.id === input.coachProfileId);
  if (!coachAllowed) return { rows: [], page: 1, pageSize: input.pageSize, total: 0 };
  const query = input.search?.trim().toLocaleLowerCase() ?? "";
  const filtered = agents.filter((agent) => {
    const allowed = actor.role === "admin"
      ? input.coachProfileId === actor.id || agent.managerIds.includes(input.coachProfileId)
      : true;
    return allowed && (!query || agent.name.toLocaleLowerCase().includes(query) || agent.teams.some((team) => team.name.toLocaleLowerCase().includes(query)));
  });
  const page = Math.min(Math.max(1, input.page), Math.max(1, Math.ceil(filtered.length / input.pageSize)));
  const start = (page - 1) * input.pageSize;
  return {
    rows: filtered.slice(start, start + input.pageSize).map((agent) => ({
      id: agent.id,
      name: agent.name,
      teamNames: agent.teams.map((team) => team.name),
    })),
    page,
    pageSize: input.pageSize,
    total: filtered.length,
  };
}

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
