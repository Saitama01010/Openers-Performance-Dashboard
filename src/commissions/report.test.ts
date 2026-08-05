import { describe, expect, it } from "vitest";

import { resolveCommissionMonth } from "@/commissions/month";
import { buildCommissionReport, type CommissionEmployee } from "@/commissions/report";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

const month = resolveCommissionMonth("2026-08", new Date("2026-08-15T00:00:00Z"), "Africa/Cairo");
const employees: CommissionEmployee[] = [
  { id: "active", realName: "Active Agent", americanName: "Active", email: "active@example.com", active: true, team: { id: "east", name: "East" } },
  { id: "inactive-final", realName: "Final Agent", americanName: "Final", email: "final@example.com", active: false, team: { id: "east", name: "East" } },
  { id: "inactive-later", realName: "Later Agent", americanName: "Later", email: "later@example.com", active: false, team: { id: "west", name: "West" } },
  { id: "inactive-none", realName: "No Deals", americanName: "None", email: null, active: false, team: null },
];

function deal(id: string, timestamp: string, status: NormalizedClosedDeal["matchStatus"] = "matched"): NormalizedClosedDeal {
  return {
    sourceRowNumber: 2,
    timestamp: new Date(timestamp),
    timestampIso: timestamp,
    closer: "",
    customerName: "",
    fileNumber: "",
    debtAmount: "",
    readyForSubmission: "",
    sheetOpener: id,
    extractedAmericanName: id,
    normalizedAmericanName: id,
    matchedUserId: status === "matched" ? id : null,
    matchStatus: status,
    validationErrors: [],
  };
}

describe("authorized commission report", () => {
  it("includes active zero-deal employees and inactive employees only in their final valid deal month", () => {
    const report = buildCommissionReport({
      role: "admin",
      month,
      timeZone: "Africa/Cairo",
      employees,
      teams: [{ id: "east", name: "East" }, { id: "west", name: "West" }],
      deals: [
        ...Array.from({ length: 11 }, () => deal("inactive-final", "2026-08-10T10:00:00Z")),
        deal("inactive-final", "2026-07-10T10:00:00Z"),
        deal("inactive-later", "2026-08-10T10:00:00Z"),
        deal("inactive-later", "2026-09-10T10:00:00Z"),
        deal("inactive-none", "2026-08-10T10:00:00Z", "invalid"),
      ],
    });

    expect(report.rows.map((row) => row.id)).toEqual(["active", "inactive-final"]);
    expect(report.rows.find((row) => row.id === "active")).toMatchObject({
      closedDeals: 0,
      commissionAmount: 0,
      totalCompensation: 14_000,
    });
    expect(report.rows.find((row) => row.id === "inactive-final")).toMatchObject({
      closedDeals: 11,
      commissionAmount: 4_400,
    });
    expect(report.summary).toMatchObject({ totalEmployees: 2, totalClosedDeals: 11, totalCommission: 4_400 });
  });

  it("applies a team filter to rows and totals", () => {
    const report = buildCommissionReport({
      role: "admin",
      month,
      timeZone: "Africa/Cairo",
      employees,
      teams: [],
      selectedTeamId: "east",
      deals: [],
    });
    expect(report.rows.map((row) => row.id)).toEqual(["active"]);
    expect(report.summary?.totalEmployees).toBe(1);
  });

  it("never exposes an aggregate summary to agents", () => {
    const report = buildCommissionReport({ role: "agent", month, timeZone: "Africa/Cairo", employees: [employees[0]], teams: [], deals: [] });
    expect(report.summary).toBeNull();
  });
});
