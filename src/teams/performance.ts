import "server-only";

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { listScopedActiveAgents, type ScopedAgent } from "@/agents/scope";
import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor } from "@/auth/current-actor";
import { buildDashboardScope, getDashboardData } from "@/dashboard/data";
import type { DashboardDateWindow, OverviewDateRange } from "@/dashboard/date-range";
import {
  loadRoleDashboardOutcomeSource,
  outcomeSnapshot,
  type RoleDashboardOutcomeSource,
} from "@/dashboard/outcome-source";
import { resolveEffectiveTarget } from "@/dashboard/target-evaluation";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  profiles,
  teams,
} from "@/db/schema";
import { listPerformanceConfigurationForCurrentActor } from "@/operations/settings";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import {
  buildHealthMix,
  calculateTeamKpis,
  conversionPercentage,
  healthForTarget,
  metricValue,
  prepareTeamRows,
  type TeamComparison,
  type TeamPerformanceData,
  type TeamPerformanceFilters,
  type TeamPerformanceMetric,
  type TeamPerformanceRow,
  type TeamTrendPoint,
} from "@/teams/performance-analytics";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

type LoadOptions = {
  dateRange: OverviewDateRange;
  filters: TeamPerformanceFilters;
  pageSize?: number;
  includeTrends?: boolean;
};

type DialerPoint = {
  loggedInSeconds: number;
  talkSeconds: number;
};

function comparisonRange(range: OverviewDateRange): OverviewDateRange | null {
  return range.comparison
    ? {
        key: "custom",
        label: range.comparison.label,
        from: range.comparison.from,
        to: range.comparison.to,
        comparison: null,
      }
    : null;
}

function sourceMessage(source: RoleDashboardOutcomeSource) {
  if (source.status === "unavailable" || source.status === "partial") return source.message;
  if (source.stale) return "Showing the last successful outcome synchronization.";
  if (source.transferDiagnostics > 0 || source.closedDiagnostics > 0) {
    return "Some outcome source rows need attention; matched rows remain available.";
  }
  return null;
}

function metricTargetName(metric: TeamPerformanceMetric) {
  return metric === "closed-deals" ? "closed_deals" : metric;
}

function actualForMetric(
  row: Pick<TeamPerformanceRow, "transfers" | "closedDeals" | "conversion">,
  metric: TeamPerformanceMetric,
) {
  if (metric === "closed-deals") return row.closedDeals;
  if (metric === "conversion") return row.conversion;
  return row.transfers;
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

async function listVisibleTeams(actor: Actor) {
  const scope =
    actor.role === "manager"
      ? actor.teamIds.length > 0
        ? inArray(teams.id, actor.teamIds)
        : eq(teams.id, "__empty_manager_scope__")
      : undefined;
  return getDb()
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(visibleTeamWhere(actor), scope))
    .orderBy(asc(teams.name), asc(teams.id));
}

function agentIdsByTeam(agents: readonly ScopedAgent[]) {
  const groups = new Map<string, string[]>();
  for (const agent of agents) {
    for (const team of agent.teams) {
      const ids = groups.get(team.id) ?? [];
      if (!ids.includes(agent.id)) ids.push(agent.id);
      groups.set(team.id, ids);
    }
  }
  return groups;
}

function teamComparison(
  agentIds: readonly string[],
  dashboardByAgent: ReadonlyMap<string, Awaited<ReturnType<typeof getDashboardData>>["agentRows"][number]>,
  transferByAgent: ReadonlyMap<string, number>,
  closedByAgent: ReadonlyMap<string, number>,
  sources: { transfers: boolean; closedDeals: boolean },
): TeamComparison {
  const metrics = agentIds.flatMap((id) => {
    const value = dashboardByAgent.get(id);
    return value?.hasMetrics ? [value] : [];
  });
  const transfers = sources.transfers
    ? agentIds.reduce((total, id) => total + (transferByAgent.get(id) ?? 0), 0)
    : null;
  const closedDeals = sources.closedDeals
    ? agentIds.reduce((total, id) => total + (closedByAgent.get(id) ?? 0), 0)
    : null;
  return {
    transfers,
    closedDeals,
    conversion: conversionPercentage(closedDeals, transfers),
    averageLoggedInSeconds: average(metrics.map((metric) => metric.loggedInSeconds)),
    averageTalkPercentage: average(
      metrics.flatMap((metric) =>
        metric.talkPercentage === null ? [] : [metric.talkPercentage],
      ),
    ),
  };
}

