import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/commissions/page.tsx", "utf8");
const client = readFileSync(
  "src/components/dashboard/commissions/commissions-page-client.tsx",
  "utf8",
);

describe("commissions UI contract", () => {
  it("retains the complete salary report for administrators", () => {
    for (const header of [
      "Real Name",
      "American Name",
      "Email",
      "Team",
      "Closed Deals",
      "Current Tier",
      "EGP per Deal",
      "Commission",
      "Base Salary",
      "Total Compensation",
    ]) {
      expect(client).toContain(header);
    }
    for (const section of [
      "Commission trend (EGP)",
      "Commission by team",
      "Employees by commission tier",
    ]) {
      expect(client).toContain(section);
    }
    expect(page).toContain("buildAdminCommissionAnalytics");
    expect(page).toContain('role: "admin" as const');
  });

  it("creates a distinct personal earnings experience without organization controls", () => {
    expect(page).toContain('if (actor.role === "agent")');
    expect(page).toContain('role: "agent"');
    expect(page).toContain("commissionOnlyRow(report.rows[0])");
    expect(client).toContain("My commission progress");
    expect(client).toContain("My commission trend");
    expect(page).toContain("Your commission record");
    expect(client).toContain('data.role === "agent"');
    expect(client).toContain("exportHref={data.exportHref}");
    expect(client).not.toContain("agentExportHref");
    const agentDashboard = client.slice(client.indexOf("function AgentDashboard"));
    expect(agentDashboard).toContain("Commission Earned");
    expect(agentDashboard).not.toContain("Base Salary");
    expect(agentDashboard).not.toContain("Total Compensation");
  });

  it("uses salary-free DTOs for manager props and salary-visible DTOs for admin props", () => {
    expect(client).toContain("type ManagerCommissionData");
    expect(client).toContain("summary: CommissionOnlySummary");
    expect(client).toContain("table: CommissionTablePage<CommissionOnlyRow>");
    expect(page).toContain("summary: commissionOnlySummary(summary)");
    expect(page).toContain("report.rows.map(commissionOnlyRow)");
    expect(client).toContain('data.role === "admin" && visible("Base Salary")');
  });

  it("keeps source failures truthful and the commission month independent", () => {
    expect(page).toContain("Commission values were not calculated");
    expect(page).toContain("params.commissionMonth");
    expect(page).not.toContain("resolveOverviewDateRange");
    expect(client).toContain('type="month"');
  });

  it("provides keyboard, pointer, touch, and reduced-motion chart contracts", () => {
    expect(client).toContain('event.key === "ArrowLeft"');
    expect(client).toContain('event.key === "Escape"');
    expect(client).toContain("onPointerMove");
    expect(client).toContain("onPointerDown");
    expect(client).toContain('tabIndex={0}');
    const css = readFileSync(
      "src/components/dashboard/commissions/commissions-page.module.css",
      "utf8",
    );
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
