import { describe, expect, it } from "vitest";

import { resolveOverviewDateRange } from "@/dashboard/date-range";

const NOW = new Date("2026-08-04T12:00:00.000Z");

describe("dashboard date ranges", () => {
  it("keeps Today on the active operating date before 06:00 Cairo", () => {
    expect(
      resolveOverviewDateRange(
        { range: "today" },
        new Date("2026-08-03T22:30:00.000Z"),
        "Africa/Cairo",
      ),
    ).toMatchObject({ from: "2026-08-03", to: "2026-08-03" });
  });

  it("rolls Today forward at the 06:00 Cairo operating boundary", () => {
    expect(
      resolveOverviewDateRange(
        { range: "today" },
        new Date("2026-08-04T03:00:00.000Z"),
        "Africa/Cairo",
      ),
    ).toMatchObject({ from: "2026-08-04", to: "2026-08-04" });
  });

  it("resolves This Month through today", () => {
    expect(resolveOverviewDateRange({}, NOW)).toMatchObject({
      key: "this-month",
      from: "2026-08-01",
      to: "2026-08-04",
    });
  });

  it("resolves Last Month to the complete previous calendar month", () => {
    expect(resolveOverviewDateRange({ range: "last-month" }, NOW)).toEqual({
      key: "last-month",
      label: "Last Month",
      from: "2026-07-01",
      to: "2026-07-31",
      comparison: {
        from: "2026-06-01",
        to: "2026-06-30",
        label: "prior month",
      },
    });
  });

  it("removes date restrictions for All Time", () => {
    expect(resolveOverviewDateRange({ range: "all-time" }, NOW)).toEqual({
      key: "all-time",
      label: "All Time",
      comparison: null,
    });
  });

  it("accepts a custom same-day July 28 selection", () => {
    expect(
      resolveOverviewDateRange(
        { range: "custom", from: "2026-07-28", to: "2026-07-28" },
        NOW,
      ),
    ).toMatchObject({
      key: "custom",
      from: "2026-07-28",
      to: "2026-07-28",
      comparison: { from: "2026-07-27", to: "2026-07-27" },
    });
  });

  it("accepts a custom multi-day range outside the current week", () => {
    expect(
      resolveOverviewDateRange(
        { range: "custom", from: "2026-07-01", to: "2026-07-28" },
        NOW,
      ),
    ).toMatchObject({ from: "2026-07-01", to: "2026-07-28" });
  });

  it("rejects invalid custom ranges", () => {
    expect(() =>
      resolveOverviewDateRange(
        { range: "custom", from: "2026-07-29", to: "2026-07-28" },
        NOW,
      ),
    ).toThrow("end date cannot be before");
  });
});
