function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "Unavailable" : String(value);
  const safeText =
    typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(text)
      ? `'${text}`
      : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export const TEAM_DASHBOARD_CSV_HEADER = [
  "Agent",
  "Team",
  "Employment Start Date",
  "Tenure Band",
  "Tenure Days",
  "Transfers",
  "Closed Deals",
  "Conversion %",
  "Target Progress %",
  "Commission EGP",
  "Shift Coverage %",
  "Weekly Company Rank",
  "Monthly Company Rank",
  "Coaching Pending",
  "Coaching Completed",
  "Rubric Status",
  "QA Pending",
  "Shadowing Pending",
  "Shadowing Status",
  "Active Automatic Flags",
  "Active Manual Flags",
  "Low-Performance Reasons",
] as const;

export function teamDashboardCsv(rows: ReadonlyArray<{
  agentName: string;
  team: { name: string } | null;
  employmentStartDate: string | null;
  tenureBand?: string | null;
  tenureDays: number | null;
  transfers: { value: number | null };
  closedDeals: { value: number | null };
  conversion: number | null;
  targetProgress?: { status: string; percentage?: number } | null;
  commission?: number | null;
  coverage: { status: "incomplete" } | { status: "ready"; percentage: number };
  weeklyRank: number | null;
  monthlyRank: number | null;
  coachingPending: number;
  coachingCompleted?: number;
  rubricStatus?: string;
  qaPending?: number;
  shadowingPending: number;
  shadowingStatus?: string;
  automaticFlags: { triggeredFlags: readonly string[] };
  manualFlagCount: number;
  lowPerformance: { reasons: ReadonlyArray<{ metric: string; actual: number; threshold: number }> };
}>) {
  return [
    TEAM_DASHBOARD_CSV_HEADER.map(csvCell).join(","),
    ...rows.map((row) => [
      row.agentName,
      row.team?.name,
      row.employmentStartDate,
      row.tenureBand,
      row.tenureDays,
      row.transfers.value,
      row.closedDeals.value,
      row.conversion,
      row.targetProgress?.status === "not_configured" ? null : row.targetProgress?.percentage,
      row.commission,
      row.coverage.status === "ready" ? row.coverage.percentage : null,
      row.weeklyRank,
      row.monthlyRank,
      row.coachingPending,
      row.coachingCompleted,
      row.rubricStatus,
      row.qaPending,
      row.shadowingPending,
      row.shadowingStatus,
      row.automaticFlags.triggeredFlags.length,
      row.manualFlagCount,
      row.lowPerformance.reasons.map((reason) => `${reason.metric}: ${reason.actual} < ${reason.threshold}`).join("; "),
    ].map(csvCell).join(",")),
  ].join("\r\n");
}

export const COMPANY_DASHBOARD_CSV_HEADER = [
  "Team",
  "Rank",
  "Active Agents",
  "Transfers",
  "Closed Deals",
  "Conversion %",
  "Target Progress %",
  "Coaching Completion %",
  "Commission",
  "Rubric Completion %",
  "QA Pending",
  "Shadowing Completion %",
  "Active Flags",
  "Past-Ramp Low Performers",
  "Shift Coverage %",
] as const;

export function companyDashboardCsv(rows: ReadonlyArray<{
  teamName: string;
  rank: number;
  activeAgents: number;
  transfers: { value: number | null };
  closedDeals: { value: number | null };
  conversion: number | null;
  targetProgress: { status: string; percentage?: number };
  coachingCompletion: number | null;
  commission?: number | null;
  rubricCompletion?: number | null;
  qaPending?: number;
  shadowingCompletion?: number | null;
  activeFlags?: number;
  lowPastRamp?: number;
  shiftCoverage?: number | null;
}>) {
  return [
    COMPANY_DASHBOARD_CSV_HEADER.map(csvCell).join(","),
    ...rows.map((row) => [
      row.teamName,
      row.rank,
      row.activeAgents,
      row.transfers.value,
      row.closedDeals.value,
      row.conversion,
      row.targetProgress.status === "not_configured" ? null : row.targetProgress.percentage,
      row.coachingCompletion,
      row.commission,
      row.rubricCompletion,
      row.qaPending,
      row.shadowingCompletion,
      row.activeFlags,
      row.lowPastRamp,
      row.shiftCoverage,
    ].map(csvCell).join(",")),
  ].join("\r\n");
}
