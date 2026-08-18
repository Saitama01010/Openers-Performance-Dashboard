import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("modern role dashboard contract", () => {
  it("routes manager and agent users through the modern presentation without changing the data boundary", () => {
    const page = source("src/app/dashboard/page.tsx");
    const modern = source("src/components/dashboard/role-dashboard-modern.tsx");

    expect(page).toContain('from "@/components/dashboard/role-dashboard-modern"');
    expect(page).toContain("getCurrentUser()");
    expect(page).toContain("getRoleDashboardData(user");
    expect(modern).toContain('import type { RoleDashboardData }');
    expect(modern).toContain('title="My performance dashboard"');
    expect(modern).toContain('title={data.teamIds.length ? "Team performance dashboard"');
  });

  it("gives each role a visual KPI and diagnostic hierarchy", () => {
    const modern = source("src/components/dashboard/role-dashboard-modern.tsx");

    expect(modern).toContain("className={styles.kpiGrid}");
    expect(modern).toContain('title="Monthly progress"');
    expect(modern).toContain('title="Where I stand"');
    expect(modern).toContain('title="Team pulse"');
    expect(modern).toContain('title="Attention queue"');
    expect(modern).toContain('title="Agent performance"');
  });

  it("keeps agent navigation self-scoped and manager operations team-gated", () => {
    const modern = source("src/components/dashboard/role-dashboard-modern.tsx");
    const agent = modern.slice(
      modern.indexOf("export function AgentRoleDashboard"),
      modern.indexOf("function managerPageHref"),
    );
    const manager = modern.slice(modern.indexOf("export function ManagerRoleDashboard"));

    expect(agent).toContain("This view contains only your private performance records");
    expect(agent).toContain("performanceHref={`/agents/${userId}`}");
    expect(agent).toContain("data.overview.transfers");
    expect(agent).toContain("data.overview.closedDeals");
    expect(agent).toContain("data.overview.conversion");
    expect(agent).toContain("data.overview.activity.loggedInSeconds");
    expect(agent).toContain("data.overview.activity.calls");
    expect(agent).not.toContain("value={<SourceValue metric={data.lastShift.transfers}");
    expect(agent).not.toContain('href="/admin');
    expect(agent).not.toContain('href="/coaching/room"');
    expect(agent).toContain("commission.commissionAmount");
    expect(agent).not.toContain("commission.baseSalary");
    expect(agent).not.toContain("commission.totalCompensation");
    expect(source("src/dashboard/role-data.ts")).toContain(
      "commissionOnlyRow(row)",
    );
    expect(manager).toContain("data.teamIds.length");
    expect(manager).toContain("<ManagerActions data={data} />");
  });

  it("supports responsive layouts and reduced motion", () => {
    const styles = source("src/components/dashboard/role-dashboard.module.css");

    expect(styles).toContain("grid-template-columns: repeat(6, minmax(0, 1fr))");
    expect(styles).toContain("@media (max-width: 64rem)");
    expect(styles).toContain("@media (max-width: 44rem)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
