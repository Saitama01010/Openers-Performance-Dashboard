import type { TeamPerformanceRow } from "@/teams/performance-analytics";

function safeCell(value: string | number | null) {
  if (value === null) return "Unavailable";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function teamPerformanceCsv(rows: readonly TeamPerformanceRow[]) {
  const header = [
    "Team ID",
    "Team",
    "Health",
    "Active Agents",
    "Agents With Dialer Data",
    "Transfers",
    "Closed Deals",
    "Conversion %",
    "Average Logged-in Seconds",
    "Average Talk %",
    "Target Metric",
    "Target Value",
  ];
  const body = rows.map((row) => [
    row.teamId,
    row.teamName,
    row.healthLabel,
    row.activeAgents,
    row.agentsWithDialerData,
    row.transfers,
    row.closedDeals,
    row.conversion === null ? null : row.conversion.toFixed(2),
    row.averageLoggedInSeconds === null ? null : Math.round(row.averageLoggedInSeconds),
    row.averageTalkPercentage === null ? null : row.averageTalkPercentage.toFixed(2),
    row.targetMetric,
    row.targetValue,
  ]);
  return [header, ...body].map((row) => row.map(safeCell).join(",")).join("\r\n");
}
