import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  ActivityStateGrid,
  formatCompactDuration,
  HourlyActivityChart,
  MetricPanel,
  ProductivityMix,
} from "@/components/dashboard/performance-visuals";
import { getDashboardData } from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";
import { roleLabel } from "@/presentation/labels";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "No metric date";

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ showNoData?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const showAgentsWithNoData =
    params.showNoData === "1" || params.showNoData === "true";
  const dashboard = await getDashboardData(user, { showAgentsWithNoData });
  const loggedInHours = dashboard.totals.loggedInSeconds / 3600;
  const callsPerHour =
    loggedInHours > 0 ? dashboard.totals.calls / loggedInHours : null;
  const talkPercentage =
    dashboard.totals.loggedInSeconds > 0
      ? (dashboard.totals.talkSeconds / dashboard.totals.loggedInSeconds) * 100
      : null;
  const reconciliationOk =
    dashboard.reconciliation.callsMatch &&
    dashboard.reconciliation.loggedInSecondsMatch &&
    dashboard.reconciliation.talkSecondsMatch;
  const previewAgents = dashboard.agentRows.slice(0, 8);

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page overview-page">
        <PageHeader
          actions={
            <div className="page-header__action-group">
              <Link className="ui-button ui-button--secondary" href="/agents">
                View agents
              </Link>
              <Link className="ui-button ui-button--primary" href="/performance">
                View performance
                <DashboardIcon name="arrowRight" />
              </Link>
            </div>
          }
          description="Monitor activity, understand time allocation, and verify the active data inside your authorized scope."
          eyebrow="Company intelligence"
          title="Performance overview"
        />

        {dashboard.status === "NO_ACTIVE_IMPORT" ? (
          <StatusBanner tone="warning">
            No approved import is active for this scope. Historical,
            superseded, and deactivated uploads are not used in current totals.
            {user.role !== "agent" ? (
              <>
                {" "}
                <Link className="ui-link" href="/import">
                  Import agent activity
                </Link>
                .
              </>
            ) : null}
          </StatusBanner>
        ) : null}

        <div className="overview-layout">
          <div className="overview-main">
            <section aria-labelledby="core-performance-heading">
              <div className="section-heading section-heading--inline">
                <div>
                  <p className="section-heading__overline">Core performance</p>
                  <h2 id="core-performance-heading">Current operating picture</h2>
                </div>
                <p>
                  Active data through{" "}
                  <strong>{formatDate(dashboard.dataFreshness.latestMetricDate)}</strong>
                </p>
              </div>
              <div className="metric-panel-grid">
                <MetricPanel
                  detail="Total calls in this scope"
                  icon="calls"
                  label="Calls"
                  value={formatNumber(dashboard.totals.calls)}
                />
                <MetricPanel
                  detail="Total active time in the system"
                  icon="freshness"
                  label="Logged-in time"
                  tone="green"
                  value={formatCompactDuration(
                    dashboard.totals.loggedInSeconds,
                  )}
                />
                <MetricPanel
                  detail="Calls per logged-in hour"
                  icon="performance"
                  label="Calls per hour"
                  tone="orange"
                  value={formatOptionalNumber(callsPerHour)}
                />
                <MetricPanel
                  detail="Talk time divided by logged-in time"
                  icon="talk"
                  label="Talk percentage"
                  tone="violet"
                  value={
                    talkPercentage === null
                      ? "—"
                      : formatPercentage(talkPercentage)
                  }
                />
              </div>
            </section>

            <section
              aria-labelledby="hourly-activity-heading"
              className="ui-card overview-chart-card"
            >
              <div className="ui-card__header">
                <div>
                  <h2
                    className="ui-card__title"
                    id="hourly-activity-heading"
                  >
                    Hourly activity
                  </h2>
                  <p className="ui-card__subtitle">
                    Call volume by hour in the active reporting scope.
                  </p>
                </div>
                <StatusBadge tone="info">Calls</StatusBadge>
              </div>
              <HourlyActivityChart rows={dashboard.hourlyBreakdown} />
            </section>

            <section className="ui-card">
              <div className="ui-card__header">
                <div>
                  <h2 className="ui-card__title">Agent performance</h2>
                  <p className="ui-card__subtitle">
                    A focused preview of active-version agent results.
                  </p>
                </div>
                <div className="ui-card__actions">
                  <Link
                    className="ui-link-action"
                    href={
                      showAgentsWithNoData
                        ? "/dashboard"
                        : "/dashboard?showNoData=1"
                    }
                  >
                    {showAgentsWithNoData
                      ? "Hide agents with no data"
                      : "Include agents with no data"}
                  </Link>
                  <Link className="ui-button ui-button--secondary" href="/agents">
                    View all agents
                  </Link>
                </div>
              </div>
              <TableScroll label="Agent performance preview">
                <table className="ui-table">
                  <caption>
                    Agent totals and calculated rates in the active reporting
                    scope
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Team</th>
                      <th scope="col">Calls</th>
                      <th scope="col">Logged-in time</th>
                      <th scope="col">Talk time</th>
                      <th scope="col">Calls / hour</th>
                      <th scope="col">Talk %</th>
                      <th aria-label="Open detail" scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {previewAgents.length === 0 ? (
                      <EmptyTableRow
                        colSpan={8}
                        description="Publish an import for this scope or include active agents with no data."
                        title="No agent performance is available"
                      />
                    ) : (
                      previewAgents.map((agent) => (
                        <tr key={agent.profileId}>
                          <th scope="row">
                            <Link
                              className="table-primary-link"
                              href={`/agents/${agent.profileId}`}
                            >
                              {agent.agentName}
                            </Link>
                            {!agent.hasMetrics ? (
                              <span className="table-secondary">
                                No active data
                              </span>
                            ) : null}
                          </th>
                          <td>{agent.teamName}</td>
                          <td className="numeric">
                            {formatNumber(agent.calls)}
                          </td>
                          <td className="numeric">
                            {formatDurationSeconds(agent.loggedInSeconds).hms}
                          </td>
                          <td className="numeric">
                            {formatDurationSeconds(agent.talkSeconds).hms}
                          </td>
                          <td className="numeric">
                            {agent.hasMetrics
                              ? formatOptionalNumber(
                                  agent.callsPerLoggedInHour,
                                )
                              : "—"}
                          </td>
                          <td className="numeric">
                            {agent.hasMetrics
                              ? formatPercentage(agent.talkPercentage)
                              : "—"}
                          </td>
                          <td>
                            <Link
                              aria-label={`View ${agent.agentName}`}
                              className="table-row-link"
                              href={`/agents/${agent.profileId}`}
                            >
                              <DashboardIcon name="arrowRight" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableScroll>
              {dashboard.agentRows.length > previewAgents.length ? (
                <div className="table-footer">
                  Showing {formatNumber(previewAgents.length)} of{" "}
                  {formatNumber(dashboard.agentRows.length)} agents
                  <Link className="ui-link" href="/agents">
                    View the full directory
                  </Link>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="overview-rail" aria-label="Activity and data trust">
            <section
              aria-labelledby="activity-states-heading"
              className="ui-card rail-section"
            >
              <div className="ui-card__header">
                <div>
                  <h2
                    className="ui-card__title"
                    id="activity-states-heading"
                  >
                    Activity states
                  </h2>
                  <p className="ui-card__subtitle">
                    Time allocation against logged-in time.
                  </p>
                </div>
              </div>
              <ActivityStateGrid totals={dashboard.totals} />
            </section>

            <section
              aria-labelledby="productivity-mix-heading"
              className="ui-card rail-section"
            >
              <div className="ui-card__header">
                <div>
                  <h2
                    className="ui-card__title"
                    id="productivity-mix-heading"
                  >
                    Productivity mix
                  </h2>
                  <p className="ui-card__subtitle">
                    Share of recorded activity time.
                  </p>
                </div>
              </div>
              <ProductivityMix totals={dashboard.totals} />
            </section>

            <section aria-labelledby="data-trust-heading">
              <div className="section-heading section-heading--compact">
                <div>
                  <p className="section-heading__overline">Data trust</p>
                  <h2 id="data-trust-heading">Active reporting health</h2>
                </div>
              </div>
              <div className="trust-list">
                <article className="trust-item">
                  <span className="trust-item__icon">
                    <DashboardIcon name="calendar" />
                  </span>
                  <div>
                    <p className="trust-item__label">Data freshness</p>
                    <p className="trust-item__value">
                      {formatDate(dashboard.dataFreshness.latestMetricDate)}
                    </p>
                    <p className="trust-item__detail">
                      {dashboard.dataFreshness.latestMetricUpdatedAt
                        ? `Updated ${dashboard.dataFreshness.latestMetricUpdatedAt.toLocaleString(
                            "en-US",
                          )}`
                        : "No update timestamp is available"}
                    </p>
                  </div>
                </article>
                <article className="trust-item">
                  <span className="trust-item__icon">
                    <DashboardIcon name="import" />
                  </span>
                  <div>
                    <p className="trust-item__label">Active import</p>
                    <p className="trust-item__value">
                      {dashboard.status === "ACTIVE_IMPORT"
                        ? "Included in totals"
                        : "No active import"}
                    </p>
                    <Link
                      className="ui-link"
                      href={user.role === "admin" ? "/admin/imports" : "/import"}
                    >
                      {user.role === "admin"
                        ? "Open import history"
                        : "Open imports"}
                    </Link>
                  </div>
                </article>
                <article className="trust-item">
                  <span className="trust-item__icon">
                    <DashboardIcon name="activity" />
                  </span>
                  <div>
                    <p className="trust-item__label">Reconciliation</p>
                    <div className="trust-item__value">
                      <StatusBadge
                        tone={reconciliationOk ? "success" : "danger"}
                      >
                        {reconciliationOk
                          ? "Totals reconciled"
                          : "Review mismatch"}
                      </StatusBadge>
                    </div>
                    <p className="trust-item__detail">
                      Agent calls{" "}
                      {formatNumber(
                        dashboard.reconciliation.agentTotals.calls,
                      )}{" "}
                      / KPI calls {formatNumber(dashboard.totals.calls)}
                    </p>
                  </div>
                </article>
              </div>
            </section>

            <section aria-labelledby="quick-actions-heading">
              <div className="section-heading section-heading--compact">
                <div>
                  <p className="section-heading__overline">Quick actions</p>
                  <h2 className="sr-only" id="quick-actions-heading">
                    Quick actions
                  </h2>
                </div>
              </div>
              <nav aria-labelledby="quick-actions-heading" className="quick-actions">
                {user.role !== "agent" ? (
                  <Link href="/import">
                    <DashboardIcon name="import" />
                    <span>
                      <strong>Import data</strong>
                      <small>Upload agent activity</small>
                    </span>
                    <DashboardIcon name="arrowRight" />
                  </Link>
                ) : null}
                <Link href="/performance">
                  <DashboardIcon name="performance" />
                  <span>
                    <strong>Performance</strong>
                    <small>Inspect activity detail</small>
                  </span>
                  <DashboardIcon name="arrowRight" />
                </Link>
                <Link href={user.role === "agent" ? `/agents/${user.id}` : "/agents"}>
                  <DashboardIcon name="agent" />
                  <span>
                    <strong>
                      {user.role === "agent" ? "My performance" : "Agents"}
                    </strong>
                    <small>
                      {user.role === "agent"
                        ? "Review your activity"
                        : "Open the directory"}
                    </small>
                  </span>
                  <DashboardIcon name="arrowRight" />
                </Link>
              </nav>
            </section>
          </aside>
        </div>

        <footer className="dashboard-footer">
          <span>Openers Performance</span>
          <span>
            Role-scoped reporting · {roleLabel(user.role)} access
          </span>
        </footer>
      </section>
    </DashboardShell>
  );
}
