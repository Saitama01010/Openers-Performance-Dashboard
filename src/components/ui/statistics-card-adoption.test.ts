import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const metricCardImplementations = [
  "src/app/admin/imports/import-history-workspace.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/import/import-preview-summary.tsx",
  "src/components/admin/admin-audit-workspace.tsx",
  "src/components/admin/admin-teams-workspace.tsx",
  "src/components/admin/user-import-wizard.tsx",
  "src/components/dashboard/admin-overview/admin-overview-client.tsx",
  "src/components/dashboard/agents/agents-page-client.tsx",
  "src/components/dashboard/coaching/coaching-summary-cards.tsx",
  "src/components/dashboard/commissions/commissions-page-client.tsx",
  "src/components/dashboard/flags/flags-page-client.tsx",
  "src/components/dashboard/performance-visuals.tsx",
  "src/components/dashboard/performance/performance-page-client.tsx",
  "src/components/dashboard/role-dashboard-modern.tsx",
  "src/components/dashboard/role-dashboard.tsx",
  "src/components/dashboard/team-performance/team-performance-client.tsx",
  "src/components/leaderboard/leaderboard-view.tsx",
] as const;

const trendBearingCards = [
  "src/components/dashboard/admin-overview/admin-overview-client.tsx",
  "src/components/dashboard/coaching/coaching-summary-cards.tsx",
  "src/components/dashboard/flags/flags-page-client.tsx",
  "src/components/dashboard/performance/performance-page-client.tsx",
  "src/components/leaderboard/leaderboard-view.tsx",
] as const;

describe("statistics card adoption", () => {
  it.each(metricCardImplementations)("uses the shared contrast-aware surface in %s", (path) => {
    const contents = source(path);
    expect(contents).toContain("metric-color-card");
    expect(contents).toContain("metricCardStyle");
    expect(contents).toContain("metric-card-value");
  });

  it.each(trendBearingCards)("keeps a contrast-aware trend in %s", (path) => {
    const contents = source(path);
    expect(contents).toContain("metricCardForeground");
    expect(contents).toContain("metric-card-trend");
  });

  it("defines the shared saturated surface and foreground hooks", () => {
    const styles = source("src/app/globals.css");
    expect(styles).toContain(".metric-color-card");
    expect(styles).toContain("var(--metric-card-background)");
    expect(styles).toContain("var(--metric-card-foreground)");
  });
});