async function dialerTrendRows(
  actor: Actor,
  window: DashboardDateWindow,
  profileIds: readonly string[],
) {
  if (profileIds.length === 0) return [];
  const scope = await buildDashboardScope(actor);
  return getDb()
    .select({
      profileId: dialerAgentHourlyMetrics.agentProfileId,
      date: dialerAgentHourlyMetrics.metricDate,
      loggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
    })
    .from(dialerAgentHourlyMetrics)
    .innerJoin(
      dialerDatasetScopes,
      eq(dialerDatasetScopes.activeVersionId, dialerAgentHourlyMetrics.versionId),
    )
    .innerJoin(profiles, eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId))
    .where(
      and(
        scope.metricWhere,
        inArray(dialerAgentHourlyMetrics.agentProfileId, [...profileIds]),
        window.from ? gte(dialerAgentHourlyMetrics.metricDate, window.from) : undefined,
        window.to ? lte(dialerAgentHourlyMetrics.metricDate, window.to) : undefined,
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
      ),
    )
    .groupBy(dialerAgentHourlyMetrics.agentProfileId, dialerAgentHourlyMetrics.metricDate)
    .orderBy(asc(dialerAgentHourlyMetrics.metricDate));
}

function outcomeTrendByAgent(
  source: RoleDashboardOutcomeSource,
  window: DashboardDateWindow,
  profileIds: ReadonlySet<string>,
) {
  const values = new Map<string, Map<string, { transfers: number; closedDeals: number }>>();
  const matchesWindow = (date: string) =>
    (!window.from || date >= window.from) && (!window.to || date <= window.to);
  const point = (profileId: string, date: string) => {
    const byDate = values.get(profileId) ?? new Map<string, { transfers: number; closedDeals: number }>();
    values.set(profileId, byDate);
    const value = byDate.get(date) ?? { transfers: 0, closedDeals: 0 };
    byDate.set(date, value);
    return value;
  };

  if (source.status !== "unavailable") {
    for (const match of source.transferMatches) {
      if (match.status !== "matched" || !match.transfer.occurredAt || !profileIds.has(match.user.id)) continue;
      const date = dateKeyInTimeZone(match.transfer.occurredAt, source.timeZone);
      if (matchesWindow(date)) point(match.user.id, date).transfers += 1;
    }
  }
  if (source.status === "ready") {
    for (const deal of source.closedRecords) {
      if (deal.matchStatus !== "matched" || !deal.matchedUserId || !deal.timestamp || !profileIds.has(deal.matchedUserId)) continue;
      const date = dateKeyInTimeZone(deal.timestamp, source.timeZone);
      if (matchesWindow(date)) point(deal.matchedUserId, date).closedDeals += 1;
    }
  }
  return values;
}

