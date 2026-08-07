import { describe, expect, it } from "vitest";

import {
  aggregateLeaderboardTrend,
  calculateLeaderboardConversion,
  deriveLeaderboardPodium,
  leaderboardTotals,
  prepareLeaderboardRows,
  resolveLeaderboardView,
  type LeaderboardViewState,
} from "@/leaderboard/analytics";
import type { LeaderboardRow } from "@/leaderboard/ranking";

const rows: LeaderboardRow[] = [
  {
    profileId: "a", realName: "Amira Ayman", americanName: "Gia Monroe", teamId: "east", teamName: "East",
    transferCount: 10, closedDeals: 4, comparison: { transferCount: 8, closedDeals: 2 },
    trend: [{ date: "2026-08-01", transferCount: 4, closedDeals: 1 }, { date: "2026-08-02", transferCount: 6, closedDeals: 3 }],
  },
  {
    profileId: "b", realName: "Basma Real", americanName: "Amy Lane", teamId: "west", teamName: "West",
    transferCount: 4, closedDeals: 3, comparison: { transferCount: 10, closedDeals: 5 },
    trend: [{ date: "2026-08-01", transferCount: 4, closedDeals: 3 }],
  },
  {
    profileId: "c", realName: "Cairo Agent", americanName: "Zoe Lane", teamId: "east", teamName: "East",
    transferCount: 0, closedDeals: 0, comparison: { transferCount: 1, closedDeals: 0 }, trend: [],
  },
];

const view: LeaderboardViewState = {
  query: "", teamId: "", metric: "closed-deals", sortBy: "closed-deals", direction: "desc", topOnly: false,
};

describe("leaderboard analytics", () => {
  it("calculates conversion honestly and never divides by zero", () => {
    expect(calculateLeaderboardConversion(2, 4)).toBe(50);
    expect(calculateLeaderboardConversion(0, 0)).toBeNull();
  });

  it("switches metric ranking and supports sort direction", () => {
    expect(prepareLeaderboardRows(rows, view).map((row) => row.profileId)).toEqual(["a", "b", "c"]);
    expect(prepareLeaderboardRows(rows, { ...view, metric: "conversion", sortBy: "conversion" }).map((row) => row.profileId)).toEqual(["b", "a", "c"]);
    expect(prepareLeaderboardRows(rows, { ...view, direction: "asc" }).map((row) => row.profileId)).toEqual(["c", "b", "a"]);
  });

  it("filters names and teams case-insensitively", () => {
    expect(prepareLeaderboardRows(rows, { ...view, query: "GIA mon", teamId: "east" }).map((row) => row.profileId)).toEqual(["a"]);
    expect(prepareLeaderboardRows(rows, { ...view, query: "basma" }).map((row) => row.profileId)).toEqual(["b"]);
  });

  it("derives the podium, movement, and top-only segment", () => {
    const prepared = prepareLeaderboardRows(rows, view);
    expect(prepared[0]).toMatchObject({ profileId: "a", displayRank: 1, movement: 1 });
    expect(deriveLeaderboardPodium(rows, { query: "", teamId: "", metric: "transfers" }).map((row) => row.profileId)).toEqual(["a", "b", "c"]);
    expect(prepareLeaderboardRows(Array.from({ length: 12 }, (_, index) => ({ ...rows[0], profileId: String(index), americanName: `Agent ${index}`, closedDeals: index })), { ...view, topOnly: true })).toHaveLength(10);
  });

  it("aggregates only real trend dates and keeps chart/table totals aligned", () => {
    expect(aggregateLeaderboardTrend(rows)).toEqual([
      { date: "2026-08-01", transferCount: 8, closedDeals: 4 },
      { date: "2026-08-02", transferCount: 6, closedDeals: 3 },
    ]);
    expect(leaderboardTotals(rows)).toEqual({
      current: { transferCount: 14, closedDeals: 7 },
      comparison: { transferCount: 19, closedDeals: 7 },
    });
  });

  it("resolves only supported URL state and handles empty input", () => {
    expect(resolveLeaderboardView({ metric: "conversion", sort: "transfers", direction: "asc", top: "1", q: " Gia " })).toEqual({
      query: "Gia", teamId: "", metric: "conversion", sortBy: "transfers", direction: "asc", topOnly: true,
    });
    expect(prepareLeaderboardRows([], view)).toEqual([]);
  });
});
