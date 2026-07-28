export type LeaderboardRow = {
  profileId: string;
  realName: string;
  americanName: string;
  teamId: string | null;
  teamName: string | null;
  closedDeals: number;
  transferCount: number;
  rank?: number;
};

/**
 * Ranking is deterministic: closed deals descending, optional transfer count
 * descending as the tie-breaker, then American Name ascending.
 */
export function rankLeaderboardRows(rows: readonly LeaderboardRow[]) {
  return [...rows]
    .sort(
      (left, right) =>
        right.closedDeals - left.closedDeals ||
        right.transferCount - left.transferCount ||
        left.americanName.localeCompare(right.americanName, "en", {
          sensitivity: "base",
        }),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
