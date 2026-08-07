export type OverviewSourceStatus =
  | "healthy"
  | "warning"
  | "partial"
  | "unavailable";

export type CalendarMonthWindow = {
  key: string;
  label: string;
  from: string;
  to: string;
};

export function buildCalendarMonthWindows(
  today: string,
  count = 6,
): CalendarMonthWindow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || count < 1) return [];
  const anchor = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return [];

  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const start = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1),
    );
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
    const isCurrent =
      start.getUTCFullYear() === anchor.getUTCFullYear() &&
      start.getUTCMonth() === anchor.getUTCMonth();

    return {
      key: start.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(start),
      from: start.toISOString().slice(0, 10),
      to: (isCurrent ? anchor : end).toISOString().slice(0, 10),
    };
  });
}

export type MetricDelta = {
  absolute: number;
  percentage: number | null;
};

export function calculateMetricDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): MetricDelta | null {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return null;
  }
  const absolute = current - previous;
  return {
    absolute,
    percentage: previous === 0 ? null : (absolute / Math.abs(previous)) * 100,
  };
}

export type TalentBucket = {
  key: "new" | "developing" | "established" | "tenured" | "unknown";
  label: string;
  description: string;
  count: number;
  percentage: number;
};

const talentDefinitions = [
  { key: "new", label: "0–3 months", description: "Employment tenure under 90 days", min: 0, max: 89 },
  { key: "developing", label: "3–6 months", description: "Employment tenure from 90 to 179 days", min: 90, max: 179 },
  { key: "established", label: "6–12 months", description: "Employment tenure from 180 to 364 days", min: 180, max: 364 },
  { key: "tenured", label: "12+ months", description: "Employment tenure of at least 365 days", min: 365, max: Number.POSITIVE_INFINITY },
] as const;

export function aggregateTalentByTenure(
  agents: readonly { tenureDays: number | null }[],
): TalentBucket[] {
  const counts = new Map<TalentBucket["key"], number>();
  for (const agent of agents) {
    const definition = agent.tenureDays === null
      ? null
      : talentDefinitions.find(
          (candidate) =>
            agent.tenureDays !== null &&
            agent.tenureDays >= candidate.min &&
            agent.tenureDays <= candidate.max,
        );
    const key = definition?.key ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = agents.length;
  const rows: TalentBucket[] = talentDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    count: counts.get(definition.key) ?? 0,
    percentage: total > 0 ? ((counts.get(definition.key) ?? 0) / total) * 100 : 0,
  }));
  const unknown = counts.get("unknown") ?? 0;
  if (unknown > 0) {
    rows.push({
      key: "unknown",
      label: "Start date unavailable",
      description: "No authoritative employment start date is configured",
      count: unknown,
      percentage: total > 0 ? (unknown / total) * 100 : 0,
    });
  }
  return rows;
}

const statusWeight: Record<OverviewSourceStatus, number> = {
  healthy: 0,
  warning: 1,
  partial: 2,
  unavailable: 3,
};

export function overallDataHealthStatus(
  statuses: readonly OverviewSourceStatus[],
): OverviewSourceStatus {
  return statuses.reduce<OverviewSourceStatus>(
    (current, candidate) =>
      statusWeight[candidate] > statusWeight[current] ? candidate : current,
    "healthy",
  );
}

export type AttentionInput = {
  qaPending: number;
  shadowingDue: number;
  activeFlags: number;
  sourceStatus: OverviewSourceStatus;
};

export function attentionCategoryCount(input: AttentionInput) {
  return [
    input.qaPending > 0,
    input.shadowingDue > 0,
    input.activeFlags > 0,
    input.sourceStatus !== "healthy",
  ].filter(Boolean).length;
}
