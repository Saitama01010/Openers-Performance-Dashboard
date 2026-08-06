import { describe, expect, it } from "vitest";

import { calculateRubricPercentage } from "@/coaching/rubric";

const sections = [{
  id: "quality",
  label: "Quality",
  criteria: [
    { id: "opening", label: "Opening", maximumScore: 5, required: true },
    { id: "discovery", label: "Discovery", maximumScore: 10, required: true },
  ],
}];

describe("coaching rubric scoring", () => {
  it("calculates the overall percentage from configured maximum scores", () => {
    expect(calculateRubricPercentage(sections, [
      { criterionId: "opening", score: 4 },
      { criterionId: "discovery", score: 8 },
    ])).toBe(80);
  });

  it("ignores any client total because only criterion scores are accepted", () => {
    expect(calculateRubricPercentage(sections, [
      { criterionId: "opening", score: 5 },
      { criterionId: "discovery", score: 5 },
    ])).toBeCloseTo(66.67);
  });

  it("rejects missing required and out-of-scale scores", () => {
    expect(() => calculateRubricPercentage(sections, [{ criterionId: "opening", score: 5 }])).toThrow(/required/);
    expect(() => calculateRubricPercentage(sections, [
      { criterionId: "opening", score: 6 },
      { criterionId: "discovery", score: 5 },
    ])).toThrow(/outside/);
  });
});
