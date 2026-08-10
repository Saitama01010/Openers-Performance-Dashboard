import type { LeaderboardMetric, LeaderboardPreparedRow } from "@/leaderboard/analytics";

function safeCell(value: string | number | null) {
  if (value === null) return "Unavailable";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function leaderboardCsv(
  rows: readonly LeaderboardPreparedRow[],
  metric: LeaderboardMetric,
  options: { closedMetricsAvailable?: boolean } = {},
) {
  const closedMetricsAvailable = options.closedMetricsAvailable !== false;
  const header = [
    "Rank",
    "Real Name",
    "American Name",
    "Team",
    "Transfers",
    "Closed Deals",
    "Conversion %",
    "Rank Movement",
    "Ranking Metric",
  ];
  const body = rows.map((row) => [
    row.displayRank,
    row.realName,
    row.americanName,
    row.teamName ?? "Unassigned",
    row.transferCount,
    closedMetricsAvailable ? row.closedDeals : null,
    closedMetricsAvailable && row.conversion !== null
      ? row.conversion.toFixed(2)
      : null,
    row.movement,
    metric,
  ]);
  return [header, ...body].map((row) => row.map(safeCell).join(",")).join("\r\n");
}
