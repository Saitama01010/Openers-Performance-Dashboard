import { describe, expect, it } from "vitest";

import { commissionMonthHref } from "@/app/commissions/commission-month-picker";

describe("commission month navigation", () => {
  it("changes only commissionMonth and preserves unrelated filters", () => {
    expect(
      commissionMonthHref(
        "/commissions",
        "range=custom&from=2026-01-01&team=east&flag=strong",
        "2026-08",
      ),
    ).toBe(
      "/commissions?range=custom&from=2026-01-01&team=east&flag=strong&commissionMonth=2026-08",
    );
  });
});
