import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeDashboardRange,
  resolveDashboardPeriod,
} from "@/dashboard/data";
import { secondsToDuration, toPercentage } from "@/dashboard/format";

describe("dashboard period helpers", () => {
  const now = new Date(2026, 6, 23, 12);

  it("defaults unknown ranges to month-to-date", () => {
    expect(normalizeDashboardRange("unexpected")).toBe("month-to-date");
    expect(resolveDashboardPeriod("month-to-date", { now })).toMatchObject({
      start: "2026-07-01",
      end: "2026-07-23",
    });
  });

  it("resolves previous month across the calendar boundary", () => {
    expect(resolveDashboardPeriod("previous-month", { now })).toMatchObject({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });

  it("uses valid custom ranges and fails safely for invalid ranges", () => {
    expect(
      resolveDashboardPeriod("custom", {
        now,
        from: "2026-07-05",
        to: "2026-07-12",
      }),
    ).toMatchObject({
      key: "custom",
      start: "2026-07-05",
      end: "2026-07-12",
    });

    expect(
      resolveDashboardPeriod("custom", {
        now,
        from: "2026-07-12",
        to: "2026-07-05",
      }),
    ).toMatchObject({
      key: "month-to-date",
      start: "2026-07-01",
      end: "2026-07-23",
    });
  });
});

describe("dashboard formatting helpers", () => {
  it("formats duration and percentage values defensively", () => {
    expect(secondsToDuration(5_520)).toBe("1h 32m");
    expect(secondsToDuration(-10)).toBe("0h 0m");
    expect(toPercentage(900, 3_600)).toBe(25);
    expect(toPercentage(10, 0)).toBe(0);
  });
});
