import type { CommissionRow } from "@/commissions/report";

export const COMMISSION_CSV_HEADER =
  "Real Name,American Name,Email,Team,Closed Deals,Commission in EGP,Salary in EGP";

function neutralizeFormula(value: string) {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number) {
  const text = typeof value === "number" ? String(value) : neutralizeFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function commissionsCsv(rows: readonly CommissionRow[]) {
  return [
    COMMISSION_CSV_HEADER,
    ...rows.map((row) =>
      [
        row.realName,
        row.americanName ?? "",
        row.email ?? "",
        row.team?.name ?? "",
        row.closedDeals,
        row.commissionAmount,
        row.baseSalary,
      ].map(csvCell).join(","),
    ),
  ].join("\r\n");
}

export function safeCommissionFilename(month: string, teamName?: string | null) {
  const suffix = teamName
    ? `-${teamName.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase("en-US") || "team"}`
    : "";
  return `commissions-${month}${suffix}.csv`;
}
