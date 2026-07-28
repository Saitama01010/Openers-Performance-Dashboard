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

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const dashboard = await getDashboardData(user);
  const loggedInHours = dashboard.totals.loggedInSeconds / 3600;
  const callsPerHour =
    loggedInHours > 0 ? dashboard.totals.calls / loggedInHours : null;
  const talkPercentage =
    dashboard.totals.loggedInSeconds > 0
      ? (dashboard.totals.talkSeconds / dashboard.totals.loggedInSeconds) * 100
      : null;

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          actions={
            <Link className="ui-button ui-button--secondary" href="/agents">
              View agent performance
              <DashboardIcon name="arrowRight" />
            </Link>
          }
          description="Inspect call volume, rates, and time allocation from the same active data used on the overview."
          eyebrow="Analysis"
          title="Performance"
        />

        {dashboard.status === "NO_ACTIVE_IMPORT" ? (
          <StatusBanner tone="warning">
            No approved import is active for this scope, so current
            performance values are empty.
          </StatusBanner>
        ) : null}

        <div className="metric-panel-grid">
          <MetricPanel
            detail="Total calls in the active scope"
            icon="calls"
            label="Calls"
            value={formatNumber(dashboard.totals.calls)}
          />
          <MetricPanel
            detail="Total active time in the system"
            icon="freshness"
            label="Logged-in time"
            tone="green"
            value={formatCompactDuration(dashboard.totals.loggedInSeconds)}
          />
          <MetricPanel
            detail="Calls divided by logged-in hours"
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
              talkPercentage === null ? "—" : formatPercentage(talkPercentage)
            }
          />
        </div>

        <div className="analysis-layout">
          <section className="ui-card analysis-layout__wide">
            <div className="ui-card__header">
              <div>
                <h2 className="ui-card__title">Hourly call profile</h2>
                <p className="ui-card__subtitle">
                  Call volume by hour in local time.
                </p>
              </div>
              <StatusBadge tone="info">Calls</StatusBadge>
            </div>
            <HourlyActivityChart rows={dashboard.hourlyBreakdown} />
          </section>

          <section className="ui-card analysis-layout__narrow">
            <div className="ui-card__header">
              <div>
                <h2 className="ui-card__title">Productivity mix</h2>
                <p className="ui-card__subtitle">
                  Share of all recorded activity time.
                </p>
              </div>
            </div>
            <ProductivityMix totals={dashboard.totals} />
          </section>

          <section className="ui-card analysis-layout__full">
            <div className="ui-card__header">
              <div>
                <h2 className="ui-card__title">Activity states</h2>
                <p className="ui-card__subtitle">
                  Each state shown against total logged-in time.
                </p>
              </div>
            </div>
            <ActivityStateGrid totals={dashboard.totals} />
          </section>
        </div>

        <section className="ui-card mt-4">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Hourly detail</h2>
              <p className="ui-card__subtitle">
                Source-level aggregates used by the hourly profile.
              </p>
            </div>
          </div>
          <TableScroll label="Hourly performance detail">
            <table className="ui-table">
              <caption>
                Calls, logged-in time, talk time, and source rows by hour
              </caption>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Logged-in time</th>
                  <th scope="col">Talk time</th>
                  <th scope="col">Calls / hour</th>
                  <th scope="col">Source rows</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.hourlyBreakdown.length === 0 ? (
                  <EmptyTableRow
                    colSpan={6}
                    description="The active data does not contain hourly records for this scope."
                    title="No hourly activity is available"
                  />
                ) : (
                  dashboard.hourlyBreakdown.map((row) => {
                    const hours = row.loggedInSeconds / 3600;

                    return (
                      <tr key={row.hour}>
                        <th scope="row">
                          {String(row.hour).padStart(2, "0")}:00
                        </th>
                        <td className="numeric">{formatNumber(row.calls)}</td>
                        <td className="numeric">
                          {formatDurationSeconds(row.loggedInSeconds).hms}
                        </td>
                        <td className="numeric">
                          {formatDurationSeconds(row.talkSeconds).hms}
                        </td>
                        <td className="numeric">
                          {formatOptionalNumber(
                            hours > 0 ? row.calls / hours : null,
                          )}
                        </td>
                        <td className="numeric">
                          {formatNumber(row.rowCount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableScroll>
        </section>
      </section>
    </DashboardShell>
  );
}
