import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/commissions/page.tsx", "utf8");
const client = readFileSync(
  "src/components/dashboard/commissions/commissions-page-client.tsx",
  "utf8",
);

describe("commissions UI contract", () => {
  it("renders the complete authorized manager and admin report", () => {
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
  });

  it("creates a distinct personal earnings experience without organization controls", () => {
    expect(page).toContain('if (actor.role === "agent")');
    expect(page).toContain('role: "agent"');
    expect(page).toContain("row: report.rows[0] ?? null");
    expect(client).toContain("My commission progress");
    expect(client).toContain("My commission trend");
    expect(page).toContain("Your commission record");
    expect(client).toContain('data.role === "agent"');
    expect(client).toContain("exportHref={data.exportHref}");
    expect(client).not.toContain("agentExportHref");
  });

  it("keeps source failures truthful and the commission month independent", () => {
    expect(page).toContain("Commission and base-only totals were not calculated");
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
