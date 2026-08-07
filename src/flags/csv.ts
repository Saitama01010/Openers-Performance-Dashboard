function safeCell(value: string | number | null) {
  if (value === null) return "Unavailable";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Array<string | number | null>>) {
  return rows.map((row) => row.map(safeCell).join(",")).join("\r\n");
}

export function performanceFlagsCsv(rows: ReadonlyArray<{
  agentId: string;
  agentName: string;
  teamNames: string[];
  talkSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  triggeredFlags: readonly string[];
  wrapRate: number | null;
  pauseRate: number | null;
  wrapThreshold: number;
  pauseThreshold: number;
}>) {
  return csv([
    ["Agent ID", "Agent", "Team", "Talk Seconds", "Wrap Seconds", "Pause Seconds", "Triggered Flags", "Wrap Minutes Per Talk Hour", "Wrap Limit", "Pause Minutes Per Net Hour", "Pause Limit", "Severity"],
    ...rows.map((row) => [row.agentId, row.agentName, row.teamNames.join(", ") || "Unassigned", row.talkSeconds, row.wrapSeconds, row.pausedSeconds, row.triggeredFlags.join("; "), row.wrapRate, row.wrapThreshold, row.pauseRate, row.pauseThreshold, "Not configured"]),
  ]);
}

export function transferFlagsCsv(rows: ReadonlyArray<{
  agentId: string;
  agentName: string;
  teamNames: string[];
  closedDeals: number;
  week: { start: string; end: string };
  classification: "strong" | "improvement";
}>) {
  return csv([
    ["Agent ID", "Agent", "Team", "Closed Deals This Week", "Week Start", "Week End", "Flag Type", "Severity"],
    ...rows.map((row) => [row.agentId, row.agentName, row.teamNames.join(", ") || "Unassigned", row.closedDeals, row.week.start, row.week.end, row.classification === "strong" ? "Strong Flag" : "Flag for Improvement", "Not configured"]),
  ]);
}
