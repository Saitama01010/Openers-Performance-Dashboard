import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  getCoachingLeaderboardData,
  type CoachingLeaderboardSort,
} from "@/coaching/data";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { EmptyTableRow, TableScroll } from "@/components/dashboard/dashboard-primitives";
import { resolveOverviewDateRange, type OverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rangeText(range: OverviewDateRange) {
  if (!range.from || !range.to) return "all coaching history";
  return range.from === range.to ? range.from : `${range.from} – ${range.to}`;
}

export default async function CoachingLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/coaching/room");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const requestedSort = first(params.sort);
  const sort: CoachingLeaderboardSort = ["coverage", "coached", "manager"].includes(requestedSort ?? "")
    ? (requestedSort as CoachingLeaderboardSort)
    : "coverage";
  const direction = first(params.direction) === "asc" ? "asc" : "desc";
  const data = await getCoachingLeaderboardData(actor, {
    dateRange,
    managerId: first(params.manager)?.trim() || undefined,
    teamId: first(params.team)?.trim() || undefined,
    sort,
    direction,
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div>
          <h2>Manager coaching leaderboard</h2>
          <p>Coverage counts distinct currently assigned active agents coached in the selected period.</p>
        </div>
        <DashboardDateFilter
          ariaLabel="Coaching leaderboard date filter"
          pathname="/coaching/leaderboard"
          range={dateRange}
        />
      </div>

      <DashboardFilterToolbar
        ariaLabel="Coaching leaderboard filters"
        filters={[
          {
            kind: "combobox",
            label: "Manager",
            name: "manager",
            value: first(params.manager),
            options: [
              { label: "All managers", value: "" },
              ...data.managers.map((manager) => ({ label: manager.name, value: manager.id })),
            ],
          },
          {
            label: "Team",
            name: "team",
            value: first(params.team),
            options: [
              { label: "All teams", value: "" },
              ...data.teams.map((team) => ({ label: team.name, value: team.id })),
            ],
          },
          {
            label: "Sort column",
            name: "sort",
            value: sort,
            options: [
              { label: "Coverage", value: "coverage" },
              { label: "Coached agents", value: "coached" },
              { label: "Manager", value: "manager" },
            ],
          },
          {
            label: "Sort direction",
            name: "direction",
            value: direction,
            options: [
              { label: "Descending", value: "desc" },
              { label: "Ascending", value: "asc" },
            ],
          },
        ]}
      />

      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Coverage for {rangeText(dateRange)}</h2>
            <p className="ui-card__subtitle">Repeated coaching counts once per agent; group coaching remains one session.</p>
          </div>
        </div>
        <TableScroll label="Manager coaching leaderboard">
          <table className="ui-table">
            <caption>Manager coaching coverage for the selected period</caption>
            <thead>
              <tr>
                <th scope="col">Manager</th>
                <th scope="col">Teams</th>
                <th scope="col">Assigned Agents</th>
                <th scope="col">Coached Agents</th>
                <th scope="col">Sessions Completed</th>
                <th scope="col">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyTableRow colSpan={6} title="No managers found" description="No active manager matches the authorized filters." />
              ) : data.rows.map((row) => {
                const percentage = row.coveragePercentage === null
                  ? null
                  : Math.min(100, Math.max(0, row.coveragePercentage));
                return (
                  <tr key={row.managerId}>
                    <th scope="row">{row.managerName}</th>
                    <td>{row.teamNames.join(", ") || "No active teams"}</td>
                    <td className="numeric">{row.assignedAgents}</td>
                    <td className="numeric">{row.coachedAgents}</td>
                    <td className="numeric">{row.sessionsCompleted}</td>
                    <td>
                      {percentage === null ? "N/A" : (
                        <div
                          aria-label={`${row.managerName} coaching coverage`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={Number(percentage.toFixed(1))}
                          className="coverage-progress"
                          role="progressbar"
                        >
                          <strong>{percentage.toFixed(1)}%</strong>
                          <span className="coverage-progress__track" aria-hidden="true">
                            <span className="coverage-progress__fill" style={{ width: `${percentage}%` }} />
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
