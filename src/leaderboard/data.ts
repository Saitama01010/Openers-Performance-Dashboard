import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import type {
  DashboardDateWindow,
  OverviewDateRange,
} from "@/dashboard/date-range";
import { getDb } from "@/db";
import {
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { calculateLeaderboardConversion } from "@/leaderboard/analytics";
import type {
  MatchableUser,
  MatchedTransfer,
} from "@/leaderboard/matching";
import {
  rankLeaderboardRows,
  type LeaderboardRow,
  type LeaderboardTrendPoint,
} from "@/leaderboard/ranking";
import {
  ingestAndMatchLeaderboardSources,
  ingestAndMatchTransfers,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import type {
  NormalizedClosedDeal,
  TransferRecord,
} from "@/sheets/contracts";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import {
  normalizeAmericanName,
  TransferSheetConfigurationError,
} from "@/sheets/transfers";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type LeaderboardFilters = {
  query?: string;
  teamId?: string;
  from?: string;
  to?: string;
};

export type LeaderboardLoadOptions = LeaderboardFilters & {
  comparison?: DashboardDateWindow;
};

export type SafeClosedDiagnostics = {
  connectionStatus: "connected";
  worksheet: "Closed";
  headerValidationStatus: "valid";
  totalNonEmptyRows: number;
  validRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  invalidRows: number;
  invalidTimestampRows: number;
  lastSuccessfulSynchronization: string;
};

export type SafeClosedErrorDiagnostics = {
  connectionStatus: "configuration_error" | "unavailable";
  worksheet: "Closed";
  headerValidationStatus: "invalid" | "unknown";
};

type LeaderboardBase = {
  teams: { id: string; name: string }[];
  filters: LeaderboardFilters;
};

export type LeaderboardOverallTotals = {
  transfers: number;
  closedDeals: number | null;
  conversion: number | null;
  trend: LeaderboardTrendPoint[];
  comparison: {
    transfers: number;
    closedDeals: number | null;
    conversion: number | null;
  } | null;
};

export type LeaderboardData =
  | (LeaderboardBase & {
      status: "unconfigured";
      message: string;
      rows: [];
    })
  | (LeaderboardBase & {
      status: "ready";
      rows: LeaderboardRow[];
      totalTransfers: number;
      totalClosedDeals: number | null;
      closedMetricsAvailable: boolean;
      closedMessage?: string;
      closedSourceEmpty: boolean;
      transferSourceRecordCount: number;
      transferDiagnosticCount: number;
      closedDiagnosticCount: number;
      latestSynchronization: string;
      stale: boolean;
      closedDiagnostics?: SafeClosedDiagnostics;
      closedErrorDiagnostics?: SafeClosedErrorDiagnostics;
      overall?: LeaderboardOverallTotals;
    })
  | (LeaderboardBase & {
      status: "source_error";
      message: string;
      rows: [];
    });

export type TransferSummaryData =
  | {
      status: "unconfigured" | "source_error";
      message: string;
    }
  | {
      status: "ready";
      comparisonLabel: string | null;
      comparisonTransfers: number | null;
      diagnosticCount: number;
      totalTransfers: number;
    };

export async function listLeaderboardTeams(actor: Actor) {
  if (actor.role === "manager" && actor.teamIds.length === 0) return [];
  const scopeWhere =
    actor.role === "manager" ? inArray(teams.id, actor.teamIds) : undefined;
  return getDb()
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(visibleTeamWhere(actor), scopeWhere))
    .orderBy(asc(teams.name), asc(teams.id));
}

async function listMatchableUsersForScope(
  actor: Actor,
  scope: "role" | "organization",
) {
  if (actor.role === "manager" && actor.teamIds.length === 0) return [];
  const scopeWhere =
    scope === "organization"
      ? undefined
      : actor.role === "manager"
      ? inArray(teams.id, actor.teamIds)
      : actor.role === "agent"
        ? eq(profiles.id, actor.id)
        : undefined;
  return getDb()
    .select({
      id: profiles.id,
      realName: profiles.name,
      americanName: sourceUserMappings.sourceAgentName,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(profiles)
    .innerJoin(
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
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .leftJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
        visibleTeamWhere(actor),
        scopeWhere,
      ),
    );
}

export function listMatchableUsers(actor: Actor) {
  return listMatchableUsersForScope(actor, "role");
}

export function listLeaderboardUsers(actor: Actor) {
  return listMatchableUsersForScope(
    actor,
    actor.role === "agent" ? "organization" : "role",
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function userMatchesIdentityFilters(
  user: MatchableUser,
  filters: LeaderboardFilters,
) {
  if (filters.teamId && user.teamId !== filters.teamId) return false;
  if (!filters.query) return true;

  const query = normalizeSearchText(filters.query);
  const americanNameQuery = normalizeAmericanName(filters.query);
  return (
    normalizeSearchText(user.realName).includes(query) ||
    normalizeAmericanName(user.americanName).includes(americanNameQuery)
  );
}

function transferMatchesFilters(
  match: Extract<MatchedTransfer, { status: "matched" }>,
  filters: LeaderboardFilters,
  timeZone: string,
) {
  if (!match.transfer.occurredAt) return false;
  if (!userMatchesIdentityFilters(match.user, filters)) return false;

  const transferDate = dateKeyInTimeZone(match.transfer.occurredAt, timeZone);
  if (filters.from && transferDate < filters.from) return false;
  if (filters.to && transferDate > filters.to) return false;
  return true;
}

function actorCanViewTransfer(
  actor: Actor,
  user: Pick<MatchableUser, "id" | "teamId">,
) {
  if (actor.role === "admin") return true;
  if (actor.role === "agent") return actor.id === user.id;
  return user.teamId !== null && actor.teamIds.includes(user.teamId);
}

export function countScopedTransfers(
  matches: readonly MatchedTransfer[],
  actor: Actor,
  window: DashboardDateWindow,
  timeZone: string,
) {
  return matches.reduce((count, match) => {
    if (
      match.status !== "matched" ||
      !actorCanViewTransfer(actor, match.user) ||
      !transferMatchesFilters(
        match,
        { from: window.from, to: window.to },
        timeZone,
      )
    ) {
      return count;
    }
    return count + 1;
  }, 0);
}

function countFilteredTransfers(
  matches: readonly MatchedTransfer[],
  filters: LeaderboardFilters,
  timeZone: string,
) {
  return matches.filter(
    (match) =>
      match.status === "matched" &&
      transferMatchesFilters(match, filters, timeZone),
  ).length;
}

function closedDealMatchesDateFilters(
  deal: NormalizedClosedDeal,
  filters: LeaderboardFilters,
  timeZone: string,
) {
  if (deal.matchStatus !== "matched" || !deal.timestamp) return false;
  const closedDate = dateKeyInTimeZone(deal.timestamp, timeZone);
  if (filters.from && closedDate < filters.from) return false;
  if (filters.to && closedDate > filters.to) return false;
  return true;
}

type SourceDateFilters = Pick<LeaderboardFilters, "from" | "to">;

function sourceDateMatchesFilters(
  date: string,
  filters: SourceDateFilters,
) {
  if (filters.from && date < filters.from) return false;
  if (filters.to && date > filters.to) return false;
  return true;
}

function overallPeriodTotals(
  counts: { transfers: number; closedDeals: number },
  closedMetricsAvailable: boolean,
) {
  const closedDealCount = closedMetricsAvailable ? counts.closedDeals : null;
  return {
    transfers: counts.transfers,
    closedDeals: closedDealCount,
    conversion:
      closedDealCount === null
        ? null
        : calculateLeaderboardConversion(closedDealCount, counts.transfers),
  };
}

export function buildOverallLeaderboardTotals(
  transfers: readonly TransferRecord[],
  closedDeals: readonly NormalizedClosedDeal[] | null,
  filters: SourceDateFilters,
  timeZone: string,
  comparison?: DashboardDateWindow,
): LeaderboardOverallTotals {
  const currentCounts = { transfers: 0, closedDeals: 0 };
  const comparisonCounts = { transfers: 0, closedDeals: 0 };
  const currentTrend = new Map<string, LeaderboardTrendPoint>();

  function countTimestamp(
    timestamp: Date | null,
    metric: keyof typeof currentCounts,
  ) {
    if (!timestamp) return;
    const date = dateKeyInTimeZone(timestamp, timeZone);
    if (sourceDateMatchesFilters(date, filters)) {
      currentCounts[metric] += 1;
      const point = currentTrend.get(date) ?? {
        date,
        transferCount: 0,
        closedDeals: 0,
      };
      if (metric === "transfers") point.transferCount += 1;
      else point.closedDeals += 1;
      currentTrend.set(date, point);
    }
    if (comparison && sourceDateMatchesFilters(date, comparison)) {
      comparisonCounts[metric] += 1;
    }
  }

  for (const transfer of transfers) {
    countTimestamp(transfer.occurredAt, "transfers");
  }
  for (const closedDeal of closedDeals ?? []) {
    if (closedDeal.matchStatus !== "invalid") {
      countTimestamp(closedDeal.timestamp, "closedDeals");
    }
  }

  const closedMetricsAvailable = closedDeals !== null;
  return {
    ...overallPeriodTotals(currentCounts, closedMetricsAvailable),
    trend: [...currentTrend.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
    comparison: comparison
      ? overallPeriodTotals(comparisonCounts, closedMetricsAvailable)
      : null,
  };
}

export function buildClosedDealLeaderboardRows(
  users: readonly MatchableUser[],
  deals: readonly NormalizedClosedDeal[],
  filters: LeaderboardFilters,
  timeZone: string,
  transfers: readonly MatchedTransfer[] = [],
) {
  const filteredUsers = users.filter((user) =>
    userMatchesIdentityFilters(user, filters),
  );
  const closedCounts = new Map(filteredUsers.map((user) => [user.id, 0]));
  const transferCounts = new Map(
    filteredUsers.map((user) => [user.id, 0]),
  );

  for (const match of transfers) {
    if (
      match.status !== "matched" ||
      !transferCounts.has(match.user.id) ||
      !transferMatchesFilters(match, filters, timeZone)
    ) {
      continue;
    }
    transferCounts.set(
      match.user.id,
      (transferCounts.get(match.user.id) ?? 0) + 1,
    );
  }

  for (const deal of deals) {
    if (
      !deal.matchedUserId ||
      !closedCounts.has(deal.matchedUserId) ||
      !closedDealMatchesDateFilters(deal, filters, timeZone)
    ) {
      continue;
    }
    closedCounts.set(
      deal.matchedUserId,
      (closedCounts.get(deal.matchedUserId) ?? 0) + 1,
    );
  }

  return rankLeaderboardRows(
    filteredUsers.map((user) => ({
      profileId: user.id,
      realName: user.realName,
      americanName: user.americanName,
      teamId: user.teamId,
      teamName: user.teamName,
      transferCount: transferCounts.get(user.id) ?? 0,
      closedDeals: closedCounts.get(user.id) ?? 0,
    })),
  );
}

export function buildLeaderboardAnalyticsRows(
  users: readonly MatchableUser[],
  deals: readonly NormalizedClosedDeal[],
  filters: LeaderboardFilters,
  timeZone: string,
  transfers: readonly MatchedTransfer[] = [],
  comparison?: DashboardDateWindow,
) {
  const current = buildClosedDealLeaderboardRows(users, deals, filters, timeZone, transfers);
  const previous = comparison
    ? buildClosedDealLeaderboardRows(
        users,
        deals,
        { ...filters, from: comparison.from, to: comparison.to },
        timeZone,
        transfers,
      )
    : [];
  const previousById = new Map(previous.map((row) => [row.profileId, row]));
  const currentIds = new Set(current.map((row) => row.profileId));
  const trends = new Map<string, Map<string, { date: string; transferCount: number; closedDeals: number }>>();

  function pointFor(profileId: string, date: string) {
    const byDate = trends.get(profileId) ?? new Map();
    trends.set(profileId, byDate);
    const point = byDate.get(date) ?? { date, transferCount: 0, closedDeals: 0 };
    byDate.set(date, point);
    return point;
  }

  for (const match of transfers) {
    if (
      match.status !== "matched" ||
      !currentIds.has(match.user.id) ||
      !transferMatchesFilters(match, filters, timeZone)
    ) continue;
    const date = dateKeyInTimeZone(match.transfer.occurredAt!, timeZone);
    pointFor(match.user.id, date).transferCount += 1;
  }

  for (const deal of deals) {
    if (
      !deal.matchedUserId ||
      !currentIds.has(deal.matchedUserId) ||
      !closedDealMatchesDateFilters(deal, filters, timeZone)
    ) continue;
    const date = dateKeyInTimeZone(deal.timestamp!, timeZone);
    pointFor(deal.matchedUserId, date).closedDeals += 1;
  }

  return current.map((row) => {
    const previousRow = previousById.get(row.profileId);
    return {
      ...row,
      comparison: comparison
        ? {
            transferCount: previousRow?.transferCount ?? 0,
            closedDeals: previousRow?.closedDeals ?? 0,
          }
        : null,
      trend: [...(trends.get(row.profileId)?.values() ?? [])].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
    };
  });
}

function safeClosedDiagnostics(
  deals: readonly NormalizedClosedDeal[],
  totalNonEmptyRows: number,
  lastSuccessfulSynchronization: string,
): SafeClosedDiagnostics {
  return {
    connectionStatus: "connected",
    worksheet: "Closed",
    headerValidationStatus: "valid",
    totalNonEmptyRows,
    validRows: deals.filter((deal) => deal.matchStatus !== "invalid").length,
    matchedRows: deals.filter((deal) => deal.matchStatus === "matched").length,
    unmatchedRows: deals.filter((deal) => deal.matchStatus === "unmatched")
      .length,
    ambiguousRows: deals.filter((deal) => deal.matchStatus === "ambiguous")
      .length,
    invalidRows: deals.filter((deal) => deal.matchStatus === "invalid").length,
    invalidTimestampRows: deals.filter((deal) =>
      deal.validationErrors.some((error) =>
        error.toLocaleLowerCase("en-US").includes("timestamp"),
      ),
    ).length,
    lastSuccessfulSynchronization,
  };
}

export async function getTransferSummary(
  actor: Actor,
  dateRange: OverviewDateRange,
): Promise<TransferSummaryData> {
  const config = transferSheetConfigFromEnv();
  if (!config) {
    return {
      status: "unconfigured",
      message:
        "Configure the server-only Google Apps Script URL and LeaderBoard secret to load transfers.",
    };
  }

  try {
    const ingestion = await ingestAndMatchTransfers(
      listMatchableUsers(actor),
      config,
    );
    if (ingestion.status === "unconfigured") {
      return { status: "unconfigured", message: ingestion.message };
    }
    return {
      status: "ready",
      totalTransfers: countScopedTransfers(
        ingestion.matches,
        actor,
        dateRange,
        ingestion.timeZone,
      ),
      comparisonTransfers: dateRange.comparison
        ? countScopedTransfers(
            ingestion.matches,
            actor,
            dateRange.comparison,
            ingestion.timeZone,
          )
        : null,
      comparisonLabel: dateRange.comparison?.label ?? null,
      diagnosticCount: ingestion.diagnostics.length,
    };
  } catch (error) {
    return {
      status: "source_error",
      message:
        error instanceof TransferSheetConfigurationError
          ? error.message
          : "The transfer source could not be loaded right now. Retry after checking the Xfers connection.",
    };
  }
}

export async function getLeaderboardData(
  actor: Actor,
  options: LeaderboardLoadOptions,
): Promise<LeaderboardData> {
  const { comparison, ...filters } = options;
  const teamRowsPromise = listLeaderboardTeams(actor);
  const config = transferSheetConfigFromEnv();
  if (!config) {
    return {
      status: "unconfigured",
      message:
        "Configure the server-only Google Apps Script URL and LeaderBoard secret to load transfers.",
      rows: [],
      teams: await teamRowsPromise,
      filters,
    };
  }

  const usersPromise = listLeaderboardUsers(actor);
  const ingestionPromise = ingestAndMatchLeaderboardSources(
    usersPromise,
    config,
  );
  let ingestion: Awaited<typeof ingestionPromise>;
  try {
    ingestion = await ingestionPromise;
  } catch (error) {
    return {
      status: "source_error",
      message:
        error instanceof TransferSheetConfigurationError
          ? error.message
          : "The transfer source could not be loaded right now. Retry after checking the Xfers connection.",
      rows: [],
      teams: await teamRowsPromise,
      filters,
    };
  }
  const teamRows = await teamRowsPromise;

  if (ingestion.status === "unconfigured") {
    return {
      status: "unconfigured",
      message: ingestion.message,
      rows: [],
      teams: teamRows,
      filters,
    };
  }

  if (ingestion.status === "closed_error") {
    const rows = buildLeaderboardAnalyticsRows(
      ingestion.users,
      [],
      filters,
      ingestion.timeZone,
      ingestion.transferMatches,
      comparison,
    );
    return {
      status: "ready",
      rows,
      teams: teamRows,
      filters,
      totalTransfers: countFilteredTransfers(
        ingestion.transferMatches,
        filters,
        ingestion.timeZone,
      ),
      totalClosedDeals: null,
      closedMetricsAvailable: false,
      closedMessage: `${ingestion.message} Transfer rankings remain available.`,
      closedSourceEmpty: false,
      transferSourceRecordCount: ingestion.transferRecords.length,
      transferDiagnosticCount: ingestion.transferDiagnostics.length,
      closedDiagnosticCount: 0,
      latestSynchronization: ingestion.fetchedAt,
      stale: ingestion.stale,
      ...(actor.role === "agent"
        ? {}
        : {
            overall: buildOverallLeaderboardTotals(
              ingestion.transferRecords,
              null,
              filters,
              ingestion.timeZone,
              comparison,
            ),
          }),
      closedErrorDiagnostics:
        actor.role === "admin"
          ? {
              connectionStatus:
                ingestion.errorKind === "configuration"
                  ? "configuration_error"
                  : "unavailable",
              worksheet: "Closed",
              headerValidationStatus: ingestion.headerValidationStatus,
            }
          : undefined,
    };
  }

  const rows = buildLeaderboardAnalyticsRows(
    ingestion.users,
    ingestion.closedRecords,
    filters,
    ingestion.timeZone,
    ingestion.transferMatches,
    comparison,
  );
  const totalClosedDeals = rows.reduce(
    (total, row) => total + row.closedDeals,
    0,
  );
  const closedMetricsAvailable =
    ingestion.totalNonEmptyClosedRows === 0 ||
    ingestion.closedRecords.some((deal) => deal.matchStatus !== "invalid");

  return {
    status: "ready",
    rows,
    teams: teamRows,
    filters,
    totalTransfers: countFilteredTransfers(
      ingestion.transferMatches,
      filters,
      ingestion.timeZone,
    ),
    totalClosedDeals: closedMetricsAvailable ? totalClosedDeals : null,
    closedMetricsAvailable,
    closedMessage: closedMetricsAvailable
      ? undefined
      : "Closed worksheet rows cannot be attributed because none contains a valid Opener. Transfer rankings remain available.",
    closedSourceEmpty: ingestion.totalNonEmptyClosedRows === 0,
    transferSourceRecordCount: ingestion.transferRecords.length,
    transferDiagnosticCount: ingestion.transferDiagnostics.length,
    closedDiagnosticCount: ingestion.closedDiagnostics.length,
    latestSynchronization: ingestion.closedGeneratedAt ?? ingestion.fetchedAt,
    stale: ingestion.stale,
    ...(actor.role === "agent"
      ? {}
      : {
          overall: buildOverallLeaderboardTotals(
            ingestion.transferRecords,
            ingestion.closedRecords,
            filters,
            ingestion.timeZone,
            comparison,
          ),
        }),
    closedDiagnostics:
      actor.role === "admin"
        ? safeClosedDiagnostics(
            ingestion.closedRecords,
            ingestion.totalNonEmptyClosedRows,
            ingestion.closedGeneratedAt ?? ingestion.fetchedAt,
          )
        : undefined,
  };
}
