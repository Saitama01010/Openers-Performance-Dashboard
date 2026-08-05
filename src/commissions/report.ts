import type { Role } from "@/auth/authorization";
import { calculateCommission, type CommissionResult } from "@/commissions/domain";
import { monthKeyInTimeZone, type CommissionMonth } from "@/commissions/month";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

export type CommissionEmployee = {
  id: string;
  realName: string;
  americanName: string | null;
  email: string | null;
  active: boolean;
  team: { id: string; name: string } | null;
};

export type CommissionRow = CommissionEmployee & CommissionResult;

export type CommissionSummary = {
  totalEmployees: number;
  totalClosedDeals: number;
  totalCommission: number;
  totalBaseSalaries: number;
  totalCompensation: number;
};

export type ReadyCommissionReport = {
  status: "ready";
  month: CommissionMonth;
  role: Role;
  rows: CommissionRow[];
  summary: CommissionSummary | null;
  teams: { id: string; name: string }[];
  selectedTeamId?: string;
  stale: boolean;
};

export function buildCommissionReport(input: {
  role: Role;
  month: CommissionMonth;
  timeZone: string;
  employees: readonly CommissionEmployee[];
  deals: readonly NormalizedClosedDeal[];
  teams: readonly { id: string; name: string }[];
  selectedTeamId?: string;
  stale?: boolean;
}): ReadyCommissionReport {
  const countsByEmployeeMonth = new Map<string, Map<string, number>>();
  const finalMonthByEmployee = new Map<string, string>();
  const employeeIds = new Set(input.employees.map((employee) => employee.id));

  for (const deal of input.deals) {
    if (
      deal.matchStatus !== "matched" ||
      !deal.matchedUserId ||
      !deal.timestamp ||
      !employeeIds.has(deal.matchedUserId)
    ) {
      continue;
    }
    const monthKey = monthKeyInTimeZone(deal.timestamp, input.timeZone);
    const monthlyCounts = countsByEmployeeMonth.get(deal.matchedUserId) ?? new Map<string, number>();
    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) ?? 0) + 1);
    countsByEmployeeMonth.set(deal.matchedUserId, monthlyCounts);
    const latest = finalMonthByEmployee.get(deal.matchedUserId);
    if (!latest || monthKey > latest) finalMonthByEmployee.set(deal.matchedUserId, monthKey);
  }

  const rows = input.employees
    .filter((employee) => {
      if (input.selectedTeamId && employee.team?.id !== input.selectedTeamId) return false;
      return employee.active || finalMonthByEmployee.get(employee.id) === input.month.key;
    })
    .map((employee) => ({
      ...employee,
      ...calculateCommission(
        countsByEmployeeMonth.get(employee.id)?.get(input.month.key) ?? 0,
      ),
    }))
    .sort((left, right) =>
      (left.team?.name ?? "").localeCompare(right.team?.name ?? "") ||
      left.realName.localeCompare(right.realName) ||
      (left.americanName ?? "").localeCompare(right.americanName ?? "") ||
      left.id.localeCompare(right.id),
    );

  const summary = input.role === "agent"
    ? null
    : rows.reduce<CommissionSummary>(
        (total, row) => ({
          totalEmployees: total.totalEmployees + 1,
          totalClosedDeals: total.totalClosedDeals + row.closedDeals,
          totalCommission: total.totalCommission + row.commissionAmount,
          totalBaseSalaries: total.totalBaseSalaries + row.baseSalary,
          totalCompensation: total.totalCompensation + row.totalCompensation,
        }),
        {
          totalEmployees: 0,
          totalClosedDeals: 0,
          totalCommission: 0,
          totalBaseSalaries: 0,
          totalCompensation: 0,
        },
      );

  return {
    status: "ready",
    month: input.month,
    role: input.role,
    rows,
    summary,
    teams: [...input.teams],
    selectedTeamId: input.selectedTeamId,
    stale: input.stale ?? false,
  };
}
