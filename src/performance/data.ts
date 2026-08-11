import "server-only";

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import type { Actor, Role } from "@/auth/authorization";
import { resolveCurrentActor } from "@/auth/current-actor";
import {
  buildDashboardScope,
  getDashboardSummaryData,
  type DashboardTotals,
} from "@/dashboard/data";
import type { DashboardDateWindow, OverviewDateRange } from "@/dashboard/date-range";
import { getDb } from "@/db";
import { dialerAgentHourlyMetrics, dialerDatasetScopes, profiles } from "@/db/schema";
import { ingestAndMatchLeaderboardSources, transferSheetConfigFromEnv } from "@/leaderboard/transfers";
import { listMatchableUsers } from "@/leaderboard/data";
import { TransferSheetConfigurationError } from "@/sheets/transfers";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";
import {
  aggregatePerformanceSeries,
  calculateClosedDealRate,
  scopeOutcomeEvents,
  serializePerformanceTimestamp,
  selectPerformanceGranularity,
  type DialerDailyAggregate,
  type PerformanceSeriesPoint,
  type PerformanceSourceStatus,
  type ScopedOutcomeEvent,
} from "@/performance/aggregations";

export type PerformanceSource = {
  status: PerformanceSourceStatus;
  message: string;
  latestSync: string | null;
};

export type PerformanceTotals = {
  transfers: number | null;
  closedDeals: number | null;
  closedDealRate: number | null;
  loggedInSeconds: number | null;
  readySeconds: number | null;
  talkSeconds: number | null;
  ringingSeconds: number | null;
  wrapSeconds: number | null;
  pausedSeconds: number | null;
  systemPauseSeconds: number | null;
  idleSeconds: number | null;
  untrackedSeconds: number | null;
  netSeconds: number | null;
  sourceRows: number;
};

export type PerformancePageData = {
  role: Role;
  range: OverviewDateRange;
  timeZone: string;
  granularity: "day" | "week" | "month";
  totals: PerformanceTotals;
  comparison: (PerformanceTotals & { label: string }) | null;
  series: PerformanceSeriesPoint[];
  sources: {
    transfers: PerformanceSource;
    closedDeals: PerformanceSource;
    dialer: PerformanceSource;
  };
};

type OutcomeLoad = {
  transfers: ScopedOutcomeEvent[] | null;
  closedDeals: ScopedOutcomeEvent[] | null;
  transferSource: PerformanceSource;
  closedDealSource: PerformanceSource;
};

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function optionalValue(row: Record<string, unknown>, value: string, available: string) {
  return numberValue(row.rowCount) > 0 && numberValue(row[available]) === numberValue(row.rowCount)
    ? numberValue(row[value])
    : null;
}

function dateWindowWhere(window: DashboardDateWindow) {
  return and(
    window.from ? gte(dialerAgentHourlyMetrics.metricDate, window.from) : undefined,
    window.to ? lte(dialerAgentHourlyMetrics.metricDate, window.to) : undefined,
  );
}

