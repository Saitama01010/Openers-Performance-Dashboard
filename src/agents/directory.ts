import "server-only";

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import {
  calculateAgentDirectoryKpis,
  calculateConversion,
  prepareAgentDirectoryRows,
  type AgentDirectoryData,
  type AgentDirectoryFilters,
  type AgentDirectoryRow,
  type AgentDirectoryTrendPoint,
} from "@/agents/directory-analytics";
import { listScopedActiveAgents, uniqueScopedTeams } from "@/agents/scope";
import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor } from "@/auth/current-actor";
import { buildDashboardScope, getDashboardData } from "@/dashboard/data";
import type { DashboardDateWindow, OverviewDateRange } from "@/dashboard/date-range";
import {
  loadRoleDashboardOutcomeSource,
  outcomeSnapshot,
  type RoleDashboardOutcomeSource,
} from "@/dashboard/outcome-source";
import { getDb } from "@/db";
import { dialerAgentHourlyMetrics, dialerDatasetScopes, profiles } from "@/db/schema";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

type DirectoryLoadOptions = {
  dateRange: OverviewDateRange;
  filters: AgentDirectoryFilters;
  pageSize?: number;
  includeTrends?: boolean;
};

function asComparisonRange(range: OverviewDateRange): OverviewDateRange | null {
  if (!range.comparison) return null;
  return {
    key: "custom",
    label: range.comparison.label,
    from: range.comparison.from,
    to: range.comparison.to,
    comparison: null,
  };
}

function ratio(talkSeconds: number, loggedInSeconds: number, hasMetrics: boolean) {
  return hasMetrics && loggedInSeconds > 0
    ? (talkSeconds / loggedInSeconds) * 100
    : null;
}

function countFor(
  map: ReadonlyMap<string, number>,
  profileId: string,
  available: boolean,
) {
  return available ? map.get(profileId) ?? 0 : null;
}

function sourceMessage(source: RoleDashboardOutcomeSource) {
  if (source.status === "unavailable" || source.status === "partial") return source.message;
  if (source.stale) return "Showing the last successful outcome synchronization.";
  if (source.transferDiagnostics > 0 || source.closedDiagnostics > 0) {
    return "Some outcome source rows need attention; matched rows remain available.";
  }
  return null;
}

function outcomeTrends(
  source: RoleDashboardOutcomeSource,
  window: DashboardDateWindow,
  profileIds: ReadonlySet<string>,
) {
  const points = new Map<string, Map<string, AgentDirectoryTrendPoint>>();
  const transferAvailable = source.status !== "unavailable";
  const closedAvailable = source.status === "ready";

  function matches(date: string) {
    return (!window.from || date >= window.from) && (!window.to || date <= window.to);
  }

  function point(profileId: string, date: string) {
    const byDate = points.get(profileId) ?? new Map<string, AgentDirectoryTrendPoint>();
    points.set(profileId, byDate);
    const value = byDate.get(date) ?? {
      date,
      loggedInSeconds: null,
      talkPercentage: null,
      transfers: transferAvailable ? 0 : null,
      closedDeals: closedAvailable ? 0 : null,
      conversion: null,
    };
    byDate.set(date, value);
    return value;
  }

  if (source.status !== "unavailable") {
    for (const match of source.transferMatches) {
      if (match.status !== "matched" || !match.transfer.occurredAt) continue;
      if (!profileIds.has(match.user.id)) continue;
      const date = dateKeyInTimeZone(match.transfer.occurredAt, source.timeZone);
      if (!matches(date)) continue;
      const value = point(match.user.id, date);
      value.transfers = (value.transfers ?? 0) + 1;
    }
  }

  if (source.status === "ready") {
    for (const deal of source.closedRecords) {
      if (deal.matchStatus !== "matched" || !deal.matchedUserId || !deal.timestamp) continue;
      if (!profileIds.has(deal.matchedUserId)) continue;
      const date = dateKeyInTimeZone(deal.timestamp, source.timeZone);
      if (!matches(date)) continue;
      const value = point(deal.matchedUserId, date);
      value.closedDeals = (value.closedDeals ?? 0) + 1;
    }
  }

  for (const byDate of points.values()) {
    for (const value of byDate.values()) {
      value.conversion = calculateConversion(value.closedDeals, value.transfers);
    }
  }
  return points;
}

