import { describe, expect, it } from "vitest";

import { leaderboardCsv } from "@/leaderboard/csv";

describe("leaderboard CSV", () => {
  it("exports displayed values and neutralizes spreadsheet formulas", () => {
    const csv = leaderboardCsv([{
      profileId: "1",
      realName: "=unsafe",
      americanName: "Agent, One",
      teamId: "east",
      teamName: "East",
      transferCount: 4,
      closedDeals: 2,
      conversion: 50,
      displayRank: 1,
      movement: null,
      comparison: null,
      trend: [],
    }], "closed-deals");
    expect(csv).toContain("'=unsafe");
    expect(csv).toContain('"Agent, One"');
    expect(csv).toContain("4,2,50.00,Unavailable,closed-deals");
  });
});
