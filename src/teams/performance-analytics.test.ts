import { describe, expect, it } from "vitest";

import {
  buildHealthMix,
  calculateTeamKpis,
  healthForTarget,
  prepareTeamRows,
  resolveTeamPerformanceFilters,
  type TeamPerformanceRow,
} from "@/teams/performance-analytics";

function row(overrides: Partial<TeamPerformanceRow> = {}): TeamPerformanceRow {
  return {
    teamId: "team-1",
    teamName: "East Openers",
    activeAgents: 2,
    agentsWithDialerData: 2,
    transfers: 10,
    closedDeals: 4,
    conversion: 40,
    averageLoggedInSeconds: 3600,
    averageTalkPercentage: 25,
    comparison: {
      transfers: 8,
      closedDeals: 2,
      conversion: 25,
      averageLoggedInSeconds: 3000,
      averageTalkPercentage: 20,
    },
    health: "healthy",
    healthLabel: "Target achieved",
    targetValue: 8,
    targetMetric: "transfers",
    trend: [],
    ...overrides,
  };
}

describe("team performance analytics", () => {
  it("normalizes supported filters and rejects unknown values", () => {
    expect(resolveTeamPerformanceFilters({ metric: "conversion", view: "trends", page: "2" }))
      .toMatchObject({ metric: "conversion", sortBy: "conversion", view: "trends", page: 2 });
    expect(resolveTeamPerformanceFilters({ metric: "profit", status: "warning", page: "-2" }))
      .toMatchObject({ metric: "transfers", status: "", page: 1 });
  });

  it("sorts, filters, and paginates without treating unavailable values as zero", () => {
    const result = prepareTeamRows([
      row(),
      row({ teamId: "team-2", teamName: "West Openers", transfers: null, health: "unavailable" }),
      row({ teamId: "team-3", teamName: "North Openers", transfers: 12, health: "under-target" }),
    ], resolveTeamPerformanceFilters({ status: "under-target" }), 1);
    expect(result.pageRows.map((item) => item.teamId)).toEqual(["team-3"]);
    expect(result.pagination).toMatchObject({ totalRows: 1, page: 1, from: 1, to: 1 });
  });

  it("keeps source-unavailable KPI values unavailable", () => {
    const kpis = calculateTeamKpis([row(), row({ teamId: "team-2", transfers: null, closedDeals: null })]);
    expect(kpis.transfers).toBeNull();
    expect(kpis.closedDeals).toBeNull();
    expect(kpis.conversion).toBeNull();
    expect(kpis.averageLoggedInSeconds).toBe(3600);
  });

  it("only assigns health when a real target and source value exist", () => {
    expect(healthForTarget(10, null)).toEqual({ health: "not-configured", healthLabel: "No target configured" });
    expect(healthForTarget(null, 10)).toEqual({ health: "unavailable", healthLabel: "Source unavailable" });
    expect(healthForTarget(9, 10).health).toBe("under-target");
    expect(healthForTarget(10, 10).health).toBe("healthy");
  });

  it("reports every honest health state in the mix", () => {
    const mix = buildHealthMix([
      row(),
      row({ teamId: "team-2", health: "not-configured" }),
    ]);
    expect(mix.find((item) => item.health === "healthy")?.count).toBe(1);
    expect(mix.find((item) => item.health === "not-configured")?.count).toBe(1);
  });
});
