import type { LeaderboardRow, LeaderboardTrendPoint } from "@/leaderboard/ranking";
import type { LeaderboardSortColumn, LeaderboardSortDirection } from "@/leaderboard/sorting";

export type LeaderboardMetric = LeaderboardSortColumn;

export type LeaderboardViewState = {
  query: string;
  teamId: string;
  metric: LeaderboardMetric;
  sortBy: LeaderboardSortColumn;
  direction: LeaderboardSortDirection;
  topOnly: boolean;
};

export type LeaderboardPreparedRow = LeaderboardRow & {
  conversion: number | null;
  displayRank: number;
  movement: number | null;
};

export const DEFAULT_LEADERBOARD_VIEW: LeaderboardViewState = {
  query: "",
  teamId: "",
  metric: "closed-deals",
  sortBy: "closed-deals",
  direction: "desc",
  topOnly: false,
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function calculateLeaderboardConversion(closedDeals: number, transfers: number) {
  if (transfers <= 0) return null;
  return (closedDeals / transfers) * 100;
}

export function calculateLeaderboardDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return { absolute: null, percentage: null };
  const absolute = current - previous;
  return {
    absolute,
    percentage: previous === 0 ? null : (absolute / previous) * 100,
  };
}

export function resolveLeaderboardView(
  params: Record<string, string | string[] | undefined>,
): LeaderboardViewState {
  const metric = firstValue(params.metric);
  const sort = firstValue(params.sort);
  const direction = firstValue(params.direction);
  return {
    query: firstValue(params.q)?.trim() ?? "",
    teamId: firstValue(params.teamId)?.trim() ?? "",
    metric:
      metric === "transfers" || metric === "conversion" || metric === "closed-deals"
        ? metric
        : DEFAULT_LEADERBOARD_VIEW.metric,
    sortBy:
      sort === "transfers" || sort === "conversion" || sort === "closed-deals"
        ? sort
        : metric === "transfers" || metric === "conversion" || metric === "closed-deals"
          ? metric
          : DEFAULT_LEADERBOARD_VIEW.sortBy,
    direction: direction === "asc" ? "asc" : "desc",
    topOnly: firstValue(params.top) === "1",
  };
}

export function leaderboardMetricValue(
  row: Pick<LeaderboardRow, "transferCount" | "closedDeals">,
  metric: LeaderboardMetric,
) {
  if (metric === "transfers") return row.transferCount;
  if (metric === "closed-deals") return row.closedDeals;
  return calculateLeaderboardConversion(row.closedDeals, row.transferCount);
}

function compareMetric(
  left: Pick<LeaderboardRow, "transferCount" | "closedDeals" | "americanName">,
  right: Pick<LeaderboardRow, "transferCount" | "closedDeals" | "americanName">,
  metric: LeaderboardMetric,
  direction: LeaderboardSortDirection,
) {
  const leftValue = leaderboardMetricValue(left, metric);
  const rightValue = leaderboardMetricValue(right, metric);
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  const numeric = ((leftValue ?? 0) - (rightValue ?? 0)) * (direction === "asc" ? 1 : -1);
  return numeric || left.americanName.localeCompare(right.americanName, "en", { sensitivity: "base" });
}

function rankForMetric(rows: readonly LeaderboardRow[], metric: LeaderboardMetric) {
  return [...rows]
    .sort((left, right) => compareMetric(left, right, metric, "desc"))
    .map((row, index) => ({ row, rank: index + 1 }));
}

export function prepareLeaderboardRows(
  rows: readonly LeaderboardRow[],
  view: LeaderboardViewState,
) {
  const query = normalizedSearch(view.query);
  const filtered = rows.filter((row) => {
    if (view.teamId && row.teamId !== view.teamId) return false;
    if (!query) return true;
    return normalizedSearch(`${row.realName} ${row.americanName}`).includes(query);
  });
  const currentRanks = rankForMetric(filtered, view.metric);
  const previousRows = filtered.filter((row) => row.comparison !== null && row.comparison !== undefined).map((row) => ({
    ...row,
    transferCount: row.comparison?.transferCount ?? 0,
    closedDeals: row.comparison?.closedDeals ?? 0,
  }));
  const previousRanks = new Map(rankForMetric(previousRows, view.metric).map((entry) => [entry.row.profileId, entry.rank]));
  const prepared: LeaderboardPreparedRow[] = currentRanks.map(({ row, rank }) => ({
    ...row,
    conversion: calculateLeaderboardConversion(row.closedDeals, row.transferCount),
    displayRank: rank,
    movement: row.comparison === null || row.comparison === undefined
      ? null
      : (previousRanks.get(row.profileId) ?? rank) - rank,
  }));
  const visible = view.topOnly ? prepared.filter((row) => row.displayRank <= 10) : prepared;
  visible.sort((left, right) => compareMetric(left, right, view.sortBy, view.direction));
  return visible;
}

export function deriveLeaderboardPodium(
  rows: readonly LeaderboardRow[],
  view: Pick<LeaderboardViewState, "query" | "teamId" | "metric">,
) {
  return prepareLeaderboardRows(rows, {
    ...DEFAULT_LEADERBOARD_VIEW,
    ...view,
    sortBy: view.metric,
    direction: "desc",
    topOnly: false,
  }).slice(0, 3);
}

export function aggregateLeaderboardTrend(rows: readonly LeaderboardRow[]) {
  const points = new Map<string, LeaderboardTrendPoint>();
  for (const row of rows) {
    for (const point of row.trend ?? []) {
      const current = points.get(point.date) ?? { date: point.date, transferCount: 0, closedDeals: 0 };
      current.transferCount += point.transferCount;
      current.closedDeals += point.closedDeals;
      points.set(point.date, current);
    }
  }
  return [...points.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function leaderboardTotals(rows: readonly LeaderboardRow[]) {
  const current = rows.reduce(
    (totals, row) => ({
      transferCount: totals.transferCount + row.transferCount,
      closedDeals: totals.closedDeals + row.closedDeals,
    }),
    { transferCount: 0, closedDeals: 0 },
  );
  const hasComparison = rows.some((row) => row.comparison !== null && row.comparison !== undefined);
  const comparison = hasComparison
    ? rows.reduce(
        (totals, row) => ({
          transferCount: totals.transferCount + (row.comparison?.transferCount ?? 0),
          closedDeals: totals.closedDeals + (row.comparison?.closedDeals ?? 0),
        }),
        { transferCount: 0, closedDeals: 0 },
      )
    : null;
  return { current, comparison };
}
