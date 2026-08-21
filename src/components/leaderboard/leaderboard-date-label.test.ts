import { describe, expect, it } from "vitest";

import { formatCompactLeaderboardRange } from "@/components/leaderboard/leaderboard-date-label";

describe("compact LeaderBoard date range", () => {
  it("collapses repeated month and year text", () => {
    expect(formatCompactLeaderboardRange("2026-08-01", "2026-08-21")).toBe(
      "Aug 1–21, 2026",
    );
  });

  it("keeps enough context across months and years", () => {
    expect(formatCompactLeaderboardRange("2026-07-28", "2026-08-03")).toBe(
      "Jul 28–Aug 3, 2026",
    );
    expect(formatCompactLeaderboardRange("2025-12-29", "2026-01-04")).toBe(
      "Dec 29, 2025–Jan 4, 2026",
    );
  });

  it("formats a single day without a range", () => {
    expect(formatCompactLeaderboardRange("2026-08-21", "2026-08-21")).toBe(
      "Aug 21, 2026",
    );
  });
});
