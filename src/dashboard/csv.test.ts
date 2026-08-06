import { describe, expect, it } from "vitest";

import { companyDashboardCsv, teamDashboardCsv } from "@/dashboard/csv";

describe("role dashboard CSV", () => {
  it("exports authorized team rows without private notes", () => {
    const csv = teamDashboardCsv([{
      agentName: "Agent One",
      team: { name: "Team A" },
      employmentStartDate: "2026-01-01",
      tenureBand: "Post-ramp",
      tenureDays: 30,
      transfers: { value: 8 },
      closedDeals: { value: 2 },
      conversion: 25,
      targetProgress: { status: "tracking", percentage: 50 },
      commission: 2500,
      coverage: { status: "ready", percentage: 80 },
      weeklyRank: 3,
      monthlyRank: 4,
      coachingPending: 1,
      coachingCompleted: 2,
      rubricStatus: "published",
      qaPending: 0,
      shadowingPending: 0,
      shadowingStatus: "completed",
      automaticFlags: { triggeredFlags: ["Wrap Time Flag"] },
      manualFlagCount: 1,
      lowPerformance: { reasons: [{ metric: "transfers", actual: 8, threshold: 10 }] },
    }]);
    expect(csv).toContain('"Agent One","Team A","2026-01-01","Post-ramp"');
    expect(csv).toContain('"Target Progress %","Commission EGP"');
    expect(csv).toContain('"transfers: 8 < 10"');
    expect(csv.toLowerCase()).not.toContain("internal notes");
  });

  it("exports aggregate company team rows", () => {
    expect(companyDashboardCsv([{
      teamName: "Team A", rank: 1, activeAgents: 3,
      transfers: { value: 20 }, closedDeals: { value: 5 }, conversion: 25,
      targetProgress: { status: "tracking", percentage: 50 }, coachingCompletion: 80,
    }])).toContain('"Team A","1","3","20","5","25","50","80"');
  });

  it("neutralizes spreadsheet formulas in every user-controlled text field", () => {
    const csv = teamDashboardCsv([{
      agentName: "=HYPERLINK(\"https://example.test\")",
      team: { name: " +SUM(1,1)" },
      employmentStartDate: null,
      tenureDays: null,
      transfers: { value: null },
      closedDeals: { value: null },
      conversion: null,
      coverage: { status: "incomplete" },
      weeklyRank: null,
      monthlyRank: null,
      coachingPending: 0,
      shadowingPending: 0,
      automaticFlags: { triggeredFlags: [] },
      manualFlagCount: 0,
      lowPerformance: { reasons: [] },
    }]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"\' +SUM(1,1)"');
    expect(csv).not.toMatch(/(?:^|,)"[\t\r\n ]*[=+\-@]/m);
  });
});
