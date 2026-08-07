import { COMMISSION_TIERS, type CommissionTier } from "@/commissions/domain";
import type {
  CommissionRow,
  CommissionSummary,
  ReadyCommissionReport,
} from "@/commissions/report";

export type CommissionTrendPoint = {
  key: string;
  label: string;
  estimated: boolean;
  employees: number;
  closedDeals: number;
  commission: number;
  baseSalaries: number;
  totalCompensation: number;
  tierLabel: string | null;
  ratePerDeal: number | null;
};

export type TeamCommissionDistribution = {
  id: string;
  name: string;
  employees: number;
  closedDeals: number;
  commission: number;
  totalCompensation: number;
  share: number;
};

export type TierCommissionDistribution = CommissionTier & {
  employees: number;
  employeeShare: number;
  closedDeals: number;
  commission: number;
};

export type CommissionAnalytics = {
  trend: CommissionTrendPoint[];
  byTeam: TeamCommissionDistribution[];
  byTier: TierCommissionDistribution[];
  previousSummary: CommissionSummary | null;
};

export type CommissionSort =
  | "name"
  | "closedDeals"
  | "tier"
  | "commission"
  | "baseSalary"
  | "totalCompensation";

export type CommissionTableQuery = {
  query: string;
  sort: CommissionSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: 10 | 25 | 50;
};

export type CommissionTablePage = CommissionTableQuery & {
  rows: CommissionRow[];
  totalRows: number;
  totalPages: number;
};

function summaryPoint(report: ReadyCommissionReport): CommissionTrendPoint | null {
  if (report.role === "agent") {
    const row = report.rows[0];
    if (!row) return null;
    return {
      key: report.month.key,
      label: report.month.label,
      estimated: report.month.isCurrent,
      employees: 1,
      closedDeals: row.closedDeals,
      commission: row.commissionAmount,
      baseSalaries: row.baseSalary,
      totalCompensation: row.totalCompensation,
      tierLabel: row.tierLabel,
      ratePerDeal: row.ratePerDeal,
    };
  }
  if (!report.summary) return null;
  return {
    key: report.month.key,
    label: report.month.label,
    estimated: report.month.isCurrent,
    employees: report.summary.totalEmployees,
    closedDeals: report.summary.totalClosedDeals,
    commission: report.summary.totalCommission,
    baseSalaries: report.summary.totalBaseSalaries,
    totalCompensation: report.summary.totalCompensation,
    tierLabel: null,
    ratePerDeal: null,
  };
}

export function buildCommissionAnalytics(
  report: ReadyCommissionReport,
  history: readonly ReadyCommissionReport[],
): CommissionAnalytics {
  const totalCommission = report.summary?.totalCommission ?? 0;
  const teamGroups = new Map<string, Omit<TeamCommissionDistribution, "share">>();
  for (const row of report.rows) {
    const id = row.team?.id ?? "unassigned";
    const current = teamGroups.get(id) ?? {
      id,
      name: row.team?.name ?? "Unassigned",
      employees: 0,
      closedDeals: 0,
      commission: 0,
      totalCompensation: 0,
    };
    current.employees += 1;
    current.closedDeals += row.closedDeals;
    current.commission += row.commissionAmount;
    current.totalCompensation += row.totalCompensation;
    teamGroups.set(id, current);
  }

  const byTier = COMMISSION_TIERS.map((tier) => {
    const rows = report.rows.filter((row) => row.tierLabel === tier.label);
    return {
      ...tier,
      employees: rows.length,
      employeeShare: report.rows.length > 0 ? rows.length / report.rows.length : 0,
      closedDeals: rows.reduce((total, row) => total + row.closedDeals, 0),
      commission: rows.reduce((total, row) => total + row.commissionAmount, 0),
    };
  });

  return {
    trend: history.flatMap((item) => {
      const point = summaryPoint(item);
      return point ? [point] : [];
    }),
    byTeam: Array.from(teamGroups.values())
      .map((team) => ({
        ...team,
        share: totalCommission > 0 ? team.commission / totalCommission : 0,
      }))
      .sort((left, right) => right.commission - left.commission || left.name.localeCompare(right.name)),
    byTier,
    previousSummary: history.length > 1
      ? history[history.length - 2]?.summary ?? null
      : null,
  };
}

function safePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseCommissionTableQuery(input: {
  query?: string;
  sort?: string;
  direction?: string;
  page?: string;
  pageSize?: string;
}): CommissionTableQuery {
  const allowedSorts: CommissionSort[] = [
    "name",
    "closedDeals",
    "tier",
    "commission",
    "baseSalary",
    "totalCompensation",
  ];
  const parsedSize = safePositiveInteger(input.pageSize, 10);
  return {
    query: input.query?.trim().slice(0, 120) ?? "",
    sort: allowedSorts.includes(input.sort as CommissionSort)
      ? input.sort as CommissionSort
      : "name",
    direction: input.direction === "desc" ? "desc" : "asc",
    page: safePositiveInteger(input.page, 1),
    pageSize: parsedSize === 25 || parsedSize === 50 ? parsedSize : 10,
  };
}

function sortValue(row: CommissionRow, sort: CommissionSort): string | number {
  if (sort === "name") return row.realName;
  if (sort === "closedDeals") return row.closedDeals;
  if (sort === "tier") return row.tierMinimum;
  if (sort === "commission") return row.commissionAmount;
  if (sort === "baseSalary") return row.baseSalary;
  return row.totalCompensation;
}

export function paginateCommissionRows(
  rows: readonly CommissionRow[],
  query: CommissionTableQuery,
): CommissionTablePage {
  const needle = query.query.toLocaleLowerCase("en-US");
  const filtered = needle
    ? rows.filter((row) =>
        [row.realName, row.americanName, row.email, row.team?.name]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase("en-US").includes(needle)),
      )
    : [...rows];
  filtered.sort((left, right) => {
    const leftValue = sortValue(left, query.sort);
    const rightValue = sortValue(right, query.sort);
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return (query.direction === "desc" ? -comparison : comparison) || left.id.localeCompare(right.id);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  return {
    ...query,
    page,
    rows: filtered.slice(start, start + query.pageSize),
    totalRows: filtered.length,
    totalPages,
  };
}
