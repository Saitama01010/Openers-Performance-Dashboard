import { describe, expect, it } from "vitest";

import { rankLeaderboardRows } from "@/leaderboard/ranking";

describe("leaderboard ranking", () => {
  it("uses deals, transfers, then American Name for deterministic ordering", () => {
    const rows = rankLeaderboardRows([
      {
        profileId: "a",
        realName: "A",
        americanName: "Zoe",
        teamId: null,
        teamName: null,
        closedDeals: 3,
        transferCount: 5,
      },
      {
        profileId: "b",
        realName: "B",
        americanName: "Amy",
        teamId: null,
        teamName: null,
        closedDeals: 3,
        transferCount: 8,
      },
      {
        profileId: "c",
        realName: "C",
        americanName: "Ada",
        teamId: null,
        teamName: null,
        closedDeals: 3,
        transferCount: 8,
      },
    ]);
    expect(rows.map((row) => [row.profileId, row.rank])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 3],
    ]);
  });
});
