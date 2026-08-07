import type { AgentDirectoryRow } from "@/agents/directory-analytics";

function safeCell(value: string | number | null) {
  if (value === null) return "Unavailable";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function agentDirectoryCsv(rows: readonly AgentDirectoryRow[]) {
  const header = [
    "Real Name",
    "American Name",
    "Team",
    "Account Status",
    "Active Data",
    "Logged-in Seconds",
    "Talk Seconds",
    "Talk %",
    "Transfers",
    "Closed Deals",
    "Conversion %",
  ];
  const body = rows.map((row) => [
    row.realName,
    row.americanName,
    row.teamName,
    row.accountStatus,
    row.hasMetrics ? "Included" : "Unavailable",
    row.loggedInSeconds,
    row.talkSeconds,
    row.talkPercentage === null ? null : row.talkPercentage.toFixed(2),
    row.transfers,
    row.closedDeals,
    row.conversion === null ? null : row.conversion.toFixed(2),
  ]);
  return [header, ...body].map((row) => row.map(safeCell).join(",")).join("\r\n");
}