async function teamTrends(
  actor: Actor,
  source: RoleDashboardOutcomeSource,
  window: DashboardDateWindow,
  agents: readonly ScopedAgent[],
  teamIds: readonly string[],
) {
  const selected = new Set(teamIds);
  const selectedAgents = agents.filter((agent) =>
    agent.teams.some((team) => selected.has(team.id)),
  );
  const profileIds = selectedAgents.map((agent) => agent.id);
  const [dialerRows, outcomeRows] = await Promise.all([
    dialerTrendRows(actor, window, profileIds),
    Promise.resolve(outcomeTrendByAgent(source, window, new Set(profileIds))),
  ]);
  const dialerByAgent = new Map<string, Map<string, DialerPoint>>();
  for (const row of dialerRows) {
    const byDate = dialerByAgent.get(row.profileId) ?? new Map<string, DialerPoint>();
    dialerByAgent.set(row.profileId, byDate);
    byDate.set(String(row.date), {
      loggedInSeconds: Number(row.loggedInSeconds ?? 0),
      talkSeconds: Number(row.talkSeconds ?? 0),
    });
  }

  const result = new Map<string, TeamTrendPoint[]>();
  for (const teamId of teamIds) {
    const memberIds = selectedAgents
      .filter((agent) => agent.teams.some((team) => team.id === teamId))
      .map((agent) => agent.id);
    const dates = new Set<string>();
    for (const id of memberIds) {
      for (const date of dialerByAgent.get(id)?.keys() ?? []) dates.add(date);
      for (const date of outcomeRows.get(id)?.keys() ?? []) dates.add(date);
    }
    const points = [...dates]
      .sort((left, right) => left.localeCompare(right))
      .slice(-60)
      .map((date): TeamTrendPoint => {
        const dialer = memberIds.flatMap((id) => {
          const value = dialerByAgent.get(id)?.get(date);
          return value ? [value] : [];
        });
        const transfers =
          source.status === "unavailable"
            ? null
            : memberIds.reduce(
                (total, id) => total + (outcomeRows.get(id)?.get(date)?.transfers ?? 0),
                0,
              );
        const closedDeals =
          source.status !== "ready"
            ? null
            : memberIds.reduce(
                (total, id) => total + (outcomeRows.get(id)?.get(date)?.closedDeals ?? 0),
                0,
              );
        return {
          date,
          transfers,
          closedDeals,
          conversion: conversionPercentage(closedDeals, transfers),
          averageLoggedInSeconds: average(dialer.map((value) => value.loggedInSeconds)),
        };
      });
    result.set(teamId, points);
  }
  return result;
}

async function loadBaseRows(actor: Actor, options: LoadOptions) {
  const currentActor = await resolveCurrentActor(actor);
  if (currentActor.role === "agent") throw new Error("Forbidden");
  const previousRange = comparisonRange(options.dateRange);
  const [visibleTeams, agents, current, previous, source, configuration] = await Promise.all([
    listVisibleTeams(currentActor),
    listScopedActiveAgents(currentActor),
    getDashboardData(currentActor, { dateRange: options.dateRange, showAgentsWithNoData: true }),
    previousRange
      ? getDashboardData(currentActor, { dateRange: previousRange, showAgentsWithNoData: true })
      : null,
    loadRoleDashboardOutcomeSource(currentActor),
    listPerformanceConfigurationForCurrentActor(currentActor),
  ]);
  const allowedIds = new Set(agents.map((agent) => agent.id));
  const currentOutcomes = outcomeSnapshot(source, { kind: "date", window: options.dateRange }, allowedIds);
  const previousOutcomes = options.dateRange.comparison
    ? outcomeSnapshot(source, { kind: "date", window: options.dateRange.comparison }, allowedIds)
    : null;
  const currentByAgent = new Map(current.agentRows.map((row) => [row.profileId, row]));
  const previousByAgent = new Map(previous?.agentRows.map((row) => [row.profileId, row]) ?? []);
  const groupedAgents = agentIdsByTeam(agents);
  const targetMetric = metricTargetName(options.filters.metric);
  const asOf = options.dateRange.to ?? dateKeyInTimeZone(new Date(), source.timeZone);
  const rows = visibleTeams.map((team): TeamPerformanceRow => {
    const ids = groupedAgents.get(team.id) ?? [];
    const metrics = ids.flatMap((id) => {
      const value = currentByAgent.get(id);
      return value?.hasMetrics ? [value] : [];
    });
    const transfers = currentOutcomes.transfers.status === "ready"
      ? ids.reduce((total, id) => total + (currentOutcomes.transferByAgent.get(id) ?? 0), 0)
      : null;
    const closedDeals = currentOutcomes.closedDeals.status === "ready"
      ? ids.reduce((total, id) => total + (currentOutcomes.closedByAgent.get(id) ?? 0), 0)
      : null;
    const base = {
      teamId: team.id,
      teamName: team.name,
      activeAgents: ids.length,
      agentsWithDialerData: metrics.length,
      transfers,
      closedDeals,
      conversion: conversionPercentage(closedDeals, transfers),
      averageLoggedInSeconds: average(metrics.map((metric) => metric.loggedInSeconds)),
      averageTalkPercentage: average(
        metrics.flatMap((metric) => metric.talkPercentage === null ? [] : [metric.talkPercentage]),
      ),
    };
    const target = resolveEffectiveTarget(configuration.targets, {
      metric: targetMetric,
      date: asOf,
      teamId: team.id,
    });
    const health = healthForTarget(actualForMetric(base, options.filters.metric), target?.targetValue ?? null);
    return {
      ...base,
      comparison: previousOutcomes && previous
        ? teamComparison(
            ids,
            previousByAgent,
            previousOutcomes.transferByAgent,
            previousOutcomes.closedByAgent,
            {
              transfers: previousOutcomes.transfers.status === "ready",
              closedDeals: previousOutcomes.closedDeals.status === "ready",
            },
          )
        : null,
      ...health,
      targetValue: target?.targetValue ?? null,
      targetMetric: options.filters.metric,
      trend: [],
    };
  });
  return { currentActor, rows, agents, current, source };
}

