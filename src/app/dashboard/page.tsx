import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  getDashboardData,
  type DashboardHourlyBreakdownRow,
  type DashboardTotals,
} from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export const dynamic = "force-dynamic";

function DurationValue({ seconds }: { seconds: number }) {
  const duration = formatDurationSeconds(seconds);

  return (
    <span title={duration.decimalHoursLabel}>
      <span className="block font-mono tabular-nums">{duration.hms}</span>
      <span className="block text-xs text-muted">
        {duration.decimalHoursLabel}
      </span>
    </span>
  );
}

function HourlyCallsChart({
  rows,
}: {
  rows: DashboardHourlyBreakdownRow[];
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.calls));

  return (
    <div
      aria-label="Calls by hour"
      className="dashboard-chart"
      role="img"
    >
      {rows.length === 0 ? (
        <p className="dashboard-chart__empty">No hourly data is active.</p>
      ) : (
        rows.map((row) => (
          <div
            aria-label={`${String(row.hour).padStart(2, "0")}:00, ${formatNumber(row.calls)} calls`}
            className="dashboard-chart__row"
            key={row.hour}
          >
            <span className="dashboard-chart__label">
              {String(row.hour).padStart(2, "0")}:00
            </span>
            <span className="dashboard-chart__track">
              <span
                className="dashboard-chart__bar"
                style={{ width: `${Math.max(2, (row.calls / maximum) * 100)}%` }}
              />
            </span>
            <span className="dashboard-chart__value">
              {formatNumber(row.calls)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function TimeAllocationChart({ totals }: { totals: DashboardTotals }) {
  const segments = [
    ["Ready", totals.readySeconds],
    ["Talk", totals.talkSeconds],
    ["Wrap", totals.wrapSeconds],
    ["Paused", totals.pausedSeconds],
    ["Idle", totals.idleSeconds],
  ] as const;
  const maximum = Math.max(1, ...segments.map(([, seconds]) => seconds));

  return (
    <div
      aria-label="Time allocation by activity"
      className="dashboard-chart"
      role="img"
    >
      {segments.map(([label, seconds]) => (
        <div
          aria-label={`${label}, ${formatDurationSeconds(seconds).hms}`}
          className="dashboard-chart__row"
          key={label}
        >
          <span className="dashboard-chart__label">{label}</span>
          <span className="dashboard-chart__track">
            <span
              className="dashboard-chart__bar dashboard-chart__bar--secondary"
              style={{
                width: `${Math.max(2, (seconds / maximum) * 100)}%`,
              }}
            />
          </span>
          <span className="dashboard-chart__value">
            {formatDurationSeconds(seconds).hms}
          </span>
        </div>
      ))}
    </div>
  );
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
  const reconciliationOk =
    dashboard.reconciliation.callsMatch &&
    dashboard.reconciliation.loggedInSecondsMatch &&
    dashboard.reconciliation.talkSecondsMatch;

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          actions={
            <Link
              className="ui-button ui-button--secondary"
              href={showAgentsWithNoData ? "/dashboard" : "/dashboard?showNoData=1"}
            >
              {showAgentsWithNoData
                ? "Hide agents with no data"
                : "Show agents with no data"}
            </Link>
          }
          description="Active-version operational totals and agent performance, restricted to your current role and team scope."
          eyebrow="Performance"
          title="Overview"
        />

        {dashboard.status === "NO_ACTIVE_IMPORT" ? (
          <StatusBanner tone="warning">
            No approved import is currently active for this reporting scope.
            Historical, superseded, and deactivated uploads are not used as a
            fallback.
          </StatusBanner>
        ) : (
          <>
            <div className="metric-grid">
              {dashboard.metrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <p className="metric-card__label">{metric.label}</p>
                  <p className="metric-card__value">{metric.value}</p>
                </article>
              ))}
            </div>

            <div className="dashboard-insight-grid">
              <section
                aria-labelledby="hourly-calls-heading"
                className="ui-card ui-card--padded"
              >
                <h2 className="ui-card__title" id="hourly-calls-heading">
                  Calls by hour
                </h2>
                <p className="ui-card__subtitle">
                  Active-version call volume across the current reporting
                  scope.
                </p>
                <HourlyCallsChart rows={dashboard.hourlyBreakdown} />
              </section>

              <section
                aria-labelledby="time-allocation-heading"
                className="ui-card ui-card--padded"
              >
                <h2 className="ui-card__title" id="time-allocation-heading">
                  Time allocation
                </h2>
                <p className="ui-card__subtitle">
                  Relative activity durations in the active dataset.
                </p>
                <TimeAllocationChart totals={dashboard.totals} />
              </section>
            </div>

            <div className="dashboard-health-grid">
              <section className="ui-card ui-card--padded">
                <p className="ui-card__subtitle">Data freshness</p>
                <p className="dashboard-health-value">
                  {dashboard.dataFreshness.latestMetricDate ?? "No metric date"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Updated{" "}
                  {dashboard.dataFreshness.latestMetricUpdatedAt
                    ? dashboard.dataFreshness.latestMetricUpdatedAt.toLocaleString(
                        "en-US",
                      )
                    : "not available"}
                </p>
              </section>
              <section className="ui-card ui-card--padded">
                <p className="ui-card__subtitle">Reconciliation</p>
                <div className="mt-2">
                  <StatusBadge tone={reconciliationOk ? "success" : "danger"}>
                    {reconciliationOk ? "Totals reconciled" : "Review mismatch"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Agent calls {formatNumber(dashboard.reconciliation.agentTotals.calls)}
                  {" / "}KPI calls {formatNumber(dashboard.totals.calls)}
                </p>
              </section>
            </div>
          </>
        )}

        <section className="ui-card mt-5">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Agent performance</h2>
              <p className="ui-card__subtitle">
                Final active-version values for agents in your reporting scope.
              </p>
            </div>
            <StatusBadge>
              {formatNumber(dashboard.agentRows.length)}{" "}
              {dashboard.agentRows.length === 1 ? "agent" : "agents"}
            </StatusBadge>
          </div>
          <TableScroll label="Agent performance">
            <table className="ui-table">
              <caption>
                Agent totals and calculated rates in the active reporting scope
              </caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Team</th>
                  <th scope="col">Status</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Logged-in time</th>
                  <th scope="col">Talk time</th>
                  <th scope="col">Calls / hour</th>
                  <th scope="col">Talk %</th>
                  <th scope="col">Rows</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.agentRows.length === 0 ? (
                  <EmptyTableRow
                    colSpan={9}
                    description="Publish an import for this scope or include active agents with no data."
                    title="No scoped agent metrics"
                  />
                ) : (
                  dashboard.agentRows.map((agent) => (
                    <tr key={agent.profileId}>
                      <th scope="row">
                        <span className="font-medium">{agent.agentName}</span>
                        {!agent.hasMetrics ? (
                          <span className="mt-1 block text-xs text-muted">
                            No active data
                          </span>
                        ) : null}
                        {agent.isLocalTestAccount ? (
                          <span className="mt-1 block text-xs text-danger">
                            Local test account
                          </span>
                        ) : null}
                      </th>
                      <td>{agent.teamName}</td>
                      <td>
                        <StatusBadge
                          tone={
                            agent.accountStatus === "active"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {agent.accountStatus}
                        </StatusBadge>
                      </td>
                      <td className="font-mono tabular-nums">
                        {formatNumber(agent.calls)}
                      </td>
                      <td>
                        <DurationValue seconds={agent.loggedInSeconds} />
                      </td>
                      <td>
                        <DurationValue seconds={agent.talkSeconds} />
                      </td>
                      <td className="font-mono tabular-nums">
                        {agent.hasMetrics
                          ? formatOptionalNumber(agent.callsPerLoggedInHour)
                          : "—"}
                      </td>
                      <td className="font-mono tabular-nums">
                        {agent.hasMetrics
                          ? formatPercentage(agent.talkPercentage)
                          : "—"}
                      </td>
                      <td className="font-mono tabular-nums">
                        {formatNumber(agent.rowCount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableScroll>
        </section>
      </section>
    </DashboardShell>
  );
}
