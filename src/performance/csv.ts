import type { PerformancePageData } from "@/performance/data";

function csvCell(value: string | number | null) {
  if (value === null) return "Unavailable";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function performancePageCsv(data: PerformancePageData) {
  const header = [
    "Date",
    "Range End",
    "Transfers",
    "Closed Deals",
    "Logged-in Seconds",
    "Closed Deal Rate",
    "Source Rows",
  ];
  const rows = data.series.map((row) => [
    row.rangeStart,
    row.rangeEnd,
    row.transfers,
    row.closedDeals,
    row.loggedInSeconds,
    row.closedDealRate,
    row.sourceRows,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
