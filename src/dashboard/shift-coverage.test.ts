import { describe, expect, it } from "vitest";

import {
  calculateShiftCoverage,
  isHourInShift,
  lastCompletedShift,
  previousCompletedShift,
} from "@/dashboard/shift-coverage";

describe("operating shift coverage", () => {
  it("selects the prior completed shift before 06:00 Cairo time", () => {
    expect(lastCompletedShift(new Date("2026-08-06T02:59:00Z"))).toEqual({
      startDate: "2026-08-04",
      startHour: 16,
      endDate: "2026-08-05",
      endHourExclusive: 6,
    });
  });

  it("selects the shift ending today after 06:00 Cairo time", () => {
    expect(lastCompletedShift(new Date("2026-08-06T03:01:00Z"))).toEqual({
      startDate: "2026-08-05",
      startHour: 16,
      endDate: "2026-08-06",
      endHourExclusive: 6,
    });
  });

  it("includes 16:00-05:59 across midnight and excludes surrounding hours", () => {
    const window = lastCompletedShift(new Date("2026-08-06T04:00:00Z"));
    expect(isHourInShift({ metricDate: "2026-08-05", metricHour: 15 }, window)).toBe(false);
    expect(isHourInShift({ metricDate: "2026-08-05", metricHour: 16 }, window)).toBe(true);
    expect(isHourInShift({ metricDate: "2026-08-06", metricHour: 5 }, window)).toBe(true);
    expect(isHourInShift({ metricDate: "2026-08-06", metricHour: 6 }, window)).toBe(false);
    expect(previousCompletedShift(window).endDate).toBe("2026-08-05");
  });

  it("reports incomplete source rather than absence when hourly buckets are missing", () => {
    const window = lastCompletedShift(new Date("2026-08-06T04:00:00Z"));
    expect(calculateShiftCoverage([
      { metricDate: "2026-08-05", metricHour: 16, loggedInSeconds: 0 },
    ], window)).toEqual({ status: "incomplete", recordedHours: 1, expectedHours: 14 });
  });

  it("calculates recorded coverage only from a complete hourly source", () => {
    const window = lastCompletedShift(new Date("2026-08-06T04:00:00Z"));
    const rows = [
      ...Array.from({ length: 8 }, (_, offset) => ({
        metricDate: "2026-08-05",
        metricHour: 16 + offset,
        loggedInSeconds: offset < 6 ? 3600 : 0,
      })),
      ...Array.from({ length: 6 }, (_, hour) => ({
        metricDate: "2026-08-06",
        metricHour: hour,
        loggedInSeconds: hour < 4 ? 3600 : 0,
      })),
    ];
    expect(calculateShiftCoverage(rows, window)).toMatchObject({
      status: "ready",
      recordedHours: 14,
      activeHours: 10,
      percentage: (10 / 14) * 100,
    });
  });
});
