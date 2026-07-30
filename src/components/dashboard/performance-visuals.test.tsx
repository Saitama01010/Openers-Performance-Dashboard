import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityStateGrid,
  formatCompactDuration,
  HourlyActivityChart,
  ProductivityMix,
} from "@/components/dashboard/performance-visuals";
import type { DashboardTotals } from "@/dashboard/data";

const totals: DashboardTotals = {
  calls: 20,
  loggedInSeconds: 7200,
  readySeconds: 3600,
  talkSeconds: 1800,
  ringingSeconds: 300,
  wrapSeconds: 600,
  pausedSeconds: 450,
  systemPauseSeconds: null,
  netSeconds: null,
  idleSeconds: 300,
  untrackedSeconds: 150,
  rowCount: 2,
};

describe("performance visuals", () => {
  it("formats compact durations without negative values", () => {
    expect(formatCompactDuration(10_860)).toBe("3h 1m");
    expect(formatCompactDuration(-90)).toBe("0h 0m");
  });

  it("keeps an all-zero hourly series visually and narratively truthful", () => {
    const markup = renderToStaticMarkup(
      <HourlyActivityChart
        rows={[
          {
            calls: 0,
            hour: 8,
            loggedInSeconds: 0,
            rowCount: 1,
            talkSeconds: 0,
          },
        ]}
      />,
    );

    expect(markup).toContain("highest hourly total is 0 calls");
    expect(markup).toContain("height:0%");
    expect(markup).not.toContain("height:4%");
  });

  it("shows accessible direction text for period comparisons", () => {
    const markup = renderToStaticMarkup(
      <ActivityStateGrid
        comparison={{
          hasData: true,
          label: "previous day",
          totals: {
            ...totals,
            readySeconds: 1800,
            talkSeconds: 3600,
          },
        }}
        totals={totals}
      />,
    );

    expect(markup).toContain("↑ Up 100.00% vs previous day");
    expect(markup).toContain("↓ Down 50.00% vs previous day");
  });

  it("renders the Overview donut structure and full-breakdown action", () => {
    const markup = renderToStaticMarkup(
      <ProductivityMix totals={totals} variant="donut" />,
    );

    expect(markup).toContain("productivity-mix__donut");
    expect(markup).toContain("View full breakdown");
    expect(markup).toContain("Recorded activity totals");
  });
});
