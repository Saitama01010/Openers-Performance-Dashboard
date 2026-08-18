import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { CommissionMonthPicker } from "@/app/commissions/commission-month-picker";
import { getCurrentUser } from "@/auth/session";
import { COMMISSION_TIERS } from "@/commissions/domain";
import { getCommissionDashboard } from "@/commissions/service";
import {
  buildAdminCommissionAnalytics,
  buildCommissionAnalytics,
  commissionOnlyRow,
  commissionOnlySummary,
  paginateCommissionRows,
  parseCommissionTableQuery,
} from "@/commissions/view-model";
import {
  type AdminCommissionData,
  type ManagerCommissionData,
  CommissionsPageClient,
  type AgentCommissionData,
} from "@/components/dashboard/commissions/commissions-page-client";
import { PageHeader, StatusBanner } from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function exportHref(month: string, teamId?: string) {
  const params = new URLSearchParams({ commissionMonth: month });
  if (teamId) params.set("team", teamId);
  return `/api/commissions/export?${params.toString()}`;
}

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");

  const params = await searchParams;
  const requestedMonth = first(params.commissionMonth)?.trim() || undefined;
  const teamId = first(params.team)?.trim() || undefined;
  let dashboard;
  try {
    dashboard = await getCommissionDashboard(actor, {
      commissionMonth: requestedMonth,
      teamId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") notFound();
    throw error;
  }

  if (dashboard.status === "source_unavailable") {
    return (
      <DashboardShell user={actor}>
        <section className="dashboard-page feature-view">
          <PageHeader
            actions={<CommissionMonthPicker value={dashboard.month.key} />}
            description={actor.role === "agent"
              ? "Track your personal monthly closed deals and commission tier."
              : actor.role === "manager"
                ? "Monthly commissions from valid matched Closed worksheet deals. Higher tiers apply retroactively to the full month."
                : "Monthly compensation from valid matched Closed worksheet deals. Higher tiers apply retroactively to the full month."}
            eyebrow={actor.role === "admin" ? "Compensation" : "Commissions"}
            title="Commissions"
          />
          <StatusBanner tone="danger">
            <strong>Closed source unavailable.</strong> {dashboard.message} {actor.role === "admin"
              ? "Commission and base-only totals were not calculated."
              : "Commission values were not calculated."}
          </StatusBanner>
        </section>
      </DashboardShell>
    );
  }

  const report = dashboard.report;
  const shared = {
    month: {
      key: report.month.key,
      label: report.month.label,
      isCurrent: report.month.isCurrent,
    },
    stale: report.stale,
    sourceFetchedAt: report.sourceFetchedAt,
    closedGeneratedAt: report.closedGeneratedAt,
    tiers: [...COMMISSION_TIERS],
  };

  if (actor.role === "agent") {
    const analytics = buildCommissionAnalytics(report, dashboard.history);
    const data: AgentCommissionData = {
      ...shared,
      role: "agent",
      scopeLabel: "Your commission record",
      trend: analytics.trend,
      row: report.rows[0] ? commissionOnlyRow(report.rows[0]) : null,
    };
    return <DashboardShell user={actor}><CommissionsPageClient data={data} /></DashboardShell>;
  }

  const summary = report.summary;
  if (!summary) throw new Error("Authorized commission summary is unavailable.");
  const tableQuery = parseCommissionTableQuery({
    query: first(params.query),
    sort: first(params.sort),
    direction: first(params.direction),
    page: first(params.page),
    pageSize: first(params.pageSize),
  }, { salaryVisible: actor.role === "admin" });
  const selectedTeamName = report.selectedTeamId
    ? report.teams.find((team) => team.id === report.selectedTeamId)?.name
    : null;
  const scopeLabel = actor.role === "admin"
    ? selectedTeamName ? `Team — ${selectedTeamName}` : "Department-wide"
    : report.teams.length === 0
      ? "No active team assignments"
      : selectedTeamName
        ? `Assigned team — ${selectedTeamName}`
        : `Assigned teams — ${report.teams.map((team) => team.name).join(", ")}`;
  const common = {
    ...shared,
    scopeLabel,
    teams: report.teams,
    selectedTeamId: report.selectedTeamId,
    showTeamFilter:
      actor.role === "admin" ? report.teams.length > 0 : report.teams.length > 1,
  };
  const data: AdminCommissionData | ManagerCommissionData =
    actor.role === "admin"
      ? (() => {
          const analytics = buildAdminCommissionAnalytics(
            report,
            dashboard.history,
          );
          return {
            ...common,
            role: "admin" as const,
            exportHref: exportHref(report.month.key, report.selectedTeamId),
            summary,
            previousSummary: analytics.previousSummary,
            analytics,
            trend: analytics.trend,
            table: paginateCommissionRows(report.rows, tableQuery),
          };
        })()
      : (() => {
          const analytics = buildCommissionAnalytics(report, dashboard.history);
          return {
            ...common,
            role: "manager" as const,
            summary: commissionOnlySummary(summary),
            previousSummary: analytics.previousSummary,
            analytics,
            trend: analytics.trend,
            table: paginateCommissionRows(
              report.rows.map(commissionOnlyRow),
              tableQuery,
            ),
          };
        })();

  return (
    <DashboardShell user={actor}>
      <CommissionsPageClient data={data} />
    </DashboardShell>
  );
}
