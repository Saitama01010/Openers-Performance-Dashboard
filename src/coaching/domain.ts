export const COACHING_CATEGORIES = [
  "performance",
  "adherence",
  "improvement",
] as const;

export type CoachingCategory = (typeof COACHING_CATEGORIES)[number];

export const COACHING_CATEGORY_LABELS: Record<CoachingCategory, string> = {
  performance: "Performance Coaching",
  adherence: "Adherence Coaching",
  improvement: "Improvement Coaching",
};

export const COACHING_NOTE_MAX_LENGTH = 2000;
export const IMPROVED_THRESHOLD = 10;
export const DECLINED_THRESHOLD = -10;
export const MIN_COMPONENT_SCORE = -100;
export const MAX_COMPONENT_SCORE = 100;

export type ImprovementComponent = {
  available: boolean;
  before: number | null;
  after: number | null;
  score: number | null;
  label: string | null;
};

export type OverallImprovementStatus =
  | "improved"
  | "no_meaningful_change"
  | "declined"
  | "pending"
  | "insufficient_data"
  | "source_unavailable";

export const OVERALL_IMPROVEMENT_LABELS: Record<
  OverallImprovementStatus,
  string
> = {
  improved: "Improved",
  no_meaningful_change: "No meaningful change",
  declined: "Declined",
  pending: "Pending",
  insufficient_data: "Insufficient data",
  source_unavailable: "Source unavailable",
};

export function clampComponentScore(score: number) {
  return Math.min(MAX_COMPONENT_SCORE, Math.max(MIN_COMPONENT_SCORE, score));
}

function availableComponent(
  before: number,
  after: number,
  score: number,
  label: string | null = null,
): ImprovementComponent {
  return {
    available: true,
    before,
    after,
    score: clampComponentScore(score),
    label,
  };
}

export function unavailableImprovementComponent(): ImprovementComponent {
  return {
    available: false,
    before: null,
    after: null,
    score: null,
    label: "Unavailable",
  };
}

export function closedDealImprovement(
  beforeDeals: number,
  afterDeals: number,
): ImprovementComponent {
  if (beforeDeals === 0 && afterDeals === 0) {
    return availableComponent(0, 0, 0);
  }
  if (beforeDeals === 0) {
    return availableComponent(0, afterDeals, 100, "New activity");
  }
  return availableComponent(
    beforeDeals,
    afterDeals,
    ((afterDeals - beforeDeals) / beforeDeals) * 100,
  );
}

export function wrapMinutesPerTalkHour(input: {
  talkSeconds: number;
  wrapSeconds: number;
}) {
  return input.talkSeconds > 0
    ? (input.wrapSeconds * 60) / input.talkSeconds
    : null;
}

export function pauseMinutesPerNetHour(input: {
  talkSeconds: number;
  wrapSeconds: number;
  readySeconds: number;
  pausedSeconds: number;
}) {
  const netCountedSeconds =
    input.talkSeconds + input.wrapSeconds + input.readySeconds;
  return netCountedSeconds > 0
    ? (input.pausedSeconds * 60) / netCountedSeconds
    : null;
}

function lowerRateImprovement(
  beforeRate: number | null,
  afterRate: number | null,
): ImprovementComponent {
  if (beforeRate === null || afterRate === null) {
    return unavailableImprovementComponent();
  }
  if (beforeRate === 0 && afterRate === 0) {
    return availableComponent(0, 0, 0);
  }
  if (beforeRate === 0) {
    return availableComponent(0, afterRate, -100);
  }
  return availableComponent(
    beforeRate,
    afterRate,
    ((beforeRate - afterRate) / beforeRate) * 100,
  );
}

export function wrapEfficiencyImprovement(
  before: { talkSeconds: number; wrapSeconds: number },
  after: { talkSeconds: number; wrapSeconds: number },
) {
  return lowerRateImprovement(
    wrapMinutesPerTalkHour(before),
    wrapMinutesPerTalkHour(after),
  );
}

export function pauseEfficiencyImprovement(
  before: {
    talkSeconds: number;
    wrapSeconds: number;
    readySeconds: number;
    pausedSeconds: number;
  },
  after: {
    talkSeconds: number;
    wrapSeconds: number;
    readySeconds: number;
    pausedSeconds: number;
  },
) {
  return lowerRateImprovement(
    pauseMinutesPerNetHour(before),
    pauseMinutesPerNetHour(after),
  );
}

export function overallImprovement(input: {
  components: readonly ImprovementComponent[];
  postPeriodComplete: boolean;
  sourceAvailable: boolean;
}) {
  if (!input.postPeriodComplete) {
    return { rate: null, status: "pending" as const };
  }
  if (!input.sourceAvailable) {
    return { rate: null, status: "source_unavailable" as const };
  }

  const scores = input.components.flatMap((component) =>
    component.available && component.score !== null ? [component.score] : [],
  );
  if (scores.length === 0) {
    return { rate: null, status: "insufficient_data" as const };
  }

  const rate = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const status: OverallImprovementStatus =
    rate >= IMPROVED_THRESHOLD
      ? "improved"
      : rate <= DECLINED_THRESHOLD
        ? "declined"
        : "no_meaningful_change";
  return { rate, status };
}
