import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { COMMISSION_TIERS } from "@/commissions/domain";
import { getCommissionReport } from "@/commissions/service";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  EmptyTableRow,
  PageHeader,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommissionMonthPicker } from "@/app/commissions/commission-month-picker";
import styles from "@/app/commissions/commissions.module.css";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function egp(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} EGP`;
}

function exportHref(month: string, teamId?: string) {
  const params = new URLSearchParams({ commissionMonth: month });
  if (teamId) params.set("team", teamId);
  return `/api/commissions/export?${params.toString()}`;
}

function TierReference({ activeTier }: { activeTier?: string }) {
  return (
    <section className="ui-card">
      <div className="ui-card__header">
        <div>
          <h2 className="ui-card__title">Retroactive tier reference</h2>
          <p className="ui-card__subtitle">
            Reaching a tier applies its rate to every valid closed deal in that month.
          </p>
        </div>
      </div>
      <div className={styles.tierGrid}>
        {COMMISSION_TIERS.map((tier) => (
          <div
            className={`${styles.tierItem} ${activeTier === tier.label ? styles.tierItemActive : ""}`}
            key={tier.label}
          >
            <span>{tier.label} deals</span>
            <strong>{egp(tier.ratePerDeal)} / deal</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const requestedMonth = first(params.commissionMonth)?.trim() || undefined;
  const teamId = first(params.team)?.trim() || undefined;
  let report;
  try {
    report = await getCommissionReport(actor, {
      commissionMonth: requestedMonth,
      teamId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") notFound();
    throw error;
  }

  return (
    <DashboardShell user={actor}>
      <section className={`dashboard-page feature-view ${styles.page}`}>
        <PageHeader
          actions={
            <div className={styles.controls}>
              <CommissionMonthPicker value={report.month.key} />
              {actor.role !== "agent" && report.status === "ready" ? (
                report.stale ? (
                  <button
                    className="ui-button ui-button--primary"
                    disabled
                    title="Export is unavailable until the Closed source refreshes successfully."
                    type="button"
                  >
                    <DashboardIcon name="commissions" />
                    Export Commissions
                  </button>
                ) : (
                  <Link
                    className="ui-button ui-button--primary"
                    href={exportHref(report.month.key, report.selectedTeamId)}
                  >
                    <DashboardIcon name="commissions" />
                    Export Commissions
                  </Link>
                )
              ) : null}
            </div>
          }
          description="Monthly compensation from valid matched Closed worksheet deals. Higher tiers apply retroactively to the full month."
          eyebrow="Compensation"
          title="Commissions"
        />

        {report.status === "source_unavailable" ? (
          <StatusBanner tone="danger">
            <strong>Closed source unavailable.</strong> {report.message} Commission and base-only totals were not calculated.
          </StatusBanner>
        ) : (
          <>
            <p className={styles.scopeLine}>
              <strong>Scope:</strong>{" "}
              {actor.role === "agent"
                ? "Your commission record"
                : actor.role === "manager"
                  ? report.teams.length > 0
                    ? `Assigned teams — ${report.teams.map((team) => team.name).join(", ")}`
                    : "No active team assignments"
                  : report.selectedTeamId
                    ? `Team — ${report.teams.find((team) => team.id === report.selectedTeamId)?.name ?? "Selected team"}`
                    : "Department-wide"}
            </p>
            {report.stale ? (
              <StatusBanner tone="warning">
                The latest source refresh failed. This report uses the last successfully loaded Closed data, and export is disabled until recovery.
              </StatusBanner>
            ) : null}
            {report.month.isCurrent ? (
              <StatusBanner tone="info">
                {report.month.label} is still in progress. Values are estimated through the latest successful source refresh.
              </StatusBanner>
            ) : null}

            {actor.role === "agent" ? (
              <>
                {report.rows[0] ? (
                  <dl className={styles.personalGrid}>
                    <div className={styles.personalMetric}><dt>Closed deals</dt><dd>{report.rows[0].closedDeals}</dd><p>{report.month.label}</p></div>
                    <div className={styles.personalMetric}><dt>Current tier</dt><dd>{report.rows[0].tierLabel}</dd><p>{egp(report.rows[0].ratePerDeal)} per deal</p></div>
                    <div className={styles.personalMetric}><dt>Commission earned</dt><dd>{egp(report.rows[0].commissionAmount)}</dd><p>Excludes base salary</p></div>
                    <div className={styles.personalMetric}><dt>Base salary</dt><dd>{egp(report.rows[0].baseSalary)}</dd><p>Monthly floor</p></div>
                    <div className={styles.personalMetric}><dt>Total compensation</dt><dd>{egp(report.rows[0].totalCompensation)}</dd><p>Base plus commission</p></div>
                    <div className={styles.personalMetric}>
                      <dt>{report.rows[0].nextTierRate === null ? "Uncapped rate" : "Next tier"}</dt>
                      <dd>{report.rows[0].dealsUntilNextTier ?? "Uncapped"}</dd>
                      <p>{report.rows[0].nextTierRate === null ? "1,100 EGP continues for every additional deal" : `${report.rows[0].dealsUntilNextTier} deal${report.rows[0].dealsUntilNextTier === 1 ? "" : "s"} to ${egp(report.rows[0].nextTierRate)} per deal`}</p>
                    </div>
                  </dl>
                ) : (
                  <StatusBanner tone="info">No commission record is available for this month.</StatusBanner>
                )}
                <TierReference activeTier={report.rows[0]?.tierLabel} />
              </>
            ) : (
              <>
                {actor.role === "admin" ? (
                  <DashboardFilterToolbar
                    ariaLabel="Commission filters"
                    filters={[{
                      label: "Team",
                      name: "team",
                      value: report.selectedTeamId,
                      options: [
                        { label: "All teams", value: "" },
                        ...report.teams.map((team) => ({ label: team.name, value: team.id })),
                      ],
                    }]}
                  />
                ) : null}
                {report.summary ? (
                  <dl className="feature-summary">
                    <div><dt>Total employees</dt><dd>{report.summary.totalEmployees}</dd></div>
                    <div><dt>Total closed deals</dt><dd>{report.summary.totalClosedDeals}</dd></div>
                    <div><dt>Total commission</dt><dd>{egp(report.summary.totalCommission)}</dd></div>
                    <div><dt>Total base salaries</dt><dd>{egp(report.summary.totalBaseSalaries)}</dd></div>
                    <div><dt>Total compensation</dt><dd>{egp(report.summary.totalCompensation)}</dd></div>
                  </dl>
                ) : null}
                <section className="ui-card">
                  <div className="ui-card__header">
                    <div><h2 className="ui-card__title">{report.month.label} commission report</h2><p className="ui-card__subtitle">One row per employee inside your authorized scope.</p></div>
                  </div>
                  <TableScroll label="Commission results">
                    <table className="ui-table">
                      <caption>Role-scoped monthly commissions</caption>
                      <thead><tr><th scope="col">Real Name</th><th scope="col">American Name</th><th scope="col">Email</th><th scope="col">Team</th><th scope="col">Closed Deals</th><th scope="col">Current Tier</th><th scope="col">EGP per Deal</th><th scope="col">Commission</th><th scope="col">Base Salary</th><th scope="col">Total Compensation</th></tr></thead>
                      <tbody>
                        {report.rows.length === 0 ? (
                          <EmptyTableRow colSpan={10} title="No employees in scope" description="No employee is visible for this commission month and authorized scope." />
                        ) : report.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row">{row.realName}<span className={styles.tableMeta}>{row.active ? "Active" : "Inactive · final closed-deal month"}</span></th>
                            <td>{row.americanName || "Not provided"}</td><td>{row.email || "Not provided"}</td><td>{row.team?.name || "Unassigned"}</td>
                            <td className="numeric">{row.closedDeals}</td><td>{row.tierLabel}</td><td className="numeric">{egp(row.ratePerDeal)}</td><td className="numeric">{egp(row.commissionAmount)}</td><td className="numeric">{egp(row.baseSalary)}</td><td className="numeric">{egp(row.totalCompensation)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </section>
                <TierReference />
              </>
            )}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
