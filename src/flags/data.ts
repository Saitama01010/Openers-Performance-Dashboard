import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertFlagsViewAccess } from "@/auth/feature-access";
import {
  listOrganizationActiveManagers,
  listScopedActiveAgents,
  uniqueScopedTeams,
  type ScopedAgent,
} from "@/agents/scope";
import type { DashboardDateWindow } from "@/dashboard/date-range";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  profiles,
} from "@/db/schema";
import {
  aggregatePerformanceFlags,
  aggregateTransferFlags,
  paginateRows,
  weekForDate,
} from "@/flags/analytics";
import {
  calculatePerformanceFlags,
  buildTransferFlagRows,
  PAUSE_MINUTES_PER_NET_HOUR_LIMIT,
  splitTransferFlagWeeks,
  WRAP_MINUTES_PER_TALK_HOUR_LIMIT,
  type TransferFlagClassification,
} from "@/flags/domain";
import {
  canViewAggregateFlagSummary,
  enforceFlagRequestScope,
} from "@/flags/authorization";
import {
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type FlagFilters = {
  dateRange: DashboardDateWindow & {
    comparison?: (DashboardDateWindow & { label: string }) | null;
    label?: string;
  };
  teamId?: string;
  managerId?: string;
  profileId?: string;
  query?: string;
};

async function resolveFlagRoster(actor: Actor, filters: FlagFilters) {
  const [scopedAgents, visibleManagers] = await Promise.all([
    listScopedActiveAgents(actor),
    actor.role === "agent"
      ? Promise.resolve([])
      : listOrganizationActiveManagers(actor),
  ]);
  const managers = actor.role === "manager"
    ? visibleManagers.filter((manager) => manager.id === actor.id)
    : visibleManagers;
  const teams = uniqueScopedTeams(scopedAgents);
  if (
    filters.managerId &&
    !managers.some((manager) => manager.id === filters.managerId)
  ) {
    throw new Error("Forbidden");
  }
  if (
    filters.profileId &&
    !scopedAgents.some((agent) => agent.id === filters.profileId)
  ) {
    throw new Error("Forbidden");
  }
  const validTeam =
    actor.role === "agent" ||
    !filters.teamId ||
    teams.some((team) => team.id === filters.teamId);
  const validManager =
    actor.role === "agent" ||
    !filters.managerId ||
    (actor.role === "manager"
      ? filters.managerId === actor.id
      : managers.some((manager) => manager.id === filters.managerId));
  const query = filters.query?.trim().toLocaleLowerCase("en-US") ?? "";
  const agents = scopedAgents.filter((agent) => {
    if (!validTeam || !validManager) return false;
    if (actor.role === "agent") return agent.id === actor.id;
    if (filters.teamId && !agent.teams.some((team) => team.id === filters.teamId)) {
      return false;
    }
    if (filters.managerId && !agent.managerIds.includes(filters.managerId)) {
      return false;
    }
    if (filters.profileId && agent.id !== filters.profileId) return false;
    return !query || agent.name.toLocaleLowerCase("en-US").includes(query);
  });

  return {
    agents,
    teams: actor.role === "agent" ? [] : teams,
    managers,
  };
}

function responseRoster(actor: Actor, roster: Awaited<ReturnType<typeof resolveFlagRoster>>) {
  return actor.role === "agent"
    ? { agents: [], teams: [], managers: [] }
    : roster;
}

async function queryPerformanceMetrics(
  actor: Actor,
  agentIds: string[],
  dateRange: DashboardDateWindow,
) {
  if (agentIds.length === 0) return [];
  return getDb()
    .select({
      agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
      metricDate: dialerAgentHourlyMetrics.metricDate,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
    })
    .from(dialerAgentHourlyMetrics)
    .innerJoin(
      dialerDatasetScopes,
      eq(dialerDatasetScopes.activeVersionId, dialerAgentHourlyMetrics.versionId),
    )
    .innerJoin(profiles, eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId))
    .where(and(
      inArray(dialerAgentHourlyMetrics.agentProfileId, agentIds),
      dateRange.from ? gte(dialerAgentHourlyMetrics.metricDate, dateRange.from) : undefined,
      dateRange.to ? lte(dialerAgentHourlyMetrics.metricDate, dateRange.to) : undefined,
      activeProfileWhere(actorOrganizationId(actor)),
      eq(profiles.role, "agent"),
    ))
    .groupBy(dialerAgentHourlyMetrics.agentProfileId, dialerAgentHourlyMetrics.metricDate);
}

