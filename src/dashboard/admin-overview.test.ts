import { describe, expect, it } from "vitest";

import {
  aggregateTalentByTenure,
  attentionCategoryCount,
  buildCalendarMonthWindows,
  calculateMetricDelta,
  overallDataHealthStatus,
} from "@/dashboard/admin-overview";

describe("admin overview transformations", () => {
  it("builds six real calendar windows ending at the configured current day", () => {
    expect(buildCalendarMonthWindows("2026-08-06")).toEqual([
      { key: "2026-03", label: "Mar", from: "2026-03-01", to: "2026-03-31" },
      { key: "2026-04", label: "Apr", from: "2026-04-01", to: "2026-04-30" },
      { key: "2026-05", label: "May", from: "2026-05-01", to: "2026-05-31" },
      { key: "2026-06", label: "Jun", from: "2026-06-01", to: "2026-06-30" },
      { key: "2026-07", label: "Jul", from: "2026-07-01", to: "2026-07-31" },
      { key: "2026-08", label: "Aug", from: "2026-08-01", to: "2026-08-06" },
    ]);
  });

  it("keeps unavailable comparisons and zero baselines honest", () => {
    expect(calculateMetricDelta(null, 10)).toBeNull();
    expect(calculateMetricDelta(12, 0)).toEqual({ absolute: 12, percentage: null });
    expect(calculateMetricDelta(15, 10)).toEqual({ absolute: 5, percentage: 50 });
  });

  it("aggregates real tenure into documented buckets", () => {
    const buckets = aggregateTalentByTenure([
      { tenureDays: 20 },
      { tenureDays: 120 },
      { tenureDays: 240 },
      { tenureDays: 500 },
      { tenureDays: null },
    ]);
    expect(buckets.map(({ key, count, percentage }) => ({ key, count, percentage }))).toEqual([
      { key: "new", count: 1, percentage: 20 },
      { key: "developing", count: 1, percentage: 20 },
      { key: "established", count: 1, percentage: 20 },
      { key: "tenured", count: 1, percentage: 20 },
      { key: "unknown", count: 1, percentage: 20 },
    ]);
  });

  it("uses the most severe real data-health state", () => {
    expect(overallDataHealthStatus([])).toBe("healthy");
    expect(overallDataHealthStatus(["healthy", "warning", "partial"])).toBe("partial");
    expect(overallDataHealthStatus(["warning", "unavailable"])).toBe("unavailable");
  });

  it("counts attention categories rather than inventing notifications", () => {
    expect(attentionCategoryCount({ qaPending: 0, shadowingDue: 0, activeFlags: 0, sourceStatus: "healthy" })).toBe(0);
    expect(attentionCategoryCount({ qaPending: 3, shadowingDue: 0, activeFlags: 2, sourceStatus: "partial" })).toBe(3);
  });
});
