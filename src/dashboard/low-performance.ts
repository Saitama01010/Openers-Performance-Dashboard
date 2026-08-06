export type TenureThreshold = {
  id: string;
  teamId: string | null;
  bandLabel: string;
  minimumDays: number;
  maximumDays: number | null;
  isRamp: boolean;
  minimumTransfers: number | null;
  minimumClosedDeals: number | null;
  minimumConversion: number | null;
  minimumShiftCoverage: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

function dateAtUtc(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function employmentTenureDays(startDate: string | null, asOf: string) {
  if (!startDate) return null;
  const start = dateAtUtc(startDate);
  const end = dateAtUtc(asOf);
  if (!start || !end || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function resolveTenureThreshold(
  thresholds: readonly TenureThreshold[],
  input: { tenureDays: number; date: string; teamId?: string | null },
) {
  return (
    thresholds
      .filter(
        (threshold) =>
          threshold.minimumDays <= input.tenureDays &&
          (threshold.maximumDays === null || threshold.maximumDays >= input.tenureDays) &&
          threshold.effectiveFrom <= input.date &&
          (!threshold.effectiveTo || threshold.effectiveTo >= input.date) &&
          (threshold.teamId === null || threshold.teamId === input.teamId),
      )
      .sort(
        (left, right) =>
          Number(right.teamId !== null) - Number(left.teamId !== null) ||
          right.minimumDays - left.minimumDays ||
          right.effectiveFrom.localeCompare(left.effectiveFrom),
      )[0] ?? null
  );
}

export type LowPerformanceReason = {
  metric: "transfers" | "closed_deals" | "conversion" | "shift_coverage";
  actual: number;
  threshold: number;
  period: string;
};

export type LowPerformanceEvaluation =
  | { status: "unavailable" | "not_configured"; isLowPerformer: false; reasons: [] }
  | {
      status: "ready";
      isLowPerformer: boolean;
      tenureBand: string;
      isRamp: boolean;
      reasons: LowPerformanceReason[];
    };

export function evaluateLowPerformance(input: {
  threshold: TenureThreshold | null;
  sourceAvailable: boolean;
  periodComplete: boolean;
  period: string;
  metrics: {
    transfers: number | null;
    closedDeals: number | null;
    conversion: number | null;
    shiftCoverage: number | null;
  };
}): LowPerformanceEvaluation {
  if (!input.sourceAvailable || !input.periodComplete) {
    return { status: "unavailable", isLowPerformer: false, reasons: [] };
  }
  if (!input.threshold) {
    return { status: "not_configured", isLowPerformer: false, reasons: [] };
  }
  const checks = [
    ["transfers", input.metrics.transfers, input.threshold.minimumTransfers],
    ["closed_deals", input.metrics.closedDeals, input.threshold.minimumClosedDeals],
    ["conversion", input.metrics.conversion, input.threshold.minimumConversion],
    ["shift_coverage", input.metrics.shiftCoverage, input.threshold.minimumShiftCoverage],
  ] as const;
  const reasons = checks.flatMap(([metric, actual, threshold]) =>
    actual !== null && threshold !== null && actual < threshold
      ? [{ metric, actual, threshold, period: input.period }]
      : [],
  );
  return {
    status: "ready",
    isLowPerformer: reasons.length > 0,
    tenureBand: input.threshold.bandLabel,
    isRamp: input.threshold.isRamp,
    reasons,
  };
}