async function getDialerDailyAggregates(actor: Actor, window: DashboardDateWindow) {
  const scope = await buildDashboardScope(actor);
  const rows = await getDb()
    .select({
      date: dialerAgentHourlyMetrics.metricDate,
      loggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      ringingSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.ringingSeconds})`,
      ringingAvailableRows: sql<number>`count(${dialerAgentHourlyMetrics.ringingSeconds})`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
      systemPauseSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.systemPauseSeconds})`,
      systemPauseAvailableRows: sql<number>`count(${dialerAgentHourlyMetrics.systemPauseSeconds})`,
      idleSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.idleSeconds})`,
      idleAvailableRows: sql<number>`count(${dialerAgentHourlyMetrics.idleSeconds})`,
      untrackedSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.untrackedSeconds})`,
      untrackedAvailableRows: sql<number>`count(${dialerAgentHourlyMetrics.untrackedSeconds})`,
      netSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.netSeconds})`,
      netAvailableRows: sql<number>`count(${dialerAgentHourlyMetrics.netSeconds})`,
      rowCount: sql<number>`count(*)`,
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
        dateWindowWhere(window),
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
      ),
    )
    .groupBy(dialerAgentHourlyMetrics.metricDate)
    .orderBy(asc(dialerAgentHourlyMetrics.metricDate));

  return rows.map((row): DialerDailyAggregate => ({
    date: String(row.date),
    loggedInSeconds: numberValue(row.loggedInSeconds),
    readySeconds: numberValue(row.readySeconds),
    talkSeconds: numberValue(row.talkSeconds),
    ringingSeconds: optionalValue(row, "ringingSeconds", "ringingAvailableRows"),
    wrapSeconds: numberValue(row.wrapSeconds),
    pausedSeconds: numberValue(row.pausedSeconds),
    systemPauseSeconds: optionalValue(row, "systemPauseSeconds", "systemPauseAvailableRows"),
    idleSeconds: optionalValue(row, "idleSeconds", "idleAvailableRows"),
    untrackedSeconds: optionalValue(row, "untrackedSeconds", "untrackedAvailableRows"),
    netSeconds: optionalValue(row, "netSeconds", "netAvailableRows"),
    sourceRows: numberValue(row.rowCount),
  }));
}

function sourceStatus(diagnosticCount: number, stale: boolean): PerformanceSourceStatus {
  return diagnosticCount > 0 || stale ? "partial" : "healthy";
}

async function loadOutcomeData(actor: Actor, timeZone: string): Promise<OutcomeLoad> {
  const config = transferSheetConfigFromEnv();
  if (!config) {
    const unavailable = {
      status: "unavailable" as const,
      message: "The outcome source is not configured.",
      latestSync: null,
    };
    return {
      transfers: null,
      closedDeals: null,
      transferSource: unavailable,
      closedDealSource: unavailable,
    };
  }

  try {
    const ingestion = await ingestAndMatchLeaderboardSources(listMatchableUsers(actor), config);
    if (ingestion.status === "unconfigured") {
      const unavailable = { status: "unavailable" as const, message: ingestion.message, latestSync: null };
      return { transfers: null, closedDeals: null, transferSource: unavailable, closedDealSource: unavailable };
    }

    const transfers = ingestion.transferMatches.flatMap((match): ScopedOutcomeEvent[] =>
      match.status === "matched" && match.transfer.occurredAt
        ? [{
            date: dateKeyInTimeZone(match.transfer.occurredAt, timeZone),
            profileId: match.user.id,
            teamId: match.user.teamId,
          }]
        : [],
    );
    const transferSource = {
      status: sourceStatus(ingestion.transferDiagnostics.length, ingestion.stale),
      message:
        ingestion.transferDiagnostics.length > 0
          ? `${ingestion.transferDiagnostics.length} transfer row${ingestion.transferDiagnostics.length === 1 ? " needs" : "s need"} attention.`
          : ingestion.stale
            ? "Showing the last successful transfer synchronization."
            : "Authoritative transfer source available.",
      latestSync: ingestion.fetchedAt,
    } satisfies PerformanceSource;

    if (ingestion.status === "closed_error") {
      return {
        transfers,
        closedDeals: null,
        transferSource,
        closedDealSource: {
          status: "unavailable",
          message: ingestion.message,
          latestSync: null,
        },
      };
    }

    const usersById = new Map(ingestion.users.map((user) => [user.id, user]));
    const closedDeals = ingestion.closedRecords.flatMap((deal): ScopedOutcomeEvent[] => {
      if (deal.matchStatus !== "matched" || !deal.matchedUserId || !deal.timestamp) return [];
      const user = usersById.get(deal.matchedUserId);
      if (!user) return [];
      return [{
        date: dateKeyInTimeZone(deal.timestamp, timeZone),
        profileId: user.id,
        teamId: user.teamId,
      }];
    });
    return {
      transfers,
      closedDeals,
      transferSource,
      closedDealSource: {
        status: sourceStatus(ingestion.closedDiagnostics.length, ingestion.stale),
        message:
          ingestion.closedDiagnostics.length > 0
            ? `${ingestion.closedDiagnostics.length} closed-deal row${ingestion.closedDiagnostics.length === 1 ? " needs" : "s need"} attention.`
            : ingestion.stale
              ? "Showing the last successful closed-deal synchronization."
              : "Authoritative closed-deal source available.",
        latestSync: ingestion.closedGeneratedAt ?? ingestion.fetchedAt,
      },
    };
  } catch (error) {
    const message =
      error instanceof TransferSheetConfigurationError
        ? error.message
        : "The outcome source could not be loaded right now.";
    const unavailable = { status: "unavailable" as const, message, latestSync: null };
    return { transfers: null, closedDeals: null, transferSource: unavailable, closedDealSource: unavailable };
  }
}

function activityTotals(totals: DashboardTotals, available: boolean) {
  if (!available) {
    return {
      loggedInSeconds: null,
      readySeconds: null,
      talkSeconds: null,
      ringingSeconds: null,
      wrapSeconds: null,
      pausedSeconds: null,
      systemPauseSeconds: null,
      idleSeconds: null,
      untrackedSeconds: null,
      netSeconds: null,
    };
  }
  return {
    loggedInSeconds: totals.loggedInSeconds,
    readySeconds: totals.readySeconds,
    talkSeconds: totals.talkSeconds,
    ringingSeconds: totals.ringingSeconds,
    wrapSeconds: totals.wrapSeconds,
    pausedSeconds: totals.pausedSeconds,
    systemPauseSeconds: totals.systemPauseSeconds,
    idleSeconds: totals.idleSeconds,
    untrackedSeconds: totals.untrackedSeconds,
    netSeconds: totals.netSeconds,
  };
}

function createTotals(input: {
  transfers: ScopedOutcomeEvent[] | null;
  closedDeals: ScopedOutcomeEvent[] | null;
  dialer: DashboardTotals;
  dialerAvailable: boolean;
  sourceRows: number;
}): PerformanceTotals {
  const transfers = input.transfers === null ? null : input.transfers.length;
  const closedDeals = input.closedDeals === null ? null : input.closedDeals.length;
  return {
    transfers,
    closedDeals,
    closedDealRate: calculateClosedDealRate(closedDeals, transfers),
    ...activityTotals(input.dialer, input.dialerAvailable),
    sourceRows: input.sourceRows,
  };
}

export async function getPerformancePageData(
  sessionActor: Actor,
  options: { dateRange: OverviewDateRange; timeZone: string },
): Promise<PerformancePageData> {
  const actor = await resolveCurrentActor(sessionActor);
  const [dashboard, dialerDaily, outcomes] = await Promise.all([
    getDashboardSummaryData(actor, { dateRange: options.dateRange }),
    getDialerDailyAggregates(actor, options.dateRange),
    loadOutcomeData(actor, options.timeZone),
  ]);
  const granularity = selectPerformanceGranularity(options.dateRange);
  const transfers = outcomes.transfers === null
    ? null
    : scopeOutcomeEvents(outcomes.transfers, actor, options.dateRange);
  const closedDeals = outcomes.closedDeals === null
    ? null
    : scopeOutcomeEvents(outcomes.closedDeals, actor, options.dateRange);
  const comparisonTransfers = outcomes.transfers === null || !options.dateRange.comparison
    ? null
    : scopeOutcomeEvents(outcomes.transfers, actor, options.dateRange.comparison);
  const comparisonClosedDeals = outcomes.closedDeals === null || !options.dateRange.comparison
    ? null
    : scopeOutcomeEvents(outcomes.closedDeals, actor, options.dateRange.comparison);
  const dialerAvailable = dashboard.status === "ACTIVE_IMPORT";
  const series = aggregatePerformanceSeries({
    transfers,
    closedDeals,
    dialer: dialerAvailable ? dialerDaily : null,
    granularity,
  });
  const sourceRows = series.reduce((total, row) => total + row.sourceRows, 0);
  const totals = createTotals({
    transfers,
    closedDeals,
    dialer: dashboard.totals,
    dialerAvailable,
    sourceRows,
  });
  const comparison = options.dateRange.comparison
    ? {
        ...createTotals({
          transfers: outcomes.transfers === null ? null : comparisonTransfers,
          closedDeals: outcomes.closedDeals === null ? null : comparisonClosedDeals,
          dialer: dashboard.comparison?.totals ?? dashboard.totals,
          dialerAvailable: dialerAvailable && Boolean(dashboard.comparison?.hasData),
          sourceRows: dashboard.comparison?.totals.rowCount ?? 0,
        }),
        label: options.dateRange.comparison.label,
      }
    : null;

  return {
    role: actor.role,
    range: options.dateRange,
    timeZone: options.timeZone,
    granularity,
    totals,
    comparison,
    series,
    sources: {
      transfers: outcomes.transferSource,
      closedDeals: outcomes.closedDealSource,
      dialer: {
        status: dialerAvailable ? "healthy" : "unavailable",
        message: dialerAvailable
          ? dashboard.totals.rowCount > 0
            ? "Active dialer version available for this scope."
            : "The active dialer version has no rows in this period."
          : "No approved dialer import is active for this scope.",
        latestSync: serializePerformanceTimestamp(dashboard.dataFreshness.latestMetricUpdatedAt),
      },
    },
  };
}
