export type TargetMetric = "transfers" | "closed_deals" | "conversion";

export type EffectiveTarget = {
  id: string;
  teamId: string | null;
  metric: TargetMetric;
  targetValue: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function resolveEffectiveTarget(
  targets: readonly EffectiveTarget[],
  input: { metric: TargetMetric; date: string; teamId?: string | null },
) {
  return (
    targets
      .filter(
        (target) =>
          target.metric === input.metric &&
          target.effectiveFrom <= input.date &&
          (!target.effectiveTo || target.effectiveTo >= input.date) &&
          (target.teamId === null || target.teamId === input.teamId),
      )
      .sort(
        (left, right) =>
          Number(right.teamId !== null) - Number(left.teamId !== null) ||
          right.effectiveFrom.localeCompare(left.effectiveFrom) ||
          right.id.localeCompare(left.id),
      )[0] ?? null
  );
}

export type TargetProgress =
  | { status: "not_configured"; actual: number }
  | {
      status: "tracking" | "achieved";
      actual: number;
      target: number;
      percentage: number;
      remaining: number;
    };

export function evaluateTarget(actual: number, target: number | null): TargetProgress {
  if (target === null || !Number.isFinite(target) || target <= 0) {
    return { status: "not_configured", actual };
  }
  const remaining = Math.max(0, target - actual);
  return {
    status: remaining === 0 ? "achieved" : "tracking",
    actual,
    target,
    percentage: (actual / target) * 100,
    remaining,
  };
}

export function conversionPercentage(closedDeals: number, transfers: number) {
  return transfers > 0 ? (closedDeals / transfers) * 100 : null;
}
