import { describe, expect, it } from "vitest";

import {
  filterPreviewAgents,
  getPreviewTeams,
  paginatePreviewAgents,
  sortPreviewAgents,
} from "@/app/import/import-preview-table";
import type { AgentPreviewSummary } from "@/import/dialer";

function previewAgent(
  index: number,
  overrides: Partial<AgentPreviewSummary> = {},
): AgentPreviewSummary {
  return {
    agentKey: `agent-${index}`,
    granularity: "hourly",
    dialerAgentName: `Agent ${String(index).padStart(3, "0")}`,
    mappingStatus: "mapped",
    dashboardUserId: `profile-${index}`,
    dashboardUserName: `Dashboard Agent ${index}`,
    teamNames: [index % 2 === 0 ? "East" : "West"],
    accountStatus: "active",
    csvRowCount: 1,
    validRowCount: 1,
    invalidRowCount: 0,
    dateRange: {
      earliest: "2026-07-20",
      latest: "2026-07-20",
    },
    calls: index,
    durations: {
      loggedInSeconds: index * 3600,
      readySeconds: index * 600,
      talkSeconds: index * 1200,
      ringingSeconds: index * 60,
      wrapSeconds: index * 60,
      pausedSeconds: index * 300,
      systemPauseSeconds: null,
      netSeconds: null,
      idleSeconds: index * 300,
      untrackedSeconds: 0,
    },
    performance: {
      talkPercentage: 33.33,
      readyPercentage: 16.67,
      wrapPercentage: 1.67,
      pausedPercentage: 8.33,
      idlePercentage: 8.33,
      callsPerLoggedInHour: 1,
    },
    rowCounts: {
      new: 1,
      changed: 0,
      unchanged: 0,
      invalid: 0,
      unknown: 0,
      out_of_scope: 0,
    },
    importStatus: "Ready",
    hourlyRows: [],
    calculationDetails: {
      hourlyRowsIncluded: 1,
      invalidRowsExcluded: 0,
      earliestDateHour: "2026-07-20 00:00",
      latestDateHour: "2026-07-20 00:00",
      formulas: [],
      rawTotalsSeconds: {
        loggedInSeconds: index * 3600,
        readySeconds: index * 600,
        talkSeconds: index * 1200,
        ringingSeconds: index * 60,
        wrapSeconds: index * 60,
        pausedSeconds: index * 300,
        systemPauseSeconds: null,
        netSeconds: null,
        idleSeconds: index * 300,
        untrackedSeconds: 0,
      },
      formattedTotals: {
        loggedInSeconds: "",
        readySeconds: "",
        talkSeconds: "",
        ringingSeconds: "",
        wrapSeconds: "",
        pausedSeconds: "",
        systemPauseSeconds: "",
        netSeconds: "",
        idleSeconds: "",
        untrackedSeconds: "",
      },
      decimalHours: {
        loggedInSeconds: "",
        readySeconds: "",
        talkSeconds: "",
        ringingSeconds: "",
        wrapSeconds: "",
        pausedSeconds: "",
        systemPauseSeconds: "",
        netSeconds: "",
        idleSeconds: "",
        untrackedSeconds: "",
      },
      rowClassificationTotals: {
        new: 1,
        changed: 0,
        unchanged: 0,
        invalid: 0,
        unknown: 0,
        out_of_scope: 0,
      },
      callsPerLoggedInHourFormula: "",
    },
    ...overrides,
  };
}

describe("compact import preview table state", () => {
  it("searches by agent name without changing final metric values", () => {
    const agents = [previewAgent(1), previewAgent(12), previewAgent(120)];
    const result = filterPreviewAgents(agents, {
      query: "agent 012",
      status: "all",
      team: "all",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(agents[1]);
    expect(result[0]?.calls).toBe(12);
    expect(result[0]?.durations.loggedInSeconds).toBe(43_200);
    expect(result[0]?.performance.talkPercentage).toBe(33.33);
  });

  it("filters mapped, unmatched, unauthorized, excluded, invalid mapping, and invalid-row states", () => {
    const agents = [
      previewAgent(1),
      previewAgent(2, {
        mappingStatus: "unmapped",
        importStatus: "Blocked: unmapped",
      }),
      previewAgent(3, {
        mappingStatus: "out_of_scope",
        importStatus: "Blocked: out of scope",
      }),
      previewAgent(4, {
        mappingStatus: "invalid_mapping",
        importStatus: "Blocked: invalid mapping",
      }),
      previewAgent(5, {
        invalidRowCount: 1,
        importStatus: "Blocked: invalid rows",
      }),
    ];

    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "mapped",
        team: "all",
      }),
    ).toHaveLength(2);
    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "unmapped",
        team: "all",
      })[0]?.dialerAgentName,
    ).toBe("Agent 002");
    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "out_of_scope",
        team: "all",
      })[0]?.dialerAgentName,
    ).toBe("Agent 003");
    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "invalid_mapping",
        team: "all",
      })[0]?.dialerAgentName,
    ).toBe("Agent 004");
    expect(
      filterPreviewAgents(agents, {
        include: "excluded",
        query: "",
        status: "all",
        team: "all",
      }),
    ).toHaveLength(4);
    expect(
      filterPreviewAgents(agents, {
        include: "included",
        query: "",
        status: "all",
        team: "all",
      }),
    ).toHaveLength(1);
    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "invalid_rows",
        team: "all",
      })[0]?.dialerAgentName,
    ).toBe("Agent 005");
  });

  it("builds team options and filters by an exact available team", () => {
    const agents = [
      previewAgent(1, { teamNames: ["West", "Shared"] }),
      previewAgent(2, { teamNames: ["East", "Shared"] }),
      previewAgent(3, { teamNames: [] }),
    ];

    expect(getPreviewTeams(agents)).toEqual(["East", "Shared", "West"]);
    expect(
      filterPreviewAgents(agents, {
        query: "",
        status: "all",
        team: "Shared",
      }).map((agent) => agent.agentKey),
    ).toEqual(["agent-1", "agent-2"]);
  });

  it("sorts without mutating the backend preview array", () => {
    const agents = [previewAgent(2), previewAgent(1), previewAgent(3)];
    const sorted = sortPreviewAgents(agents, "calls", "desc");

    expect(sorted.map((agent) => agent.calls)).toEqual([3, 2, 1]);
    expect(agents.map((agent) => agent.calls)).toEqual([2, 1, 3]);
  });

  it("renders only the requested page for imports larger than 600 agents", () => {
    const agents = Array.from({ length: 625 }, (_, index) =>
      previewAgent(index + 1),
    );
    const firstPage = paginatePreviewAgents(agents, 1, 25);
    const lastPage = paginatePreviewAgents(agents, 25, 25);

    expect(firstPage.rows).toHaveLength(25);
    expect(firstPage.from).toBe(1);
    expect(firstPage.to).toBe(25);
    expect(firstPage.totalPages).toBe(25);
    expect(lastPage.rows).toHaveLength(25);
    expect(lastPage.from).toBe(601);
    expect(lastPage.to).toBe(625);
  });

  it("supports 25, 50, and 100 row pages and clamps invalid page requests", () => {
    const agents = Array.from({ length: 120 }, (_, index) =>
      previewAgent(index + 1),
    );

    expect(paginatePreviewAgents(agents, 1, 25).rows).toHaveLength(25);
    expect(paginatePreviewAgents(agents, 1, 50).rows).toHaveLength(50);
    expect(paginatePreviewAgents(agents, 1, 100).rows).toHaveLength(100);
    expect(paginatePreviewAgents(agents, 99, 25).page).toBe(5);
  });
});
