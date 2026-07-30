import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DashboardDateFilter,
  OverviewDateFilter,
} from "@/components/dashboard/overview-date-filter";

const dateRange = {
  key: "this-month" as const,
  label: "This Month",
  from: "2026-07-01",
  to: "2026-07-30",
  comparison: {
    from: "2026-06-01",
    to: "2026-06-30",
    label: "previous month to date",
  },
};

describe("Overview date filter", () => {
  it("offers the required compact presets and native custom date inputs", () => {
    const markup = renderToStaticMarkup(
      <OverviewDateFilter
        range={dateRange}
        showAgentsWithNoData={false}
      />,
    );

    expect(markup).toContain("Today");
    expect(markup).toContain("This Month");
    expect(markup).toContain("Last Month");
    expect(markup).toContain("Custom Date");
    expect(markup.match(/type="date"/g)).toHaveLength(2);
    expect(markup).toContain('aria-current="page"');
  });

  it("reuses the same controls for LeaderBoard and preserves search scope", () => {
    const markup = renderToStaticMarkup(
      <DashboardDateFilter
        ariaLabel="Leaderboard date filter"
        pathname="/leaderboard"
        preservedParams={{ q: "Gia Monroe", teamId: "team-1" }}
        range={dateRange}
      />,
    );

    expect(markup).toContain('aria-label="Leaderboard date filter"');
    expect(markup).toContain(
      "/leaderboard?range=today&amp;q=Gia+Monroe&amp;teamId=team-1",
    );
    expect(markup).toContain('name="q"');
    expect(markup).toContain('name="teamId"');
    expect(markup.match(/type="date"/g)).toHaveLength(2);
  });
});
