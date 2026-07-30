import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OverviewDateFilter } from "@/components/dashboard/overview-date-filter";

describe("Overview date filter", () => {
  it("offers the required compact presets and native custom date inputs", () => {
    const markup = renderToStaticMarkup(
      <OverviewDateFilter
        range={{
          key: "this-month",
          label: "This Month",
          from: "2026-07-01",
          to: "2026-07-30",
          comparison: {
            from: "2026-06-01",
            to: "2026-06-30",
            label: "previous month to date",
          },
        }}
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
});
