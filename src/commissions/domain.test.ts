import { describe, expect, it } from "vitest";

import {
  calculateCommission,
  COMMISSION_BASE_SALARY_EGP,
} from "@/commissions/domain";

describe("retroactive monthly commission calculation", () => {
  it.each([
    [0, 0, 0, 14_000],
    [1, 0, 0, 14_000],
    [7, 0, 0, 14_000],
    [8, 250, 2_000, 16_000],
    [10, 250, 2_500, 16_500],
    [11, 400, 4_400, 18_400],
    [13, 400, 5_200, 19_200],
    [14, 700, 9_800, 23_800],
    [18, 700, 12_600, 26_600],
    [19, 900, 17_100, 31_100],
    [20, 900, 18_000, 32_000],
    [24, 900, 21_600, 35_600],
    [25, 1_100, 27_500, 41_500],
    [26, 1_100, 28_600, 42_600],
    [28, 1_100, 30_800, 44_800],
    [250, 1_100, 275_000, 289_000],
  ])(
    "%i deals pays %i EGP per deal and %i EGP commission",
    (deals, rate, commission, total) => {
      expect(calculateCommission(deals)).toMatchObject({
        closedDeals: deals,
        ratePerDeal: rate,
        commissionAmount: commission,
        baseSalary: COMMISSION_BASE_SALARY_EGP,
        totalCompensation: total,
      });
    },
  );

  it("applies every threshold retroactively", () => {
    expect(calculateCommission(10).commissionAmount).toBe(2_500);
    expect(calculateCommission(11).commissionAmount).toBe(4_400);
    expect(calculateCommission(13).commissionAmount).toBe(5_200);
    expect(calculateCommission(14).commissionAmount).toBe(9_800);
    expect(calculateCommission(18).commissionAmount).toBe(12_600);
    expect(calculateCommission(19).commissionAmount).toBe(17_100);
    expect(calculateCommission(24).commissionAmount).toBe(21_600);
    expect(calculateCommission(25).commissionAmount).toBe(27_500);
  });

  it("reports next-tier progress and an uncapped final tier", () => {
    expect(calculateCommission(10)).toMatchObject({
      nextTierMinimum: 11,
      nextTierRate: 400,
      dealsUntilNextTier: 1,
    });
    expect(calculateCommission(28)).toMatchObject({
      tierLabel: "25+",
      tierMaximum: null,
      nextTierMinimum: null,
      nextTierRate: null,
      dealsUntilNextTier: null,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid count %s",
    (value) => expect(() => calculateCommission(value)).toThrow(RangeError),
  );
});
