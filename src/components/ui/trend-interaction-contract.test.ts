import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function section(contents: string, start: string, end: string) {
  return contents.slice(contents.indexOf(start), contents.indexOf(end));
}

describe("trend graph interaction contract", () => {
  it("keeps shared trend values hidden until active inspection and clears interrupted pointers", () => {
    const trend = source("src/components/ui/area-trend.tsx");

    expect(trend).toContain("useState<number | null>(null)");
    expect(trend).toContain("onPointerLeave={interactive ? () => setActiveIndex(null)");
    expect(trend).toContain("onPointerCancel={interactive ? () => setActiveIndex(null)");
    expect(trend).toContain("onLostPointerCapture={interactive ? () => setActiveIndex(null)");
  });

  it("does not initialize or pin custom trend tooltips", () => {
    const flags = section(
      source("src/components/dashboard/flags/flags-page-client.tsx"),
      "function TrendChart(",
      "function TeamRanking(",
    );
    const teamPerformance = section(
      source("src/components/dashboard/team-performance/team-performance-client.tsx"),
      "function TrendChart(",
      "function HealthMix(",
    );
    const commissions = source(
      "src/components/dashboard/commissions/commissions-page-client.tsx",
    );
    const organizationCommissionTrend = section(
      commissions,
      "function DashboardTrend(",
      "function TeamDistribution(",
    );
    const personalCommissionTrend = section(
      commissions,
      "function PersonalTrend(",
      "function TierReference(",
    );
    const performance = section(
      source("src/components/dashboard/performance/performance-page-client.tsx"),
      "function DailyPerformanceChart(",
      "function ProductivityMix(",
    );
    const overview = section(
      source("src/components/dashboard/admin-overview/admin-overview-client.tsx"),
      "function MonthlyTrends(",
      "function DataHealth(",
    );

    for (const chart of [flags, organizationCommissionTrend, personalCommissionTrend]) {
      expect(chart).toContain("setInspecting(false)");
      expect(chart).toContain("onPointerLeave={() => setInspecting(false)}");
      expect(chart).toContain("onPointerCancel={() => setInspecting(false)}");
      expect(chart).not.toContain("setPinned");
    }
    expect(teamPerformance).toContain("useState<number | null>(null)");
    expect(teamPerformance).toContain("onPointerLeave={() => setActive(null)}");
    expect(teamPerformance).toContain("active === null ? null");
    expect(performance).toContain("onPointerLeave={() => onHighlight(null)}");
    expect(performance).toContain("onPointerCancel={() => onHighlight(null)}");
    expect(performance).not.toContain("setPinned");
    expect(overview).toContain("useState<number | null>(null)");
    expect(overview).toContain("onPointerLeave={clearActive}");
    expect(overview).toContain("onPointerCancel={clearActive}");
    expect(overview).toContain("onLostPointerCapture={clearActive}");
    expect(overview).toContain("setActive((current) => current === nearest ? current : nearest)");
    expect(overview).not.toContain("onMouseEnter");
  });

  it("keeps the overlaid Flags date controls from intercepting tab clicks", () => {
    const styles = source("src/components/dashboard/flags/flags-page.module.css");
    const tabs = source("src/components/dashboard/flags/flags-tabs.tsx");

    expect(styles).toContain(".dateRow { display: flex; justify-content: flex-end; margin-top: -66px; min-height: 52px; pointer-events: none; }");
    expect(styles).toContain(".dateRow > * { pointer-events: auto; }");
    expect(tabs).toContain('{ href: "/flags/transfers", label: "Transfer Flags" }');
  });
});
