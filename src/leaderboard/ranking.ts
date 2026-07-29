export type LeaderboardRow = {
  profileId: string;
  realName: string;
  americanName: string;
  teamId: string | null;
  teamName: string | null;
  transferCount: number;
  rank?: number;
};

/**
 * Ranking is deterministic: valid matched transfers descending, then American
 * Name ascending.
 */
export function rankLeaderboardRows(rows: readonly LeaderboardRow[]) {
  return [...rows]
    .sort(
      (left, right) =>
        right.transferCount - left.transferCount ||
        left.americanName.localeCompare(right.americanName, "en", {
          sensitivity: "base",
        }),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
