import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { scopeManagerTeamCompetition } from "@/dashboard/role-data";

describe("manager dashboard team competition scope", () => {
  const rows = [
    { teamId: "east", teamName: "East Openers", transfers: 10 },
    { teamId: "west", teamName: "West Openers", transfers: 20 },
  ];

  it("returns only aggregates for currently assigned teams", () => {
    expect(scopeManagerTeamCompetition(rows, ["east"])).toEqual([rows[0]]);
  });

  it("fails closed when a manager has no active assigned team", () => {
    expect(scopeManagerTeamCompetition(rows, [])).toEqual([]);
  });
});
