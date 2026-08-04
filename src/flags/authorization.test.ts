import { describe, expect, it } from "vitest";

import {
  canViewAggregateFlagSummary,
  enforceFlagRequestScope,
} from "@/flags/authorization";

const week = { start: "2026-08-03", end: "2026-08-09" };

describe("agent flag request scope", () => {
  it("forces self-only scope and strips team and manager filters", () => {
    expect(
      enforceFlagRequestScope(
        { id: "agent-1", role: "agent", teamIds: ["team-1"] },
        { week, profileId: "agent-1", teamId: "team-2", managerId: "manager-2" },
      ),
    ).toMatchObject({ profileId: "agent-1", teamId: undefined, managerId: undefined });
  });

  it("rejects a request for another profile without revealing existence", () => {
    expect(() =>
      enforceFlagRequestScope(
        { id: "agent-1", role: "agent", teamIds: [] },
        { week, profileId: "agent-2" },
      ),
    ).toThrow("Forbidden");
  });

  it("never exposes aggregate company or team totals to an agent", () => {
    expect(
      canViewAggregateFlagSummary({
        id: "agent-1",
        role: "agent",
        teamIds: ["team-1"],
      }),
    ).toBe(false);
    expect(
      canViewAggregateFlagSummary({
        id: "manager-1",
        role: "manager",
        teamIds: ["team-1"],
      }),
    ).toBe(true);
  });
});
