import { describe, expect, it } from "vitest";

import {
  closedDealImprovement,
  overallImprovement,
  pauseEfficiencyImprovement,
  unavailableImprovementComponent,
  wrapEfficiencyImprovement,
} from "@/coaching/domain";

describe("overall coaching improvement", () => {
  it("gives every available component equal weight", () => {
    const result = overallImprovement({
      postPeriodComplete: true,
      sourceAvailable: true,
      components: [
        { available: true, before: 1, after: 2, score: 100, label: null },
        { available: true, before: 1, after: 1, score: 0, label: null },
        { available: true, before: 1, after: 0.5, score: 50, label: null },
      ],
    });
    expect(result.rate).toBe(50);
    expect(result.status).toBe("improved");
  });

  it("excludes unavailable components instead of treating them as zero", () => {
    expect(
      overallImprovement({
        postPeriodComplete: true,
        sourceAvailable: true,
        components: [
          { available: true, before: 1, after: 1.2, score: 20, label: null },
          unavailableImprovementComponent(),
        ],
      }).rate,
    ).toBe(20);
  });

  it("clamps component extremes before averaging", () => {
    expect(closedDealImprovement(1, 20).score).toBe(100);
    expect(closedDealImprovement(10, 0).score).toBe(-100);
  });

  it("labels zero-to-positive deals as New activity at 100", () => {
    expect(closedDealImprovement(0, 2)).toMatchObject({
      score: 100,
      label: "New activity",
    });
  });

  it("makes lower wrap and pause rates positive improvements", () => {
    expect(
      wrapEfficiencyImprovement(
        { talkSeconds: 3600, wrapSeconds: 600 },
        { talkSeconds: 3600, wrapSeconds: 300 },
      ).score,
    ).toBe(50);
    expect(
      pauseEfficiencyImprovement(
        { talkSeconds: 3000, wrapSeconds: 300, readySeconds: 300, pausedSeconds: 600 },
        { talkSeconds: 3000, wrapSeconds: 300, readySeconds: 300, pausedSeconds: 300 },
      ).score,
    ).toBe(50);
  });

  it("uses the exact overall status boundaries", () => {
    const status = (score: number) =>
      overallImprovement({
        postPeriodComplete: true,
        sourceAvailable: true,
        components: [{ available: true, before: 1, after: 1, score, label: null }],
      }).status;
    expect(status(10)).toBe("improved");
    expect(status(9.9)).toBe("no_meaningful_change");
    expect(status(-9.9)).toBe("no_meaningful_change");
    expect(status(-10)).toBe("declined");
  });

  it("keeps incomplete windows pending and distinguishes missing data and source failures", () => {
    expect(overallImprovement({ postPeriodComplete: false, sourceAvailable: true, components: [] }).status).toBe("pending");
    expect(overallImprovement({ postPeriodComplete: true, sourceAvailable: true, components: [] }).status).toBe("insufficient_data");
    expect(overallImprovement({ postPeriodComplete: true, sourceAvailable: false, components: [] }).status).toBe("source_unavailable");
  });
});
