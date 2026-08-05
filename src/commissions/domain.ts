export const COMMISSION_BASE_SALARY_EGP = 14_000;

export type CommissionTier = {
  label: string;
  minimum: number;
  maximum: number | null;
  ratePerDeal: number;
};

export const COMMISSION_TIERS: readonly CommissionTier[] = [
  { label: "0–7", minimum: 0, maximum: 7, ratePerDeal: 0 },
  { label: "8–10", minimum: 8, maximum: 10, ratePerDeal: 250 },
  { label: "11–13", minimum: 11, maximum: 13, ratePerDeal: 400 },
  { label: "14–18", minimum: 14, maximum: 18, ratePerDeal: 700 },
  { label: "19–24", minimum: 19, maximum: 24, ratePerDeal: 900 },
  { label: "25+", minimum: 25, maximum: null, ratePerDeal: 1_100 },
] as const;

export type CommissionResult = {
  closedDeals: number;
  tierLabel: string;
  tierMinimum: number;
  tierMaximum: number | null;
  ratePerDeal: number;
  commissionAmount: number;
  baseSalary: number;
  totalCompensation: number;
  nextTierMinimum: number | null;
  nextTierRate: number | null;
  dealsUntilNextTier: number | null;
};

export function calculateCommission(closedDeals: number): CommissionResult {
  if (!Number.isSafeInteger(closedDeals) || closedDeals < 0) {
    throw new RangeError("Closed deals must be a non-negative safe integer.");
  }

  const tierIndex = COMMISSION_TIERS.findIndex(
    (tier) =>
      closedDeals >= tier.minimum &&
      (tier.maximum === null || closedDeals <= tier.maximum),
  );
  const tier = COMMISSION_TIERS[tierIndex];
  if (!tier) throw new RangeError("Closed-deal count is outside the supported range.");

  const commissionAmount = closedDeals * tier.ratePerDeal;
  const totalCompensation = COMMISSION_BASE_SALARY_EGP + commissionAmount;
  if (!Number.isSafeInteger(totalCompensation)) {
    throw new RangeError("Closed-deal count is too large for safe integer currency.");
  }

  const nextTier = COMMISSION_TIERS[tierIndex + 1] ?? null;
  return {
    closedDeals,
    tierLabel: tier.label,
    tierMinimum: tier.minimum,
    tierMaximum: tier.maximum,
    ratePerDeal: tier.ratePerDeal,
    commissionAmount,
    baseSalary: COMMISSION_BASE_SALARY_EGP,
    totalCompensation,
    nextTierMinimum: nextTier?.minimum ?? null,
    nextTierRate: nextTier?.ratePerDeal ?? null,
    dealsUntilNextTier: nextTier ? nextTier.minimum - closedDeals : null,
  };
}
