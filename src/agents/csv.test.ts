import { describe, expect, it } from "vitest";

import { agentDirectoryCsv } from "@/agents/csv";
import type { AgentDirectoryRow } from "@/agents/directory-analytics";

describe("agent directory CSV", () => {
  it("preserves unavailable values and neutralizes spreadsheet formulas", () => {
    const row = {
      profileId: "agent-1",
      realName: "=Formula",
      americanName: null,
      teamId: null,
      teamIds: [],
      teamName: "No team",
      accountStatus: "active",
      hasMetrics: false,
      loggedInSeconds: null,
      talkSeconds: null,
      talkPercentage: null,
      transfers: null,
      closedDeals: null,
      conversion: null,
      comparison: null,
      trend: [],
    } satisfies AgentDirectoryRow;
    const csv = agentDirectoryCsv([row]);
    expect(csv).toContain("'=Formula");
    expect(csv).toContain("Unavailable");
    expect(csv).not.toContain(",0,0,0,");
  });
});
