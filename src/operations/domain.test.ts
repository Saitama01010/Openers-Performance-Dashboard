import { describe, expect, it } from "vitest";

import {
  assertManualFlagTransition,
  shadowingDisplayStatus,
} from "@/operations/domain";

describe("performance operation state machines", () => {
  it("validates manual flag transitions", () => {
    expect(() => assertManualFlagTransition("open", "under_review")).not.toThrow();
    expect(() => assertManualFlagTransition("resolved", "open")).toThrow();
  });

  it("derives due and overdue shadowing without mutating history", () => {
    expect(shadowingDisplayStatus({ status: "scheduled", scheduledDate: "2026-08-06", today: "2026-08-06" })).toBe("due");
    expect(shadowingDisplayStatus({ status: "scheduled", scheduledDate: "2026-08-05", today: "2026-08-06" })).toBe("overdue");
  });
});
