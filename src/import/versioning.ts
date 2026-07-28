import type { DialerMetricInput, DurationTotals } from "@/import/dialer";

export type DatasetScope = {
  source: string;
  importType: string;
  reportingDate: string;
  teamId: string | null;
  dialerId: string | null;
};

export type ComparableMetric = DialerMetricInput & {
  sourceAgentName: string;
};

export type MetricTotals = Pick<
  DurationTotals,
  "loggedInSeconds" | "talkSeconds" | "wrapSeconds"
> & {
  calls: number;
};

export type MetricDifference = {
  before: number;
  after: number;
  difference: number;
  percentageDifference: number | null;
};

export type AgentMetricDifference = {
  agentProfileId: string;
  agentName: string;
  calls: MetricDifference;
  loggedInSeconds: MetricDifference;
  talkSeconds: MetricDifference;
  wrapSeconds: MetricDifference;
};

export type ImportComparison = {
  currentAgentCount: number;
  uploadedAgentCount: number;
  matchedAgentCount: number;
  unmatchedAgentCount: number;
  newAgents: string[];
  missingAgents: string[];
  duplicateAgents: string[];
  calls: MetricDifference;
  loggedInSeconds: MetricDifference;
  talkSeconds: MetricDifference;
  wrapSeconds: MetricDifference;
  agents: AgentMetricDifference[];
};

export function datasetScopeKey(scope: DatasetScope) {
  return [
    scope.source,
    scope.importType,
    scope.reportingDate,
    `team:${scope.teamId ?? "company"}`,
    `dialer:${scope.dialerId ?? "default"}`,
  ].join("|");
}
export function scopeForMetric(
  metric: DialerMetricInput,
  importType: string,
  dialerId: string | null,
) {
  return {
    source: metric.source,
    importType,
    reportingDate: metric.metricDate,
    teamId: metric.teamIdSnapshot,
    dialerId,
  } satisfies DatasetScope;
}

export function totalsForMetrics(metrics: ComparableMetric[]) {
  return metrics.reduce<MetricTotals>(
    (totals, metric) => ({
      calls: totals.calls + metric.calls,
      loggedInSeconds: totals.loggedInSeconds + metric.loggedInSeconds,
      talkSeconds: totals.talkSeconds + metric.talkSeconds,
      wrapSeconds: totals.wrapSeconds + metric.wrapSeconds,
    }),
    {
      calls: 0,
      loggedInSeconds: 0,
      talkSeconds: 0,
      wrapSeconds: 0,
    },
  );
}

function difference(before: number, after: number): MetricDifference {
  return {
    before,
    after,
    difference: after - before,
    percentageDifference:
      before === 0 ? null : ((after - before) / Math.abs(before)) * 100,
  };
}

function agentTotals(metrics: ComparableMetric[]) {
  const totals = new Map<
    string,
    MetricTotals & { agentName: string }
  >();

  for (const metric of metrics) {
    const current = totals.get(metric.agentProfileId) ?? {
      agentName: metric.sourceAgentName,
      calls: 0,
      loggedInSeconds: 0,
      talkSeconds: 0,
      wrapSeconds: 0,
    };
    current.calls += metric.calls;
    current.loggedInSeconds += metric.loggedInSeconds;
    current.talkSeconds += metric.talkSeconds;
    current.wrapSeconds += metric.wrapSeconds;
    totals.set(metric.agentProfileId, current);
  }

  return totals;
}

export function compareMetrics(input: {
  current: ComparableMetric[];
  uploaded: ComparableMetric[];
  uploadedAgentCount: number;
  unmatchedAgentCount: number;
  duplicateAgents: string[];
}) {
  const currentTotals = totalsForMetrics(input.current);
  const uploadedTotals = totalsForMetrics(input.uploaded);
  const currentAgents = agentTotals(input.current);
  const uploadedAgents = agentTotals(input.uploaded);
  const allAgentIds = new Set([
    ...currentAgents.keys(),
    ...uploadedAgents.keys(),
  ]);
  const newAgents = Array.from(uploadedAgents.entries())
    .filter(([profileId]) => !currentAgents.has(profileId))
    .map(([, totals]) => totals.agentName)
    .sort();
  const missingAgents = Array.from(currentAgents.entries())
    .filter(([profileId]) => !uploadedAgents.has(profileId))
    .map(([, totals]) => totals.agentName)
    .sort();
  const agents = Array.from(allAgentIds)
    .map((profileId) => {
      const before = currentAgents.get(profileId);
      const after = uploadedAgents.get(profileId);

      return {
        agentProfileId: profileId,
        agentName: after?.agentName ?? before?.agentName ?? profileId,
        calls: difference(before?.calls ?? 0, after?.calls ?? 0),
        loggedInSeconds: difference(
          before?.loggedInSeconds ?? 0,
          after?.loggedInSeconds ?? 0,
        ),
        talkSeconds: difference(
          before?.talkSeconds ?? 0,
          after?.talkSeconds ?? 0,
        ),
        wrapSeconds: difference(
          before?.wrapSeconds ?? 0,
          after?.wrapSeconds ?? 0,
        ),
      } satisfies AgentMetricDifference;
    })
    .sort((left, right) => left.agentName.localeCompare(right.agentName));

  return {
    currentAgentCount: currentAgents.size,
    uploadedAgentCount: input.uploadedAgentCount,
    matchedAgentCount: uploadedAgents.size,
    unmatchedAgentCount: input.unmatchedAgentCount,
    newAgents,
    missingAgents,
    duplicateAgents: [...input.duplicateAgents].sort(),
    calls: difference(currentTotals.calls, uploadedTotals.calls),
    loggedInSeconds: difference(
      currentTotals.loggedInSeconds,
      uploadedTotals.loggedInSeconds,
    ),
    talkSeconds: difference(
      currentTotals.talkSeconds,
      uploadedTotals.talkSeconds,
    ),
    wrapSeconds: difference(
      currentTotals.wrapSeconds,
      uploadedTotals.wrapSeconds,
    ),
    agents,
  } satisfies ImportComparison;
}
