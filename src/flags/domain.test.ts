import { describe, expect, it } from "vitest";

import {
  buildTransferFlagRows,
  calculatePerformanceFlags,
  classifyTransferFlag,
  splitTransferFlagWeeks,
  transferFlagFromSource,
} from "@/flags/domain";

describe("performance flags", () => {
  it("does not flag exact thresholds and flags values above them", () => {
    expect(calculatePerformanceFlags({ talkSeconds: 3600, wrapSeconds: 420, readySeconds: 0, pausedSeconds: 0 }).wrapFlag).toBe(false);
    expect(calculatePerformanceFlags({ talkSeconds: 3600, wrapSeconds: 421, readySeconds: 0, pausedSeconds: 0 }).wrapFlag).toBe(true);
    expect(calculatePerformanceFlags({ talkSeconds: 3600, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 480 }).pauseFlag).toBe(false);
    expect(calculatePerformanceFlags({ talkSeconds: 3600, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 481 }).pauseFlag).toBe(true);
  });

  it("defines net counted time as talk plus wrap plus ready", () => {
    expect(calculatePerformanceFlags({ talkSeconds: 10, wrapSeconds: 20, readySeconds: 30, pausedSeconds: 0 }).netCountedSeconds).toBe(60);
  });

  it("keeps zero denominators unavailable and allows both flags", () => {
    expect(calculatePerformanceFlags({ talkSeconds: 0, wrapSeconds: 20, readySeconds: 0, pausedSeconds: 30 })).toMatchObject({ wrapRate: null, pauseRate: 90, wrapFlag: false, pauseFlag: true });
    expect(calculatePerformanceFlags({ talkSeconds: 0, wrapSeconds: 0, readySeconds: 0, pausedSeconds: 30 })).toMatchObject({ wrapRate: null, pauseRate: null, wrapFlag: false, pauseFlag: false });
    expect(calculatePerformanceFlags({ talkSeconds: 60, wrapSeconds: 60, readySeconds: 0, pausedSeconds: 60 }).triggeredFlags).toEqual(["Wrap Time Flag", "Pause Time Flag"]);
  });
});

describe("transfer flags", () => {
  it("uses the exact weekly closed-deal classifications", () => {
    expect(classifyTransferFlag(0)).toBe("strong");
    expect(classifyTransferFlag(1)).toBe("strong");
    expect(classifyTransferFlag(2)).toBe("improvement");
    expect(classifyTransferFlag(3)).toBe("none");
  });

  it("includes a missing matched count as a real zero only when the source is healthy", () => {
    expect(
      transferFlagFromSource({
        sourceAvailable: true,
        matchedClosedDeals: undefined,
      }),
    ).toEqual({ closedDeals: 0, classification: "strong" });
    expect(
      transferFlagFromSource({
        sourceAvailable: false,
        matchedClosedDeals: undefined,
      }),
    ).toEqual({ closedDeals: null, classification: null });
  });

  it("evaluates a one-day selection from Monday through the selected day", () => {
    expect(
      splitTransferFlagWeeks({
        dateRange: { from: "2026-07-28", to: "2026-07-28" },
        availableDealDates: [],
        today: "2026-08-04",
      }),
    ).toEqual([
      { start: "2026-07-27", end: "2026-08-02", through: "2026-07-28" },
    ]);
  });

  it("returns only flagged weekly buckets and can repeat one agent across weeks", () => {
    const weeks = splitTransferFlagWeeks({
      dateRange: { from: "2026-07-28", to: "2026-08-09" },
      availableDealDates: [],
      today: "2026-08-04",
    });
    const rows = buildTransferFlagRows({
      agents: [{ id: "agent-1", name: "Agent One", teamNames: ["East"] }],
      deals: [
        { agentId: "agent-1", date: "2026-07-28" },
        { agentId: "agent-1", date: "2026-08-03" },
        { agentId: "agent-1", date: "2026-08-04" },
      ],
      weeks,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.classification)).toEqual(["strong", "improvement"]);
    expect(rows.map((row) => row.week)).toEqual([
      { start: "2026-07-27", end: "2026-08-02" },
      { start: "2026-08-03", end: "2026-08-09" },
    ]);
  });
});