function performanceRows(
  agents: ScopedAgent[],
  metricRows: Awaited<ReturnType<typeof queryPerformanceMetrics>>,
  dateRange: DashboardDateWindow,
) {
  const totals = new Map<string, { talkSeconds: number; wrapSeconds: number; readySeconds: number; pausedSeconds: number }>();
  for (const row of metricRows) {
    const current = totals.get(row.agentProfileId) ?? { talkSeconds: 0, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 0 };
    current.talkSeconds += Number(row.talkSeconds);
    current.wrapSeconds += Number(row.wrapSeconds);
    current.readySeconds += Number(row.readySeconds);
    current.pausedSeconds += Number(row.pausedSeconds);
    totals.set(row.agentProfileId, current);
  }
  return agents.map((agent) => {
    const metrics = totals.get(agent.id) ?? { talkSeconds: 0, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 0 };
    const result = calculatePerformanceFlags(metrics);
    return {
      agentId: agent.id,
      agentName: agent.name,
      teamIds: agent.teams.map((team) => team.id),
      teamNames: agent.teams.map((team) => team.name),
      dateRange,
      ...metrics,
      ...result,
      wrapThreshold: WRAP_MINUTES_PER_TALK_HOUR_LIMIT,
      pauseThreshold: PAUSE_MINUTES_PER_NET_HOUR_LIMIT,
      status: result.triggeredFlags.length === 2 ? "Both flags" : result.triggeredFlags.length === 1 ? "Flagged" : "No active flags",
    };
  });
}

function weeklyPerformanceRows(
  agents: ScopedAgent[],
  metricRows: Awaited<ReturnType<typeof queryPerformanceMetrics>>,
) {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const weekly = new Map<string, { agentId: string; weekStart: string; weekEnd: string; talkSeconds: number; wrapSeconds: number; readySeconds: number; pausedSeconds: number }>();
  for (const row of metricRows) {
    const week = weekForDate(row.metricDate);
    if (!week) continue;
    const key = `${row.agentProfileId}:${week.weekStart}`;
    const value = weekly.get(key) ?? { agentId: row.agentProfileId, ...week, talkSeconds: 0, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 0 };
    value.talkSeconds += Number(row.talkSeconds);
    value.wrapSeconds += Number(row.wrapSeconds);
    value.readySeconds += Number(row.readySeconds);
    value.pausedSeconds += Number(row.pausedSeconds);
    weekly.set(key, value);
  }
  return Array.from(weekly.values()).flatMap((value) => {
    const agent = agentsById.get(value.agentId);
    if (!agent) return [];
    return [{
      agentId: value.agentId,
      teamIds: agent.teams.map((team) => team.id),
      teamNames: agent.teams.map((team) => team.name),
      weekStart: value.weekStart,
      weekEnd: value.weekEnd,
      ...calculatePerformanceFlags(value),
    }];
  });
}

function performanceFilter<T extends { wrapFlag: boolean; pauseFlag: boolean }>(
  rows: T[],
  filters: { wrap?: "flagged" | "all"; pause?: "flagged" | "all" },
) {
  return rows.filter((row) => {
    if (filters.wrap === "flagged" && !row.wrapFlag) return false;
    if (filters.pause === "flagged" && !row.pauseFlag) return false;
    return row.wrapFlag || row.pauseFlag;
  });
}

