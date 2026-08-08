import { describe, expect, it } from "vitest";

import { adminTeamsCsv } from "@/admin/teams-csv";
import type { AdminTeamDirectoryRow } from "@/admin/teams";

describe("admin teams CSV", () => {
  it("exports only approved fields and neutralizes spreadsheet formulas", () => {
    const row: AdminTeamDirectoryRow = {
      id: "team-1",
      name: "=HYPERLINK(\"https://evil.example\")",
      active: true,
      createdAt: new Date("2026-08-08T12:00:00.000Z"),
      updatedAt: new Date("2026-08-08T12:00:00.000Z"),
      memberCount: 2,
      agentCount: 1,
      activeAgentCount: 1,
      managerCount: 1,
      managers: [{ id: "manager-1", name: "+Manager", email: null, accountStatus: "active" }],
    };

    const csv = adminTeamsCsv([row]);

    expect(csv.split("\r\n")[0]).toBe("Team,Status,Manager,Member count,Agent count,Created date");
    expect(csv).toContain("'=");
    expect(csv).toContain("'+Manager");
    expect(csv).not.toContain("team-1");
  });
});
