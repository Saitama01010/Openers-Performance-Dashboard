import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/commissions/page.tsx", "utf8");

describe("commissions UI contract", () => {
  it("renders the required manager and admin table columns", () => {
    for (const header of ["Real Name", "American Name", "Email", "Team", "Closed Deals", "Current Tier", "EGP per Deal", "Commission", "Base Salary", "Total Compensation"]) {
      expect(page).toContain(`>${header}<`);
    }
  });

  it("keeps export absent for agents and labels source failure truthfully", () => {
    expect(page).toContain('actor.role !== "agent"');
    expect(page).toContain("Export Commissions");
    expect(page).toContain("Commission and base-only totals were not calculated");
  });

  it("uses the independent commission month and does not bind shared date filters", () => {
    expect(page).toContain("params.commissionMonth");
    expect(page).not.toContain("resolveOverviewDateRange");
  });
});
