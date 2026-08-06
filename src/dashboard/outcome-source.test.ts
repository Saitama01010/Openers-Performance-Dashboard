import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { outcomeSnapshot, type RoleDashboardOutcomeSource } from "@/dashboard/outcome-source";
import type { MatchedTransfer } from "@/leaderboard/matching";

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
});
