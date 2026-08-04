import { describe, expect, it } from "vitest";

import {
  coachingMeasurementWindows,
  isPostCoachingWindowComplete,
  resolveWeekWindow,
} from "@/coaching/week";

describe("coaching calendar windows", () => {
  it("uses Monday through Sunday boundaries", () => {
    expect(resolveWeekWindow("2026-08-03")).toEqual({ start: "2026-08-03", end: "2026-08-09" });
    expect(resolveWeekWindow("2026-08-09")).toEqual({ start: "2026-08-03", end: "2026-08-09" });
  });

  it("resolves the week in the application timezone rather than browser local time", () => {
    expect(resolveWeekWindow(undefined, new Date("2026-08-02T22:30:00.000Z"), "Africa/Cairo")).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
  });

  it("builds complete seven-day pre and post windows excluding the coaching date", () => {
    expect(coachingMeasurementWindows("2026-08-10")).toEqual({
      before: { start: "2026-08-03", end: "2026-08-09" },
      after: { start: "2026-08-11", end: "2026-08-17" },
    });
    expect(isPostCoachingWindowComplete("2026-08-10", new Date("2026-08-17T12:00:00Z"), "UTC")).toBe(false);
    expect(isPostCoachingWindowComplete("2026-08-10", new Date("2026-08-18T00:00:00Z"), "UTC")).toBe(true);
  });
});
