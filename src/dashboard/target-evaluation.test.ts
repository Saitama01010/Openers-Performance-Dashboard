import { describe, expect, it } from "vitest";

import {
  conversionPercentage,
  evaluateTarget,
  resolveEffectiveTarget,
} from "@/dashboard/target-evaluation";

describe("effective targets", () => {
  const targets = [
    { id: "old", teamId: null, metric: "transfers" as const, targetValue: 20, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    { id: "company", teamId: null, metric: "transfers" as const, targetValue: 30, effectiveFrom: "2026-07-01", effectiveTo: null },
    { id: "team", teamId: "team-1", metric: "transfers" as const, targetValue: 40, effectiveFrom: "2026-07-01", effectiveTo: null },
  ];

  it("uses historical effective dates and prefers an applicable team override", () => {
    expect(resolveEffectiveTarget(targets, { metric: "transfers", date: "2026-05-01", teamId: "team-1" })?.id).toBe("old");
    expect(resolveEffectiveTarget(targets, { metric: "transfers", date: "2026-08-01", teamId: "team-1" })?.id).toBe("team");
    expect(resolveEffectiveTarget(targets, { metric: "transfers", date: "2026-08-01", teamId: "team-2" })?.id).toBe("company");
  });

  it("keeps missing targets explicitly unconfigured", () => {
    expect(evaluateTarget(8, null)).toEqual({ status: "not_configured", actual: 8 });
  });

  it("calculates progress, remaining values, and zero-denominator conversion safely", () => {
    expect(evaluateTarget(8, 10)).toMatchObject({ status: "tracking", percentage: 80, remaining: 2 });
    expect(conversionPercentage(2, 0)).toBeNull();
    expect(conversionPercentage(2, 8)).toBe(25);
  });
});
