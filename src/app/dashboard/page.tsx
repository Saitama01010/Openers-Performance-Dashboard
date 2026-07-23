import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";
import { getDashboardData } from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold capitalize text-muted">
      {status}
    </span>
  );
}

function DurationCell({ seconds }: { seconds: number }) {
  const formatted = formatDurationSeconds(seconds);

  return (
    <span title={formatted.decimalHoursLabel}>
      <span className="block font-mono">{formatted.hms}</span>
      <span className="block text-xs text-muted">
        {formatted.decimalHoursLabel}
      </span>
    </span>
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted">Signed in as {user.name}</p>
            <h1 className="text-2xl font-semibold">Openers Performance</h1>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "admin" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/admin/users"
              >
                Users & Access
              </Link>
            ) : null}
            {user.role === "admin" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/admin/teams"
              >
                Teams
              </Link>
            ) : null}
            {user.role !== "agent" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/import"
              >
                Import CSV
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard.metrics.map((metric) => (
            <article
              className="rounded-lg border border-border bg-surface p-4"
              key={metric.label}
            >
              <p className="text-sm text-muted">{metric.label}</p>
              <p className="mt-2 font-mono text-3xl font-semibold">
                {metric.value}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="text-xs uppercase text-muted">Data freshness</p>
            <p className="mt-2">
              Latest metric date:{" "}
              <span className="font-medium">
                {dashboard.dataFreshness.latestMetricDate ?? "No data"}
              </span>
            </p>
            <p className="mt-1 text-muted">
              Last updated:{" "}
              {dashboard.dataFreshness.latestMetricUpdatedAt
                ? dashboard.dataFreshness.latestMetricUpdatedAt.toLocaleString()
                : "No data"}
            </p>
          </section>
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="text-xs uppercase text-muted">Reconciliation</p>
            <p
              className={`mt-2 font-medium ${reconciliationOk ? "text-primary" : "text-danger"}`}
            >
              {reconciliationOk
                ? "Agent totals reconcile to KPI totals."
                : "Agent totals do not reconcile to KPI totals."}
            </p>
            <p className="mt-1 text-muted">
              Agent calls: {formatNumber(dashboard.reconciliation.agentTotals.calls)} / KPI calls:{" "}
              {formatNumber(dashboard.totals.calls)}
            </p>
          </section>
        </div>

        <section className="mt-8 rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-semibold">Performance by agent</h2>
              <p className="mt-1 text-sm text-muted">
                Showing {formatNumber(dashboard.agentRows.length)} agent
                {dashboard.agentRows.length === 1 ? "" : "s"} in the current
                dashboard scope.
              </p>
            </div>
            <Link
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
              href={showAgentsWithNoData ? "/dashboard" : "/dashboard?showNoData=1"}
            >
              {showAgentsWithNoData
                ? "Hide agents with no data"
                : "Show agents with no data"}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="min-w-48 px-4 py-3">Agent name</th>
                  <th className="min-w-40 px-4 py-3">Team</th>
                  <th className="whitespace-nowrap px-4 py-3">Account status</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Calls</th>
                  <th className="whitespace-nowrap px-4 py-3">Logged-in time</th>
                  <th className="whitespace-nowrap px-4 py-3">Ready time</th>
                  <th className="whitespace-nowrap px-4 py-3">Talk time</th>
                  <th className="whitespace-nowrap px-4 py-3">Wrap time</th>
                  <th className="whitespace-nowrap px-4 py-3">Paused time</th>
                  <th className="whitespace-nowrap px-4 py-3">Idle time</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    Calls / logged-in hour
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    Talk percentage
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    Data row count
                  </th>
                </tr>
              </thead>
              <tbody>
                {dashboard.agentRows.map((agent) => (
                  <tr className="border-t border-border align-top" key={agent.profileId}>
                    <td className="px-4 py-3 font-medium">
                      <span className="block">{agent.agentName}</span>
                      {!agent.hasMetrics ? (
                        <span className="mt-1 inline-block rounded-md border border-border px-2 py-1 text-xs text-muted">
                          No data
                        </span>
                      ) : null}
                      {agent.isLocalTestAccount ? (
                        <span className="mt-1 inline-block rounded-md border border-danger/40 px-2 py-1 text-xs font-semibold text-danger">
                          Local test account
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{agent.teamName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={agent.accountStatus} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatNumber(agent.calls)}
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.loggedInSeconds} />
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.readySeconds} />
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.talkSeconds} />
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.wrapSeconds} />
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.pausedSeconds} />
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell seconds={agent.idleSeconds} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {agent.hasMetrics
                        ? formatOptionalNumber(agent.callsPerLoggedInHour)
                        : "No data"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {agent.hasMetrics
                        ? formatPercentage(agent.talkPercentage)
                        : "No data"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatNumber(agent.rowCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Hourly breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-3">Hour</th>
                  <th className="px-4 py-3 text-right">Calls</th>
                  <th className="px-4 py-3">Logged-in time</th>
                  <th className="px-4 py-3">Talk time</th>
                  <th className="px-4 py-3 text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.hourlyBreakdown.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 text-muted" colSpan={5}>
                      No data in the current dashboard scope.
                    </td>
                  </tr>
                ) : (
                  dashboard.hourlyBreakdown.map((row) => (
                    <tr className="border-t border-border" key={row.hour}>
                      <td className="px-4 py-3 font-mono">
                        {String(row.hour).padStart(2, "0")}:00
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNumber(row.calls)}
                      </td>
                      <td className="px-4 py-3">
                        <DurationCell seconds={row.loggedInSeconds} />
                      </td>
                      <td className="px-4 py-3">
                        <DurationCell seconds={row.talkSeconds} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNumber(row.rowCount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
