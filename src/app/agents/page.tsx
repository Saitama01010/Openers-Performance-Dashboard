import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardData } from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  return status === "active" ? "success" : "neutral";
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; showNoData?: string; team?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const showNoData =
    params.showNoData === "1" || params.showNoData === "true";
  const dashboard = await getDashboardData(user, {
    showAgentsWithNoData: showNoData,
  });
  const query = params.q?.trim().toLocaleLowerCase() ?? "";
  const team = params.team?.trim() ?? "";
  const teams = Array.from(
    new Set(dashboard.agentRows.map((agent) => agent.teamName)),
  ).sort((left, right) => left.localeCompare(right));
  const agents = dashboard.agentRows.filter((agent) => {
    const matchesQuery =
      query.length === 0 ||
      agent.agentName.toLocaleLowerCase().includes(query) ||
      agent.teamName.toLocaleLowerCase().includes(query);
    const matchesTeam = team.length === 0 || agent.teamName === team;
    return matchesQuery && matchesTeam;
  });

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          description="Find people in your reporting scope and open their active-version performance."
          eyebrow="Directory"
          title={user.role === "agent" ? "My performance record" : "Agents"}
        />

        <section className="ui-card">
          <form className="directory-toolbar" method="get">
            <label className="ui-label directory-toolbar__search">
              Search
              <span className="search-field">
                <DashboardIcon name="search" />
                <input
                  className="ui-input"
                  defaultValue={params.q}
                  name="q"
                  placeholder="Search agent or team"
                  type="search"
                />
              </span>
            </label>
            <label className="ui-label">
              Team
              <select className="ui-select" defaultValue={team} name="team">
                <option value="">All teams</option>
                {teams.map((teamName) => (
                  <option key={teamName} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-checkbox-label directory-toolbar__checkbox">
              <input
                defaultChecked={showNoData}
                name="showNoData"
                type="checkbox"
                value="1"
              />
              Include active agents with no data
            </label>
            <div className="directory-toolbar__actions">
              <button className="ui-button ui-button--primary" type="submit">
                Apply filters
              </button>
              <Link className="ui-button ui-button--secondary" href="/agents">
                Clear
              </Link>
            </div>
          </form>

          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Agent performance in your view</h2>
              <p className="ui-card__subtitle">
                {formatNumber(agents.length)}{" "}
                {agents.length === 1 ? "record" : "records"} match the current
                filters.
              </p>
            </div>
          </div>

          <TableScroll label="Agent directory">
            <table className="ui-table">
              <caption>
                Role-scoped agents and active-version performance
              </caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Team</th>
                  <th scope="col">Account</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Logged-in time</th>
                  <th scope="col">Talk time</th>
                  <th scope="col">Calls / hour</th>
                  <th scope="col">Talk %</th>
                  <th aria-label="Open detail" scope="col" />
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <EmptyTableRow
                    colSpan={9}
                    description="Change the search or team filter, or include active agents with no data."
                    title="No agents match these filters"
                  />
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.profileId}>
                      <th scope="row">
                        <Link
                          className="table-primary-link"
                          href={`/agents/${agent.profileId}`}
                        >
                          {agent.agentName}
                        </Link>
                        {!agent.hasMetrics ? (
                          <span className="table-secondary">No active data</span>
                        ) : null}
                      </th>
                      <td>{agent.teamName}</td>
                      <td>
                        <StatusBadge tone={statusTone(agent.accountStatus)}>
                          {agent.accountStatus}
                        </StatusBadge>
                      </td>
                      <td className="numeric">{formatNumber(agent.calls)}</td>
                      <td className="numeric">
                        {formatDurationSeconds(agent.loggedInSeconds).hms}
                      </td>
                      <td className="numeric">
                        {formatDurationSeconds(agent.talkSeconds).hms}
                      </td>
                      <td className="numeric">
                        {agent.hasMetrics
                          ? formatOptionalNumber(agent.callsPerLoggedInHour)
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
        </section>
      </section>
    </DashboardShell>
  );
}