function metricRank(rows: readonly TeamPerformanceRow[], metric: TeamPerformanceMetric) {
  return [...rows].sort((left, right) => {
    const difference = (metricValue(right, metric) ?? -1) - (metricValue(left, metric) ?? -1);
    return difference || left.teamName.localeCompare(right.teamName);
  });
}

export async function getTeamPerformanceData(
  actor: Actor,
  options: LoadOptions,
): Promise<TeamPerformanceData> {
  const base = await loadBaseRows(actor, options);
  const standingsBase = metricRank(base.rows, options.filters.metric);
  const trendIds = standingsBase.slice(0, 5).map((row) => row.teamId);
  const trends = options.includeTrends === false
    ? new Map<string, TeamTrendPoint[]>()
    : await teamTrends(base.currentActor, base.source, options.dateRange, base.agents, trendIds);
  const rows = base.rows.map((row) => ({ ...row, trend: trends.get(row.teamId) ?? [] }));
  const standings = metricRank(rows, options.filters.metric);
  const prepared = prepareTeamRows(rows, options.filters, options.pageSize ?? 8);
  const selected = rows.find((row) => row.teamId === options.filters.selectedTeamId) ?? standings[0] ?? null;

  return {
    role: base.currentActor.role === "admin" ? "admin" : "manager",
    range: options.dateRange,
    filters: { ...options.filters, page: prepared.pagination.page },
    rows: prepared.pageRows,
    standings,
    trendTeams: standings.filter((row) => trendIds.includes(row.teamId)),
    spotlight: selected,
    attention: standings.filter((row) => row.health === "under-target").slice(0, 4),
    kpis: calculateTeamKpis(rows),
    healthMix: buildHealthMix(rows),
    pagination: prepared.pagination,
    sources: {
      dialer: base.current.status === "ACTIVE_IMPORT" ? "ready" : "unavailable",
      transfers: base.source.status === "unavailable" ? "unavailable" : "ready",
      closedDeals: base.source.status === "ready" ? "ready" : "unavailable",
      message: sourceMessage(base.source),
    },
  };
}

export async function getTeamPerformanceExportRows(
  actor: Actor,
  options: Pick<LoadOptions, "dateRange" | "filters">,
) {
  const base = await loadBaseRows(actor, { ...options, includeTrends: false });
  const prepared = prepareTeamRows(base.rows, { ...options.filters, page: 1 }, Number.MAX_SAFE_INTEGER);
  return {
    rows: prepared.allRows,
    sources: {
      transfers: base.source.status === "unavailable" ? "unavailable" as const : "ready" as const,
      closedDeals: base.source.status === "ready" ? "ready" as const : "unavailable" as const,
    },
  };
}
