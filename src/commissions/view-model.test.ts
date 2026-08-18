import { describe, expect, it } from "vitest";

import { resolveCommissionMonth } from "@/commissions/month";
import { buildCommissionReport, type CommissionEmployee } from "@/commissions/report";
import {
  buildAdminCommissionAnalytics,
  buildCommissionAnalytics,
  commissionOnlyRow,
  commissionOnlySummary,
  paginateCommissionRows,
  parseCommissionTableQuery,
} from "@/commissions/view-model";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

const employees: CommissionEmployee[] = [
  { id: "a", realName: "Alex Agent", americanName: "Alex", email: "alex@example.com", active: true, team: { id: "east", name: "East" } },
  { id: "b", realName: "Bailey Agent", americanName: "Bailey", email: "bailey@example.com", active: true, team: { id: "west", name: "West" } },
];

function deal(profileId: string, timestamp: string): NormalizedClosedDeal {
  return {
    sourceRowNumber: 2,
    timestamp: new Date(timestamp),
    timestampIso: timestamp,
    closer: "",
    customerName: "",
    fileNumber: "",
    debtAmount: "",
    readyForSubmission: "",
    sheetOpener: profileId,
    extractedAmericanName: profileId,
    normalizedAmericanName: profileId,
    matchedUserId: profileId,
    matchStatus: "matched",
    validationErrors: [],
  };
}

function report(monthKey: string) {
  return buildCommissionReport({
    role: "admin",
    month: resolveCommissionMonth(monthKey, new Date("2026-08-15T00:00:00Z"), "Africa/Cairo"),
    timeZone: "Africa/Cairo",
    employees,
    teams: [{ id: "east", name: "East" }, { id: "west", name: "West" }],
    deals: [
      ...Array.from({ length: 8 }, () => deal("a", "2026-08-10T10:00:00Z")),
      ...Array.from({ length: 11 }, () => deal("b", "2026-08-10T10:00:00Z")),
      ...Array.from({ length: 7 }, () => deal("a", "2026-07-10T10:00:00Z")),
    ],
  });
}

describe("commission dashboard view model", () => {
  it("builds historical, team, and authoritative tier distributions without recalculating rates", () => {
    const july = report("2026-07");
    const august = report("2026-08");
    const analytics = buildCommissionAnalytics(august, [july, august]);

    expect(analytics.trend).toHaveLength(2);
    expect(analytics.previousSummary?.totalClosedDeals).toBe(7);
    expect(analytics.byTeam.map((team) => [team.name, team.closedDeals, team.commission])).toEqual([
      ["West", 11, 4_400],
      ["East", 8, 2_000],
    ]);
    expect(analytics.byTier.find((tier) => tier.label === "8–10")).toMatchObject({
      employees: 1,
      closedDeals: 8,
      commission: 2_000,
    });
    expect(analytics.byTier.find((tier) => tier.label === "11–13")).toMatchObject({
      employees: 1,
      closedDeals: 11,
      commission: 4_400,
    });
  });

  it("searches, sorts, and paginates only the rows supplied by the authorized report", () => {
    const august = report("2026-08");
    const query = parseCommissionTableQuery({
      query: "west",
      sort: "commission",
      direction: "desc",
      page: "99",
      pageSize: "25",
    });
    const page = paginateCommissionRows(august.rows, query);
    expect(page.totalRows).toBe(1);
    expect(page.page).toBe(1);
    expect(page.rows.map((row) => row.id)).toEqual(["b"]);
  });

  it("does not create a comparison when no previous authoritative month is supplied", () => {
    const august = report("2026-08");
    expect(buildCommissionAnalytics(august, [august]).previousSummary).toBeNull();
  });

  it("produces salary-free agent and manager contracts while preserving commission", () => {
    const july = report("2026-07");
    const august = report("2026-08");
    const agent = commissionOnlyRow(august.rows[0]);
    const managerSummary = commissionOnlySummary(august.summary!);
    const managerAnalytics = buildCommissionAnalytics(august, [july, august]);
    const serialized = JSON.stringify({
      agent,
      managerSummary,
      managerAnalytics,
    });

    expect(agent.commissionAmount).toBe(2_000);
    expect(agent).not.toHaveProperty("baseSalary");
    expect(agent).not.toHaveProperty("totalCompensation");
    expect(managerSummary.totalCommission).toBe(6_400);
    expect(managerSummary).not.toHaveProperty("totalBaseSalaries");
    expect(managerSummary).not.toHaveProperty("totalCompensation");
    expect(managerAnalytics.byTeam.map((team) => team.commission)).toEqual([
      4_400,
      2_000,
    ]);
    expect(serialized).not.toMatch(
      /baseSalary|baseSalaries|totalBaseSalaries|totalCompensation/,
    );
  });

  it("preserves every salary and compensation aggregate in the admin contract", () => {
    const july = report("2026-07");
    const august = report("2026-08");
    const analytics = buildAdminCommissionAnalytics(august, [july, august]);

    expect(august.rows[0]).toMatchObject({
      baseSalary: 14_000,
      totalCompensation: 16_000,
    });
    expect(august.summary).toMatchObject({
      totalBaseSalaries: 28_000,
      totalCompensation: 34_400,
    });
    expect(analytics.trend.at(-1)).toMatchObject({
      baseSalaries: 28_000,
      totalCompensation: 34_400,
    });
    expect(analytics.byTeam.map((team) => team.totalCompensation)).toEqual([
      18_400,
      16_000,
    ]);
  });

  it("does not accept salary sort keys for a manager contract", () => {
    expect(parseCommissionTableQuery({ sort: "baseSalary" }).sort).toBe("name");
    expect(
      parseCommissionTableQuery(
        { sort: "baseSalary" },
        { salaryVisible: true },
      ).sort,
    ).toBe("baseSalary");
  });
});
