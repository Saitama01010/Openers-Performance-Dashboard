import { describe, expect, it } from "vitest";

import { aggregatePerformanceFlags, aggregateTransferFlags, paginateRows, weekForDate } from "@/flags/analytics";

describe("flag dashboard analytics", () => {
  it("keeps performance composition, team totals, and weekly trend consistent", () => {
    const rows = [
      { agentId: "a", teamIds: ["east"], teamNames: ["East"], wrapFlag: true, pauseFlag: true },
      { agentId: "b", teamIds: ["east"], teamNames: ["East"], wrapFlag: true, pauseFlag: false },
      { agentId: "c", teamIds: ["west"], teamNames: ["West"], wrapFlag: false, pauseFlag: true },
    ];
    const weeklyRows = [
      { ...rows[0], weekStart: "2026-08-03", weekEnd: "2026-08-09" },
      { ...rows[1], weekStart: "2026-08-03", weekEnd: "2026-08-09" },
      { ...rows[2], weekStart: "2026-08-10", weekEnd: "2026-08-16" },
    ];
    const result = aggregatePerformanceFlags(rows, weeklyRows);
    expect(result.composition).toEqual([
      expect.objectContaining({ key: "wrap", count: 2, agents: 2 }),
      expect.objectContaining({ key: "pause", count: 2, agents: 2 }),
    ]);
    expect(result.teams[0]).toMatchObject({ teamName: "East", total: 3, wrapFlags: 2, pauseFlags: 1, agents: 2 });
    expect(result.trend).toEqual([
      expect.objectContaining({ weekStart: "2026-08-03", wrapFlags: 2, pauseFlags: 1, agents: 2 }),
      expect.objectContaining({ weekStart: "2026-08-10", wrapFlags: 0, pauseFlags: 1, agents: 1 }),
    ]);
    expect(result.composition.reduce((sum, item) => sum + item.count, 0)).toBe(result.teams.reduce((sum, team) => sum + team.total, 0));
  });

  it("counts independent transfer buckets and repeat agents without merging weeks", () => {
    const rows = [
      { agentId: "a", teamNames: ["East"], classification: "strong" as const, week: { start: "2026-08-03", end: "2026-08-09" } },
      { agentId: "a", teamNames: ["East"], classification: "improvement" as const, week: { start: "2026-08-10", end: "2026-08-16" } },
      { agentId: "b", teamNames: ["West"], classification: "strong" as const, week: { start: "2026-08-03", end: "2026-08-09" } },
    ];
    const result = aggregateTransferFlags(rows);
    expect(result.repeatFlaggedAgents).toBe(1);
    expect(result.composition).toEqual([
      expect.objectContaining({ key: "strong", count: 2, agents: 2 }),
      expect.objectContaining({ key: "improvement", count: 1, agents: 1 }),
    ]);
    expect(result.teams[0]).toMatchObject({ teamName: "East", total: 2, strongFlags: 1, improvementFlags: 1, agents: 1 });
    expect(result.trend).toHaveLength(2);
    expect(result.composition.reduce((sum, item) => sum + item.count, 0)).toBe(result.teams.reduce((sum, team) => sum + team.total, 0));
  });

  it("normalizes Monday week boundaries and clamps server pagination", () => {
    expect(weekForDate("2026-08-09")).toEqual({ weekStart: "2026-08-03", weekEnd: "2026-08-09" });
    expect(weekForDate("2026-08-10")).toEqual({ weekStart: "2026-08-10", weekEnd: "2026-08-16" });
    expect(paginateRows([1, 2, 3, 4, 5], 3, 2)).toEqual({ rows: [5], pagination: { page: 3, pageSize: 2, total: 5, totalPages: 3 } });
    expect(paginateRows([1, 2], 99, 1).pagination.page).toBe(2);
    expect(paginateRows(Array.from({ length: 137 }, (_, index) => index)).rows).toHaveLength(50);
  });
});
