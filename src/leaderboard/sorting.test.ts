import { describe, expect, it } from "vitest";

import {
  nextLeaderboardSort,
  resolveLeaderboardSort,
  sortLeaderboardDisplayRows,
  type LeaderboardDisplayRow,
} from "@/leaderboard/sorting";

const rows: LeaderboardDisplayRow[] = [
  {
    profileId: "a",
    realName: "Agent A",
    americanName: "Amy",
    teamId: "team-1",
    teamName: "Team One",
    transferCount: 8,
    closedDeals: 0,
    rank: 1,
  },
  {
    profileId: "b",
    realName: "Agent B",
    americanName: "Blair",
    teamId: "team-1",
    teamName: "Team One",
    transferCount: 3,
    closedDeals: 2,
    rank: 2,
  },
  {
    profileId: "c",
    realName: "Agent C",
    americanName: "Casey",
    teamId: "team-2",
    teamName: "Team Two",
    transferCount: 5,
    closedDeals: 6,
    rank: 3,
  },
];

describe("LeaderBoard table sorting", () => {
  it("resolves only supported URL sort states", () => {
    expect(
      resolveLeaderboardSort({
        sort: "transfers",
        direction: "asc",
      }),
    ).toEqual({ column: "transfers", direction: "asc" });
    expect(
      resolveLeaderboardSort({
        sort: "closed-deals",
        direction: "desc",
      }),
    ).toEqual({ column: "closed-deals", direction: "desc" });
    expect(
      resolveLeaderboardSort({
        sort: "calls",
        direction: "sideways",
      }),
    ).toBeNull();
  });

  it("cycles each column through descending, ascending, and unsorted", () => {
    const descending = nextLeaderboardSort(null, "transfers");
    const ascending = nextLeaderboardSort(descending, "transfers");

    expect(descending).toEqual({
      column: "transfers",
      direction: "desc",
    });
    expect(ascending).toEqual({
      column: "transfers",
      direction: "asc",
    });
    expect(nextLeaderboardSort(ascending, "transfers")).toBeNull();
    expect(nextLeaderboardSort(ascending, "closed-deals")).toEqual({
      column: "closed-deals",
      direction: "desc",
    });
  });

  it("sorts filtered rows without changing their transfer ranks", () => {
    expect(
      sortLeaderboardDisplayRows(rows, {
        column: "transfers",
        direction: "asc",
      }).map((row) => [row.profileId, row.rank]),
    ).toEqual([
      ["b", 2],
      ["c", 3],
      ["a", 1],
    ]);
  });

  it("sorts real closed-deal values", () => {
    expect(
      sortLeaderboardDisplayRows(rows, {
        column: "closed-deals",
        direction: "desc",
      }).map((row) => row.profileId),
    ).toEqual(["c", "b", "a"]);
  });
});
