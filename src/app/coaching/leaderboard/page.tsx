import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  getCoachingLeaderboardData,
  type CoachingLeaderboardSort,
} from "@/coaching/data";
import { resolveWeekWindow } from "@/coaching/week";
import {
  EmptyTableRow,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
  const week = resolveWeekWindow(first(params.week));
  const requestedSort = first(params.sort);
  const sort: CoachingLeaderboardSort = ["coverage", "coached", "manager"].includes(requestedSort ?? "")
    ? (requestedSort as CoachingLeaderboardSort)
    : "coverage";
  const direction = first(params.direction) === "asc" ? "asc" : "desc";
  const data = await getCoachingLeaderboardData(actor, {
    week,
    query: first(params.q)?.trim() || undefined,
    teamId: first(params.team)?.trim() || undefined,
    sort,
    direction,
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div><h2>Manager coaching leaderboard</h2><p>Weekly coverage credits only sessions attributed to the selected active manager.</p></div>
      </div>
      <form className="feature-filter-grid" method="get">
        <label className="ui-label">Week containing<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label>
        <label className="ui-label">Manager search<input className="ui-input" defaultValue={first(params.q) ?? ""} name="q" type="search" /></label>
        <label className="ui-label">Team<select className="ui-select" defaultValue={first(params.team) ?? ""} name="team"><option value="">All teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="ui-label">Sort by<select className="ui-select" defaultValue={sort} name="sort"><option value="coverage">Coverage percentage</option><option value="coached">Coached agents</option><option value="manager">Manager name</option></select></label>
        <label className="ui-label">Direction<select className="ui-select" defaultValue={direction} name="direction"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        <div className="feature-filter-grid__actions"><button className="ui-button ui-button--primary">Apply filters</button><Link className="ui-button ui-button--secondary" href="/coaching/leaderboard">Clear</Link></div>
      </form>
      <section className="ui-card">
        <div className="ui-card__header"><div><h2 className="ui-card__title">Coverage for {week.start} – {week.end}</h2><p className="ui-card__subtitle">Distinct coached assigned agents divided by distinct active assigned agents.</p></div></div>
        <TableScroll label="Manager coaching leaderboard"><table className="ui-table"><caption>Weekly manager coaching coverage</caption>
          <thead><tr><th scope="col">Manager</th><th scope="col">Teams</th><th scope="col">Assigned agents</th><th scope="col">Coached agents</th><th scope="col">Missing agents</th><th scope="col">Sessions completed</th><th scope="col">Individual participants</th><th scope="col">Coverage</th><th scope="col">Status</th></tr></thead>
          <tbody>{data.rows.length === 0 ? <EmptyTableRow colSpan={9} title="No managers found" description="No active managers match the selected filters." /> : data.rows.map((row) => <tr key={row.managerId}>
            <th scope="row">{row.managerName}</th><td>{row.teamNames.join(", ") || "No active teams"}</td><td className="numeric">{row.assignedAgents}</td><td className="numeric">{row.coachedAgents}</td><td className="numeric">{row.missingAgents}</td><td className="numeric">{row.sessionsCompleted}</td><td className="numeric">{row.individualParticipants}</td><td className="numeric">{row.coveragePercentage === null ? "N/A" : `${row.coveragePercentage.toFixed(1)}%`}</td><td><StatusBadge tone={row.status === "Complete" ? "success" : row.status === "Not started" ? "danger" : row.status === "In progress" ? "warning" : "neutral"}>{row.status}</StatusBadge></td>
          </tr>)}</tbody>
        </table></TableScroll>
      </section>
    </div>
  );
}