async function dialerTrends(
  actor: Actor,
  window: DashboardDateWindow,
  profileIds: readonly string[],
) {
  const values = new Map<string, Map<string, AgentDirectoryTrendPoint>>();
  if (profileIds.length === 0) return values;
  const scope = await buildDashboardScope(actor);
  const rows = await getDb()
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

  for (const row of rows) {
    const profileId = row.profileId;
    const date = String(row.date);
    const loggedInSeconds = Number(row.loggedInSeconds ?? 0);
    const talkSeconds = Number(row.talkSeconds ?? 0);
    const byDate = values.get(profileId) ?? new Map<string, AgentDirectoryTrendPoint>();
    values.set(profileId, byDate);
    byDate.set(date, {
      date,
      loggedInSeconds,
      talkPercentage: loggedInSeconds > 0 ? (talkSeconds / loggedInSeconds) * 100 : null,
      transfers: null,
      closedDeals: null,
      conversion: null,
    });
  }
  return values;
}

function mergeTrends(
  dialer: ReadonlyMap<string, Map<string, AgentDirectoryTrendPoint>>,
  outcomes: ReadonlyMap<string, Map<string, AgentDirectoryTrendPoint>>,
  profileId: string,
) {
  const merged = new Map<string, AgentDirectoryTrendPoint>();
  for (const value of dialer.get(profileId)?.values() ?? []) merged.set(value.date, { ...value });
  for (const outcome of outcomes.get(profileId)?.values() ?? []) {
    const value = merged.get(outcome.date) ?? {
      date: outcome.date,
      loggedInSeconds: null,
      talkPercentage: null,
      transfers: null,
      closedDeals: null,
      conversion: null,
    };
    value.transfers = outcome.transfers;
    value.closedDeals = outcome.closedDeals;
    value.conversion = outcome.conversion;
    merged.set(value.date, value);
  }
  return [...merged.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-30);
}

async function loadBaseRows(actor: Actor, dateRange: OverviewDateRange) {
  const currentActor = await resolveCurrentActor(actor);
  const comparisonRange = asComparisonRange(dateRange);
  const [agents, current, previous, outcomeSource] = await Promise.all([
    listScopedActiveAgents(currentActor),
    getDashboardData(currentActor, { dateRange, showAgentsWithNoData: true }),
    comparisonRange
      ? getDashboardData(currentActor, { dateRange: comparisonRange, showAgentsWithNoData: true })
      : null,
    loadRoleDashboardOutcomeSource(currentActor),
  ]);

  const allowedIds = new Set(agents.map((agent) => agent.id));
  const currentOutcomes = outcomeSnapshot(
    outcomeSource,
    { kind: "date", window: dateRange },
    allowedIds,
  );
  const previousOutcomes = dateRange.comparison
    ? outcomeSnapshot(
        outcomeSource,
        { kind: "date", window: dateRange.comparison },
        allowedIds,
      )
    : null;
  const currentById = new Map(current.agentRows.map((row) => [row.profileId, row]));
  const previousById = new Map(previous?.agentRows.map((row) => [row.profileId, row]) ?? []);
  const transfersAvailable = currentOutcomes.transfers.status === "ready";
  const closedAvailable = currentOutcomes.closedDeals.status === "ready";

  const rows = agents.map((agent): AgentDirectoryRow => {
    const metric = currentById.get(agent.id);
    const priorMetric = previousById.get(agent.id);
    const transfers = countFor(currentOutcomes.transferByAgent, agent.id, transfersAvailable);
    const closedDeals = countFor(currentOutcomes.closedByAgent, agent.id, closedAvailable);
    const previousTransfers = previousOutcomes
      ? countFor(previousOutcomes.transferByAgent, agent.id, previousOutcomes.transfers.status === "ready")
      : null;
    const previousClosedDeals = previousOutcomes
      ? countFor(previousOutcomes.closedByAgent, agent.id, previousOutcomes.closedDeals.status === "ready")
      : null;
    const teams = agent.teams;
    return {
      profileId: agent.id,
      realName: agent.name,
      americanName: agent.americanName,
      teamId: teams[0]?.id ?? null,
      teamIds: teams.map((team) => team.id),
      teamName: teams.map((team) => team.name).join(", ") || "No team",
      accountStatus: metric?.accountStatus ?? "active",
      hasMetrics: metric?.hasMetrics ?? false,
      loggedInSeconds: metric?.hasMetrics ? metric.loggedInSeconds : null,
      talkSeconds: metric?.hasMetrics ? metric.talkSeconds : null,
      talkPercentage: metric?.hasMetrics ? metric.talkPercentage : null,
      transfers,
      closedDeals,
      conversion: calculateConversion(closedDeals, transfers),
      comparison: dateRange.comparison
        ? {
            loggedInSeconds: priorMetric?.hasMetrics ? priorMetric.loggedInSeconds : null,
            talkPercentage: priorMetric?.hasMetrics
              ? ratio(priorMetric.talkSeconds, priorMetric.loggedInSeconds, true)
              : null,
            transfers: previousTransfers,
            closedDeals: previousClosedDeals,
            conversion: calculateConversion(previousClosedDeals, previousTransfers),
          }
        : null,
      trend: [],
    };
  });

  return {
    actor: currentActor,
    rows,
    teams: uniqueScopedTeams(agents),
    current,
    outcomeSource,
  };
}

