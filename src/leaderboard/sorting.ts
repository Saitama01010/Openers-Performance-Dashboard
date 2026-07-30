import type { LeaderboardRow } from "@/leaderboard/ranking";

export type LeaderboardSortColumn = "transfers" | "closed-deals";
export type LeaderboardSortDirection = "asc" | "desc";
export type LeaderboardSortState = {
  column: LeaderboardSortColumn;
  direction: LeaderboardSortDirection;
} | null;

export type LeaderboardDisplayRow = LeaderboardRow;

type LeaderboardSortParams = {
  direction?: string | string[];
  sort?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveLeaderboardSort(
  params: LeaderboardSortParams,
): LeaderboardSortState {
  const column = firstValue(params.sort);
  const direction = firstValue(params.direction);

  if (
    (column === "transfers" || column === "closed-deals") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { column, direction };
  }

  return null;
}

export function nextLeaderboardSort(
  current: LeaderboardSortState,
  column: LeaderboardSortColumn,
): LeaderboardSortState {
  if (!current || current.column !== column) {
    return { column, direction: "desc" };
  }
  if (current.direction === "desc") {
    return { column, direction: "asc" };
  }
  return null;
}

function rankOrder(
  left: LeaderboardDisplayRow,
  right: LeaderboardDisplayRow,
) {
  return (left.rank ?? Number.MAX_SAFE_INTEGER) -
    (right.rank ?? Number.MAX_SAFE_INTEGER);
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: LeaderboardSortDirection,
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * (direction === "asc" ? 1 : -1);
}

export function sortLeaderboardDisplayRows(
  rows: readonly LeaderboardDisplayRow[],
  sort: LeaderboardSortState,
) {
  if (!sort) return [...rows];

  return [...rows].sort((left, right) => {
    const comparison =
      sort.column === "transfers"
        ? compareNullableNumber(
            left.transferCount,
            right.transferCount,
            sort.direction,
          )
        : compareNullableNumber(
            left.closedDeals,
            right.closedDeals,
            sort.direction,
          );

    return comparison || rankOrder(left, right);
  });
}
