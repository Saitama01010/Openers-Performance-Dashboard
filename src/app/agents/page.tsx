import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardData } from "@/dashboard/data";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const showNoData =
    first(params.showNoData) === "1" || first(params.showNoData) === "true";
  const dashboard = await getDashboardData(user, {
    dateRange,
    showAgentsWithNoData: showNoData,
  });
  const profile = first(params.profile)?.trim() ?? "";
  const team = first(params.team)?.trim() ?? "";
  const teams = Array.from(
    new Set(dashboard.agentRows.map((agent) => agent.teamName)),
  ).sort((left, right) => left.localeCompare(right));
  const agents = dashboard.agentRows.filter((agent) => {
    const matchesProfile = profile.length === 0 || agent.profileId === profile;
    const matchesTeam = team.length === 0 || agent.teamName === team;
    return matchesProfile && matchesTeam;
  });

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          actions={<DashboardDateFilter ariaLabel="Agents date filter" pathname="/agents" range={dateRange} />}
          description="Find people in your reporting scope and open their active-version performance."
          eyebrow="Directory"
          title={user.role === "agent" ? "My performance record" : "Agents"}
        />

        <section className="ui-card">
          <DashboardFilterToolbar
            ariaLabel="Agent directory filters"
            filters={[
              {
                kind: "combobox",
                label: "Agent",
                name: "profile",
                value: profile,
                options: [
                  { label: "All agents", value: "" },
                  ...dashboard.agentRows.map((agent) => ({
                    label: `${agent.agentName} — ${agent.teamName}`,
                    value: agent.profileId,
                  })),
                ],
              },
              {
                label: "Team",
                name: "team",
                value: team,
                options: [
                  { label: "All teams", value: "" },
                  ...teams.map((teamName) => ({ label: teamName, value: teamName })),
                ],
              },
              {
                label: "Agent data",
                name: "showNoData",
                value: showNoData ? "1" : "",
                options: [
                  { label: "With active data", value: "" },
                  { label: "Include no-data agents", value: "1" },
                ],
              },
            ]}
          />

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
