import { describe, expect, it } from "vitest";

import { resolveOverviewDateRange } from "@/dashboard/date-range";

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("Overview date ranges", () => {
  it("defaults to month-to-date with an equivalent previous-month window", () => {
    expect(resolveOverviewDateRange({}, NOW)).toEqual({
      key: "this-month",
      label: "This Month",
      from: "2026-07-01",
      to: "2026-07-30",
      comparison: {
        from: "2026-06-01",
        to: "2026-06-30",
        label: "previous month to date",
      },
    });
  });

  it("builds a full last-month comparison", () => {
    expect(resolveOverviewDateRange({ range: "last-month" }, NOW)).toEqual({
      key: "last-month",
      label: "Last Month",
      from: "2026-06-01",
      to: "2026-06-30",
      comparison: {
        from: "2026-05-01",
        to: "2026-05-31",
        label: "prior month",
      },
    });
  });

  it("compares a custom range with the immediately preceding equal period", () => {
    expect(
      resolveOverviewDateRange(
        {
          range: "custom",
          from: "2026-07-10",
          to: "2026-07-16",
        },
        NOW,
      ),
    ).toEqual({
      key: "custom",
      label: "Custom Date",
      from: "2026-07-10",
      to: "2026-07-16",
      comparison: {
        from: "2026-07-03",
        to: "2026-07-09",
        label: "previous period",
      },
    });
  });

  it("falls back safely when custom dates are invalid", () => {
    const selection = resolveOverviewDateRange(
      {
        range: "custom",
        from: "2026-07-20",
        to: "2026-07-10",
      },
      NOW,
    );

    expect(selection.key).toBe("this-month");
  });
});
