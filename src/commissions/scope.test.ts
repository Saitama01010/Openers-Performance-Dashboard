import { describe, expect, it } from "vitest";

import {
  assertCommissionTeamFilter,
  canExportCommissions,
} from "@/commissions/authorization";

describe("commission request scope", () => {
  it("rejects agent team filters and export", () => {
    const actor = { id: "agent", role: "agent" as const, teamIds: ["east"] };
    expect(() => assertCommissionTeamFilter(actor, "east")).toThrow("Forbidden");
    expect(canExportCommissions(actor)).toBe(false);
  });

  it("allows only a manager's assigned teams", () => {
    const actor = { id: "manager", role: "manager" as const, teamIds: ["east"] };
    expect(() => assertCommissionTeamFilter(actor, "east")).not.toThrow();
    expect(() => assertCommissionTeamFilter(actor, "west")).toThrow("Forbidden");
    expect(canExportCommissions(actor)).toBe(true);
  });

  it("allows an admin team filter while database validation remains authoritative", () => {
    const actor = { id: "admin", role: "admin" as const, teamIds: [] };
    expect(() => assertCommissionTeamFilter(actor, "east")).not.toThrow();
    expect(canExportCommissions(actor)).toBe(true);
  });
});
