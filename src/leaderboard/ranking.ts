export type LeaderboardRow = {
  profileId: string;
  realName: string;
  americanName: string;
  teamId: string | null;
  teamName: string | null;
  transferCount: number;
  closedDeals: number;
  rank?: number;
  comparison?: {
    transferCount: number;
    closedDeals: number;
  } | null;
  trend?: LeaderboardTrendPoint[];
};

export type LeaderboardTrendPoint = {
  date: string;
  transferCount: number;
  closedDeals: number;
};

/**
 * Ranking is deterministic: valid matched Closed rows descending, then
 * American Name ascending.
 */
export function rankLeaderboardRows(rows: readonly LeaderboardRow[]) {
  return [...rows]
    .sort(
      (left, right) =>
        right.closedDeals - left.closedDeals ||
        left.americanName.localeCompare(right.americanName, "en", {
          sensitivity: "base",
        }),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
