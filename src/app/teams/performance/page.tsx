import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardData, type DashboardTotals } from "@/dashboard/data";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export const dynamic = "force-dynamic";

type TeamPerformance = DashboardTotals & {
  agents: number;
  callsPerLoggedInHour: number | null;
  name: string;
  talkPercentage: number | null;
};

function aggregateTeams(
  rows: Awaited<ReturnType<typeof getDashboardData>>["agentRows"],
) {
  const teams = new Map<string, Omit<TeamPerformance, "callsPerLoggedInHour" | "talkPercentage">>();

  for (const row of rows) {
    const current = teams.get(row.teamName) ?? {
      agents: 0,
      calls: 0,
      idleSeconds: null,
      loggedInSeconds: 0,
      name: row.teamName,
      netSeconds: null,
      pausedSeconds: 0,
      readySeconds: 0,
      ringingSeconds: null,
      rowCount: 0,
      systemPauseSeconds: null,
      talkSeconds: 0,
      untrackedSeconds: null,
      wrapSeconds: 0,
    };

    current.agents += 1;
    current.calls += row.calls;
    current.idleSeconds =
      current.agents === 1
        ? row.idleSeconds
        : current.idleSeconds === null || row.idleSeconds === null
          ? null
          : current.idleSeconds + row.idleSeconds;
    current.loggedInSeconds += row.loggedInSeconds;
    current.netSeconds =
      current.agents === 1
        ? row.netSeconds
        : current.netSeconds === null || row.netSeconds === null
          ? null
          : current.netSeconds + row.netSeconds;
    current.pausedSeconds += row.pausedSeconds;
    current.readySeconds += row.readySeconds;
    current.ringingSeconds =
      current.agents === 1
        ? row.ringingSeconds
        : current.ringingSeconds === null || row.ringingSeconds === null
          ? null
          : current.ringingSeconds + row.ringingSeconds;
    current.rowCount += row.rowCount;
    current.systemPauseSeconds =
      current.agents === 1
        ? row.systemPauseSeconds
        : current.systemPauseSeconds === null ||
            row.systemPauseSeconds === null
          ? null
          : current.systemPauseSeconds + row.systemPauseSeconds;
    current.talkSeconds += row.talkSeconds;
    current.untrackedSeconds =
      current.agents === 1
        ? row.untrackedSeconds
        : current.untrackedSeconds === null || row.untrackedSeconds === null
          ? null
          : current.untrackedSeconds + row.untrackedSeconds;
    current.wrapSeconds += row.wrapSeconds;
    teams.set(row.teamName, current);
  }

  return Array.from(teams.values())
    .map((team) => {
      const loggedInHours = team.loggedInSeconds / 3600;
      return {
        ...team,
        callsPerLoggedInHour:
          loggedInHours > 0 ? team.calls / loggedInHours : null,
        talkPercentage:
          team.loggedInSeconds > 0
            ? (team.talkSeconds / team.loggedInSeconds) * 100
            : null,
      };
    })
    .sort((left, right) => right.calls - left.calls);
}

export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role === "agent") redirect("/performance");

  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const dashboard = await getDashboardData(user, { dateRange });
  const teams = aggregateTeams(dashboard.agentRows);
  const maximumCalls = Math.max(1, ...teams.map((team) => team.calls));

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          actions={<DashboardDateFilter ariaLabel="Team performance date filter" pathname="/teams/performance" range={dateRange} />}
          description="Compare the team snapshots represented in your active, role-scoped performance data."
          eyebrow="Comparison"
          title="Team performance"
        />

        <section className="ui-card team-comparison">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Calls by team</h2>
              <p className="ui-card__subtitle">
                Relative call volume; exact values remain visible.
              </p>
            </div>
            <StatusBadge>
              {formatNumber(teams.length)} {teams.length === 1 ? "team" : "teams"}
            </StatusBadge>
          </div>
          <div className="team-comparison__bars">
            {teams.length === 0 ? (
              <p className="chart-empty">
                No team performance is available in the active data.
              </p>
            ) : (
              teams.map((team, index) => (
                <div className="team-bar" key={team.name}>
                  <span className="team-bar__rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Link
                    className="team-bar__name"
                    href={`/agents?team=${encodeURIComponent(team.name)}`}
                  >
                    {team.name}
                  </Link>
                  <span className="team-bar__track" aria-hidden="true">
                    <span
                      className="team-bar__fill"
                      style={{ width: `${(team.calls / maximumCalls) * 100}%` }}
                    />
                  </span>
                  <span className="team-bar__value">
                    {formatNumber(team.calls)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="ui-card mt-4">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Team detail</h2>
              <p className="ui-card__subtitle">
                Aggregated from the same agent rows visible in your scope.
              </p>
            </div>
          </div>
          <TableScroll label="Team performance detail">
            <table className="ui-table">
              <caption>Active-version performance aggregated by team</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Agents</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Logged-in time</th>
                  <th scope="col">Talk time</th>
                  <th scope="col">Calls / hour</th>
                  <th scope="col">Talk %</th>
                  <th scope="col">Source rows</th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 ? (
                  <EmptyTableRow
                    colSpan={8}
                    description="Publish an import containing team snapshots inside this reporting scope."
                    title="No team performance is available"
                  />
                ) : (
                  teams.map((team) => (
                    <tr key={team.name}>
                      <th scope="row">
                        <Link
                          className="table-primary-link"
                          href={`/agents?team=${encodeURIComponent(team.name)}`}
                        >
                          {team.name}
                        </Link>
                      </th>
                      <td className="numeric">{formatNumber(team.agents)}</td>
                      <td className="numeric">{formatNumber(team.calls)}</td>
                      <td className="numeric">
                        {formatDurationSeconds(team.loggedInSeconds).hms}
                      </td>
                      <td className="numeric">
                        {formatDurationSeconds(team.talkSeconds).hms}
                      </td>
                      <td className="numeric">
                        {formatOptionalNumber(team.callsPerLoggedInHour)}
                      </td>
                      <td className="numeric">
                        {formatPercentage(team.talkPercentage)}
                      </td>
                      <td className="numeric">{formatNumber(team.rowCount)}</td>
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
