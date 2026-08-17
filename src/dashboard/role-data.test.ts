import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAgentOverviewMetrics,
  scopeManagerTeamCompetition,
} from "@/dashboard/role-data";
import type { RoleDashboardOutcomeSource } from "@/dashboard/outcome-source";
import type { MatchedTransfer } from "@/leaderboard/matching";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

function transfer(agentId: string, occurredAt: string): MatchedTransfer {
  return {
    status: "matched",
    transfer: {
      sourceRowId: `Xfers:${agentId}:${occurredAt}`,
      rawTimestamp: occurredAt,
      occurredAt: new Date(occurredAt),
      sheetRealName: `Real ${agentId}`,
      sheetAmericanName: `American ${agentId}`,
      customerName: "Test Customer",
      phoneNumber: "5550000000",
    },
    user: {
      id: agentId,
      realName: `Real ${agentId}`,
      americanName: `American ${agentId}`,
      teamId: "team-1",
      teamName: "Team One",
    },
  };
}

function closedDeal(agentId: string, occurredAt: string): NormalizedClosedDeal {
  return {
    sourceRowNumber: 2,
    timestamp: new Date(occurredAt),
    timestampIso: occurredAt,
    closer: "Closer",
    customerName: "Test Customer",
    fileNumber: `F-${agentId}-${occurredAt}`,
    debtAmount: "1000",
    readyForSubmission: "",
    sheetOpener: `American ${agentId}`,
    extractedAmericanName: `American ${agentId}`,
    normalizedAmericanName: `american ${agentId}`,
    matchedUserId: agentId,
    matchStatus: "matched",
    validationErrors: [],
  };
}

function totals(calls: number, loggedInSeconds: number) {
  return {
    calls,
    loggedInSeconds,
    readySeconds: 0,
    talkSeconds: 0,
    ringingSeconds: null,
    wrapSeconds: 0,
    pausedSeconds: 0,
    systemPauseSeconds: null,
    netSeconds: null,
    idleSeconds: null,
    untrackedSeconds: null,
    rowCount: 1,
  };
}

describe("manager dashboard team competition scope", () => {
  const rows = [
    { teamId: "east", teamName: "East Openers", transfers: 10 },
    { teamId: "west", teamName: "West Openers", transfers: 20 },
  ];

  it("returns only aggregates for currently assigned teams", () => {
    expect(scopeManagerTeamCompetition(rows, ["east"])).toEqual([rows[0]]);
  });

  it("fails closed when a manager has no active assigned team", () => {
    expect(scopeManagerTeamCompetition(rows, [])).toEqual([]);
  });
});

describe("agent overview metrics", () => {
  it("uses the selected period and includes only the signed-in agent's work", () => {
    const outcomeSource: RoleDashboardOutcomeSource = {
      status: "ready",
      timeZone: "Africa/Cairo",
      transferMatches: [
        transfer("agent-1", "2026-08-05T10:00:00Z"),
        transfer("agent-1", "2026-08-06T10:00:00Z"),
        transfer("agent-2", "2026-08-05T10:00:00Z"),
        transfer("agent-1", "2026-07-05T10:00:00Z"),
      ],
      closedRecords: [
        closedDeal("agent-1", "2026-08-05T11:00:00Z"),
        closedDeal("agent-2", "2026-08-05T11:00:00Z"),
        closedDeal("agent-1", "2026-07-05T11:00:00Z"),
      ],
      transferDiagnostics: 0,
      closedDiagnostics: 0,
      fetchedAt: "2026-08-06T12:00:00Z",
      stale: false,
    };

    const overview = buildAgentOverviewMetrics({
      agentId: "agent-1",
      outcomeSource,
      range: {
        key: "custom",
        label: "Custom Date",
        from: "2026-08-01",
        to: "2026-08-31",
        comparison: {
          from: "2026-07-01",
          to: "2026-07-31",
          label: "previous period",
        },
      },
      dialer: {
        totals: totals(42, 7_200),
        comparison: {
          hasData: true,
          label: "previous period",
          totals: totals(21, 3_600),
        },
      },
    });

    expect(overview).toMatchObject({
      transfers: { status: "ready", value: 2 },
      closedDeals: { status: "ready", value: 1 },
      conversion: 50,
      activity: { calls: 42, loggedInSeconds: 7_200 },
      comparison: {
        label: "previous period",
        transfers: { status: "ready", value: 1 },
        closedDeals: { status: "ready", value: 1 },
        conversion: 100,
        activity: { calls: 21, loggedInSeconds: 3_600 },
      },
    });
  });
});
