import { describe, expect, it } from "vitest";

import {
  auditActionLabel,
  fieldLabel,
  humanizeIdentifier,
  importStatusLabel,
  importTypeLabel,
  matchingStatusLabel,
  metricLabel,
  roleLabel,
} from "@/presentation/labels";

describe("presentation labels", () => {
  it("humanizes internal identifiers in sentence case", () => {
    expect(humanizeIdentifier("ready_to_publish")).toBe("Ready to publish");
    expect(humanizeIdentifier("accountStatus")).toBe("Account status");
  });

  it("uses product language for roles, imports, and matching states", () => {
    expect(roleLabel("manager")).toBe("Team manager");
    expect(importTypeLabel("agent_hours_performance")).toBe("Agent activity");
    expect(importStatusLabel("validation_failed")).toBe("Validation failed");
    expect(matchingStatusLabel("unmapped")).toBe("Unmatched");
    expect(matchingStatusLabel("out_of_scope")).toBe("Outside your view");
  });

  it("centralizes metric, field, and audit action wording", () => {
    expect(metricLabel("logged_in_hours")).toBe("Logged-in hours");
    expect(fieldLabel("teamId")).toBe("Team");
    expect(auditActionLabel("user.team_moved")).toBe(
      "Team membership changed",
    );
  });
});
