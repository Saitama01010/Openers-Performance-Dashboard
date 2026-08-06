import { describe, expect, it } from "vitest";

import {
  employmentTenureDays,
  evaluateLowPerformance,
  resolveTenureThreshold,
  type TenureThreshold,
} from "@/dashboard/low-performance";

const threshold: TenureThreshold = {
  id: "post-ramp",
  teamId: null,
  bandLabel: "Post-ramp",
  minimumDays: 30,
  maximumDays: null,
  isRamp: false,
  minimumTransfers: 8,
  minimumClosedDeals: 2,
  minimumConversion: 20,
  minimumShiftCoverage: null,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

describe("tenure-aware low performance", () => {
  it("uses employment start date and returns unknown without one", () => {
    expect(employmentTenureDays("2026-01-01", "2026-02-01")).toBe(31);
    expect(employmentTenureDays(null, "2026-02-01")).toBeNull();
  });

  it("resolves ramp and post-ramp bands independently of team membership dates", () => {
    const ramp = { ...threshold, id: "ramp", bandLabel: "Ramp", minimumDays: 0, maximumDays: 29, isRamp: true };
    expect(resolveTenureThreshold([ramp, threshold], { tenureDays: 10, date: "2026-08-01" })?.id).toBe("ramp");
    expect(resolveTenureThreshold([ramp, threshold], { tenureDays: 50, date: "2026-08-01" })?.id).toBe("post-ramp");
  });

  it("returns structured reasons", () => {
    expect(evaluateLowPerformance({
      threshold,
      sourceAvailable: true,
      periodComplete: true,
      period: "today",
      metrics: { transfers: 4, closedDeals: 1, conversion: 25, shiftCoverage: null },
    })).toMatchObject({
      status: "ready",
      isLowPerformer: true,
      reasons: [
        { metric: "transfers", actual: 4, threshold: 8 },
        { metric: "closed_deals", actual: 1, threshold: 2 },
      ],
    });
  });

  it("does not create a low-performance result from missing source or settings", () => {
    const metrics = { transfers: null, closedDeals: null, conversion: null, shiftCoverage: null };
    expect(evaluateLowPerformance({ threshold, sourceAvailable: false, periodComplete: true, period: "today", metrics }).status).toBe("unavailable");
    expect(evaluateLowPerformance({ threshold: null, sourceAvailable: true, periodComplete: true, period: "today", metrics }).status).toBe("not_configured");
  });
});
