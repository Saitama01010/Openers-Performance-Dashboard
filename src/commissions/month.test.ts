import { describe, expect, it } from "vitest";

import {
  currentCommissionMonth,
  monthKeyInTimeZone,
  resolveCommissionMonth,
} from "@/commissions/month";

describe("commission month", () => {
  it("defaults to the current month in the configured timezone", () => {
    const now = new Date("2026-07-31T22:30:00.000Z");
    expect(currentCommissionMonth(now, "Africa/Cairo")).toBe("2026-08");
    expect(resolveCommissionMonth(undefined, now, "Africa/Cairo").key).toBe("2026-08");
  });

  it("uses an inclusive start and exclusive next-month boundary", () => {
    const month = resolveCommissionMonth("2026-08", new Date(), "Africa/Cairo");
    expect(month.start.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(monthKeyInTimeZone(month.start, "Africa/Cairo")).toBe("2026-08");
    expect(monthKeyInTimeZone(new Date(month.end.getTime() - 1), "Africa/Cairo")).toBe("2026-08");
    expect(monthKeyInTimeZone(month.end, "Africa/Cairo")).toBe("2026-09");
  });

  it.each(["2026-00", "2026-13", "2026-8", "not-a-month", "9999-12"])(
    "rejects invalid month %s",
    (value) => expect(() => resolveCommissionMonth(value)).toThrow(RangeError),
  );
});
