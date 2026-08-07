import { describe, expect, it } from "vitest";

import {
  calculateAgentDirectoryKpis,
  calculateConversion,
  prepareAgentDirectoryRows,
  resolveAgentDirectoryFilters,
  type AgentDirectoryRow,
} from "@/agents/directory-analytics";

function row(overrides: Partial<AgentDirectoryRow> = {}): AgentDirectoryRow {
  return {
    profileId: "agent-1",
    realName: "Agent One",
    americanName: "Alex One",
    teamId: "east",
    teamIds: ["east"],
    teamName: "East Openers",
    accountStatus: "active",
    hasMetrics: true,
    loggedInSeconds: 3600,
    talkSeconds: 900,
    talkPercentage: 25,
    transfers: 10,
    closedDeals: 4,
    conversion: 40,
    comparison: {
      loggedInSeconds: 3000,
      talkPercentage: 20,
      transfers: 8,
      closedDeals: 2,
      conversion: 25,
    },
    trend: [],
    ...overrides,
  };
}

describe("agent directory analytics", () => {
  it("normalizes filters and rejects unsupported values", () => {
    expect(resolveAgentDirectoryFilters({
      q: "  Alex   One ",
      data: "bad",
      direction: "bad",
      sort: "bad",
      view: "attention",
      page: "-7",
    })).toEqual({
      query: "Alex One",
      teamId: "",
      status: "",
      data: "with-data",
      sortBy: "logged-in",
      direction: "desc",
      view: "attention",
      page: 1,
    });
  });

  it("searches both names, applies role-provided team/data/status filters, sorts, and paginates", () => {
    const rows = [
      row(),
      row({ profileId: "agent-2", realName: "Second Agent", americanName: "Jamie Ray", teamId: "west", teamIds: ["west"], teamName: "West", loggedInSeconds: 900 }),
      row({ profileId: "agent-3", realName: "No Data", americanName: null, hasMetrics: false, loggedInSeconds: null, talkSeconds: null, talkPercentage: null }),
    ];
    const searched = prepareAgentDirectoryRows(rows, {
      ...resolveAgentDirectoryFilters({ q: "jamie", data: "all" }),
      page: 1,
    }, 1);
    expect(searched.pageRows.map((value) => value.profileId)).toEqual(["agent-2"]);
    expect(searched.pagination).toMatchObject({ totalRows: 1, totalPages: 1, from: 1, to: 1 });

    const filtered = prepareAgentDirectoryRows(rows, {
      ...resolveAgentDirectoryFilters({ team: "east", status: "active", data: "without-data" }),
      page: 1,
    });
    expect(filtered.pageRows.map((value) => value.profileId)).toEqual(["agent-3"]);
  });

  it("keeps unavailable values last and derives deterministic top and attention views", () => {
    const rows = [
      row({ profileId: "a", transfers: 20 }),
      row({ profileId: "b", transfers: 10 }),
      row({ profileId: "c", transfers: 5 }),
      row({ profileId: "d", transfers: null, hasMetrics: false }),
      row({ profileId: "e", transfers: 1 }),
    ];
    const top = prepareAgentDirectoryRows(rows, resolveAgentDirectoryFilters({ data: "all", sort: "transfers", view: "top" }));
    expect(top.pageRows.map((value) => value.profileId)).toEqual(["a"]);
    const attention = prepareAgentDirectoryRows(rows, resolveAgentDirectoryFilters({ data: "all", view: "attention" }));
    expect(attention.pageRows.map((value) => value.profileId)).toEqual(["d"]);
  });

  it("excludes unavailable averages and uses only real previous-period values", () => {
    const kpis = calculateAgentDirectoryKpis([
      row(),
      row({ profileId: "agent-2", loggedInSeconds: null, talkPercentage: null, comparison: null }),
      row({ profileId: "agent-3", loggedInSeconds: 1800, talkPercentage: 35, comparison: { loggedInSeconds: null, talkPercentage: 30, transfers: null, closedDeals: null, conversion: null } }),
    ]);
    expect(kpis).toMatchObject({
      totalAgents: 3,
      activeAccounts: 3,
      averageLoggedInSeconds: 2700,
      averageLoggedInComparison: 3000,
      averageTalkPercentage: 30,
      averageTalkComparison: 25,
      loggedInSampleSize: 2,
      talkSampleSize: 2,
    });
  });

  it("does not invent conversion without authoritative transfers", () => {
    expect(calculateConversion(4, 10)).toBe(40);
    expect(calculateConversion(0, 0)).toBeNull();
    expect(calculateConversion(4, null)).toBeNull();
    expect(calculateConversion(null, 10)).toBeNull();
  });
});
