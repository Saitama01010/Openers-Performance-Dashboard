import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { outcomeSnapshot, type RoleDashboardOutcomeSource } from "@/dashboard/outcome-source";
import type { MatchedTransfer } from "@/leaderboard/matching";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

const transfer = (id: string, timestamp: string): MatchedTransfer => ({
  status: "matched",
  transfer: {
    sourceRowId: `Transfers:${id}:${timestamp}`,
    rawTimestamp: timestamp,
    occurredAt: new Date(timestamp),
    sheetRealName: `Real ${id}`,
    sheetAmericanName: `American ${id}`,
    customerName: "Test Customer",
    phoneNumber: "5550000000",
  },
  user: {
    id,
    realName: `Real ${id}`,
    americanName: `American ${id}`,
    teamId: "team-1",
    teamName: "Team One",
  },
});

const closedDeal = (id: string, timestamp: string): NormalizedClosedDeal => ({
  sourceRowNumber: 2,
  timestamp: new Date(timestamp),
  timestampIso: timestamp,
  closer: "Closer",
  customerName: "Test Customer",
  fileNumber: `F-${id}`,
  debtAmount: "1000",
  readyForSubmission: "",
  sheetOpener: `American ${id}`,
  extractedAmericanName: `American ${id}`,
  normalizedAmericanName: `american ${id}`,
  matchedUserId: id,
  matchStatus: "matched",
  validationErrors: [],
});

describe("role dashboard outcome source states", () => {
  it("keeps transfer values available when Closed fails", () => {
    const source: RoleDashboardOutcomeSource = {
      status: "partial",
      message: "Closed unavailable",
      timeZone: "Africa/Cairo",
      transferMatches: [transfer("agent-1", "2026-08-05T14:30:00Z")],
      transferDiagnostics: 0,
      stale: false,
    };
    const snapshot = outcomeSnapshot(source, {
      kind: "date",
      window: { from: "2026-08-05", to: "2026-08-05" },
    });
    expect(snapshot.transfers).toEqual({ status: "ready", value: 1 });
    expect(snapshot.closedDeals).toEqual({ status: "unavailable", value: null });
  });

  it("filters an exact cross-midnight shift without surrounding calendar hours", () => {
    const source: RoleDashboardOutcomeSource = {
      status: "partial",
      message: "Closed unavailable",
      timeZone: "Africa/Cairo",
      transferMatches: [
        transfer("agent-1", "2026-08-05T12:30:00Z"),
        transfer("agent-1", "2026-08-05T14:30:00Z"),
        transfer("agent-1", "2026-08-06T02:30:00Z"),
        transfer("agent-1", "2026-08-06T03:30:00Z"),
      ],
      transferDiagnostics: 0,
      stale: false,
    };
    const snapshot = outcomeSnapshot(source, {
      kind: "shift",
      window: { startDate: "2026-08-05", startHour: 16, endDate: "2026-08-06", endHourExclusive: 6 },
    });
    expect(snapshot.transfers.value).toBe(2);
  });

  it("keeps agent overview transfers and closed deals limited to that agent", () => {
    const source: RoleDashboardOutcomeSource = {
      status: "ready",
      timeZone: "Africa/Cairo",
      transferMatches: [
        transfer("agent-1", "2026-08-05T14:30:00Z"),
        transfer("agent-2", "2026-08-05T14:45:00Z"),
      ],
      closedRecords: [
        closedDeal("agent-1", "2026-08-05T15:00:00Z"),
        closedDeal("agent-2", "2026-08-05T15:15:00Z"),
      ],
      transferDiagnostics: 0,
      closedDiagnostics: 0,
      fetchedAt: "2026-08-05T16:00:00Z",
      stale: false,
    };
    const snapshot = outcomeSnapshot(
      source,
      {
        kind: "date",
        window: { from: "2026-08-05", to: "2026-08-05" },
      },
      new Set(["agent-1"]),
    );

    expect(snapshot.transfers).toEqual({ status: "ready", value: 1 });
    expect(snapshot.closedDeals).toEqual({ status: "ready", value: 1 });
    expect([...snapshot.transferByAgent.keys()]).toEqual(["agent-1"]);
    expect([...snapshot.closedByAgent.keys()]).toEqual(["agent-1"]);
  });
});
