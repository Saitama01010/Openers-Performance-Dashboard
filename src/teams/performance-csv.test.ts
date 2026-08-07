import { describe, expect, it } from "vitest";

import { teamPerformanceCsv } from "@/teams/performance-csv";
import type { TeamPerformanceRow } from "@/teams/performance-analytics";

describe("team performance CSV", () => {
  it("preserves unavailable values and neutralizes spreadsheet formulas", () => {
    const row = {
      teamId: "team-1",
      teamName: "=Unsafe",
      activeAgents: 0,
      agentsWithDialerData: 0,
      transfers: null,
      closedDeals: null,
      conversion: null,
      averageLoggedInSeconds: null,
      averageTalkPercentage: null,
      comparison: null,
      health: "not-configured",
      healthLabel: "No target configured",
      targetMetric: "transfers",
      targetValue: null,
      trend: [],
    } satisfies TeamPerformanceRow;
    const csv = teamPerformanceCsv([row]);
    expect(csv).toContain("'=Unsafe");
    expect(csv).toContain("Unavailable");
    expect(csv).not.toContain(",0,0,0,0,0,");
  });
});