export async function getPerformanceFlagsData(
  actor: Actor,
  filters: FlagFilters & {
    wrap?: "flagged" | "all";
    pause?: "flagged" | "all";
    flaggedOnly?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  await assertFlagsViewAccess(actor);
  const safeFilters = enforceFlagRequestScope(actor, filters);
  const roster = await resolveFlagRoster(actor, safeFilters);
  const agentIds = roster.agents.map((agent) => agent.id);
  const [metricRows, comparisonMetricRows] = await Promise.all([
    queryPerformanceMetrics(actor, agentIds, safeFilters.dateRange),
    safeFilters.dateRange.comparison
      ? queryPerformanceMetrics(actor, agentIds, safeFilters.dateRange.comparison)
      : Promise.resolve([]),
  ]);
  const allRows = performanceFilter(performanceRows(roster.agents, metricRows, safeFilters.dateRange), safeFilters);
  const comparisonRows = performanceFilter(performanceRows(roster.agents, comparisonMetricRows, safeFilters.dateRange.comparison ?? {}), safeFilters);
  const weeklyRows = performanceFilter(weeklyPerformanceRows(roster.agents, metricRows), safeFilters);
  const analytics = aggregatePerformanceFlags(allRows, weeklyRows);
  const paginated = paginateRows(allRows, safeFilters.page, safeFilters.pageSize);
  const summary =
    !canViewAggregateFlagSummary(actor)
      ? null
      : {
          scopedAgents: roster.agents.length,
          flaggedAgents: allRows.length,
          wrapFlags: allRows.filter((row) => row.wrapFlag).length,
          pauseFlags: allRows.filter((row) => row.pauseFlag).length,
          repeatFlaggedAgents: 0,
        };

  const previousSummary = !safeFilters.dateRange.comparison || comparisonMetricRows.length === 0
    ? null
    : {
        scopedAgents: roster.agents.length,
        flaggedAgents: comparisonRows.length,
        wrapFlags: comparisonRows.filter((row) => row.wrapFlag).length,
        pauseFlags: comparisonRows.filter((row) => row.pauseFlag).length,
      };

  return {
    rows: paginated.rows,
    summary,
    previousSummary,
    analytics,
    pagination: paginated.pagination,
    source: {
      status: metricRows.length > 0 || roster.agents.length === 0 ? "ready" as const : "unavailable" as const,
      message: metricRows.length > 0 || roster.agents.length === 0 ? null : "No active dialer metrics are available for this period.",
    },
    ...responseRoster(actor, roster),
    filters: safeFilters,
  };
}

export async function getTransferFlagsData(
  actor: Actor,
  filters: FlagFilters & {
    classification?: TransferFlagClassification;
    page?: number;
    pageSize?: number;
  },
) {
  await assertFlagsViewAccess(actor);
  const safeFilters = enforceFlagRequestScope(actor, filters);
  const roster = await resolveFlagRoster(actor, safeFilters);
  const config = transferSheetConfigFromEnv();
  let source:
    | { status: "ready"; message: null; timeZone: string }
    | { status: "unavailable"; message: string; timeZone: string | null };
  const matchedDeals: Array<{ agentId: string; date: string }> = [];

  if (!config) {
    source = {
      status: "unavailable",
      message: "The Closed worksheet source is not configured.",
      timeZone: null,
    };
  } else {
    try {
      const ingestion = await ingestAndMatchLeaderboardSources(
        roster.agents.flatMap((agent) =>
          matchableAgent(agent) ? [matchableAgent(agent)!] : [],
        ),
        config,
      );
      if (ingestion.status === "ready") {
        const allowedAgentIds = new Set(roster.agents.map((agent) => agent.id));
        for (const deal of ingestion.closedRecords) {
          if (
            deal.matchStatus !== "matched" ||
            !deal.matchedUserId ||
            !deal.timestamp ||
            !allowedAgentIds.has(deal.matchedUserId)
          ) {
            continue;
          }
          const date = dateKeyInTimeZone(deal.timestamp, ingestion.timeZone);
          matchedDeals.push({ agentId: deal.matchedUserId, date });
        }
        source = { status: "ready", message: null, timeZone: ingestion.timeZone };
      } else {
        source = {
          status: "unavailable",
          message: ingestion.message,
          timeZone: config.timeZone,
        };
      }
    } catch {
      source = {
        status: "unavailable",
        message: "The Closed worksheet source could not be loaded.",
        timeZone: config.timeZone,
      };
    }
  }

  const today = dateKeyInTimeZone(
    new Date(),
    source.timeZone ?? config?.timeZone ?? "Africa/Cairo",
  );
  const weeks = splitTransferFlagWeeks({
    dateRange: safeFilters.dateRange,
    availableDealDates: matchedDeals.map((deal) => deal.date),
    today,
  });

  const allRows = source.status === "ready"
    ? buildTransferFlagRows({
        agents: roster.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          teamNames: agent.teams.map((team) => team.name),
        })),
        deals: matchedDeals,
        weeks,
      })
        .filter(
          (row) =>
            !safeFilters.classification ||
            row.classification === safeFilters.classification,
        )
        .map((row) => ({ ...row, sourceStatus: source.status }))
    : [];
  const analytics = aggregateTransferFlags(allRows);
  const paginated = paginateRows(allRows, safeFilters.page, safeFilters.pageSize);
  const summary =
    !canViewAggregateFlagSummary(actor) || source.status !== "ready"
      ? null
      : {
          scopedAgents: roster.agents.length,
          strongFlags: allRows.filter((row) => row.classification === "strong").length,
          improvementFlags: allRows.filter(
            (row) => row.classification === "improvement",
          ).length,
          repeatFlaggedAgents: analytics.repeatFlaggedAgents,
        };

  return {
    rows: paginated.rows,
    summary,
    analytics,
    pagination: paginated.pagination,
    source,
    ...responseRoster(actor, roster),
    filters: safeFilters,
  };
}

function matchableAgent(agent: ScopedAgent) {
  if (!agent.americanName) return null;
  return {
    id: agent.id,
    realName: agent.name,
    americanName: agent.americanName,
    teamId: agent.teams[0]?.id ?? null,
    teamName: agent.teams[0]?.name ?? null,
  };
}