export async function getAgentDirectoryData(
  actor: Actor,
  options: DirectoryLoadOptions,
): Promise<AgentDirectoryData> {
  const base = await loadBaseRows(actor, options.dateRange);
  const prepared = prepareAgentDirectoryRows(base.rows, options.filters, options.pageSize ?? 12);
  const pageIds = prepared.pageRows.map((row) => row.profileId);
  let rows = prepared.pageRows;

  if (options.includeTrends !== false && pageIds.length > 0) {
    const [dialer, outcomes] = await Promise.all([
      dialerTrends(base.actor, options.dateRange, pageIds),
      Promise.resolve(
        outcomeTrends(base.outcomeSource, options.dateRange, new Set(pageIds)),
      ),
    ]);
    rows = rows.map((row) => ({
      ...row,
      trend: mergeTrends(dialer, outcomes, row.profileId),
    }));
  }

  const statuses = [...new Set(base.rows.map((row) => row.accountStatus))].sort();
  return {
    role: base.actor.role,
    range: options.dateRange,
    filters: { ...options.filters, page: prepared.pagination.page },
    rows,
    teams: base.teams,
    statuses,
    kpis: calculateAgentDirectoryKpis(prepared.allRows),
    pagination: prepared.pagination,
    sources: {
      dialer: base.current.status === "ACTIVE_IMPORT" ? "ready" : "unavailable",
      transfers: base.outcomeSource.status === "unavailable" ? "unavailable" : "ready",
      closedDeals: base.outcomeSource.status === "ready" ? "ready" : "unavailable",
      message: sourceMessage(base.outcomeSource),
    },
  };
}

export async function getAgentDirectoryExportRows(
  actor: Actor,
  options: Pick<DirectoryLoadOptions, "dateRange" | "filters">,
) {
  const base = await loadBaseRows(actor, options.dateRange);
  const prepared = prepareAgentDirectoryRows(base.rows, { ...options.filters, page: 1 }, Number.MAX_SAFE_INTEGER);
  return {
    rows: prepared.allRows,
    sources: {
      transfers: base.outcomeSource.status === "unavailable" ? "unavailable" : "ready",
      closedDeals: base.outcomeSource.status === "ready" ? "ready" : "unavailable",
    },
  };
}
