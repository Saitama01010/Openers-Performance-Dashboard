import { describe, expect, it } from "vitest";

import {
  calculatePerformanceFlags,
  classifyTransferFlag,
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
});
