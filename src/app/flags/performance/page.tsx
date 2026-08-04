import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { resolveWeekWindow } from "@/coaching/week";
import {
  EmptyTableRow,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { getPerformanceFlagsData } from "@/flags/data";
import { formatDurationSeconds } from "@/import/format";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rate(value: number | null) {
  return value === null ? "Unavailable" : value.toFixed(2);
}

export default async function PerformanceFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const week = resolveWeekWindow(first(params.week));
  const data = await getPerformanceFlagsData(actor, {
    week,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
    profileId: first(params.profile)?.trim() || undefined,
    query: first(params.q)?.trim() || undefined,
    wrap: first(params.wrap) === "flagged" ? "flagged" : "all",
    pause: first(params.pause) === "flagged" ? "flagged" : "all",
    flaggedOnly: first(params.flagged) === "true",
  });

  if (actor.role === "agent") {
    const row = data.rows[0];
    return (
      <div className="feature-view">
        <div className="feature-view__heading"><div><h2>Performance Flags</h2><p>Your own weekly wrap and pause calculations.</p></div><form><label className="ui-label">Selected week<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label><button className="ui-button ui-button--secondary">View week</button></form></div>
        {!row ? <section className="ui-card ui-card--padded feature-empty"><h2>No active flags</h2><p>No active profile metrics are available for this week.</p></section> : <>
          <section className="ui-card ui-card--padded feature-self-card">
            <div className="feature-self-card__header"><div><h2>{row.agentName}</h2><p>{week.start} – {week.end}</p></div><StatusBadge tone={row.triggeredFlags.length ? "danger" : "success"}>{row.triggeredFlags.length ? row.triggeredFlags.join(" + ") : "No active flags"}</StatusBadge></div>
            <dl className="feature-metric-list"><div><dt>Talk time</dt><dd>{formatDurationSeconds(row.talkSeconds).hms}</dd></div><div><dt>Wrap time</dt><dd>{formatDurationSeconds(row.wrapSeconds).hms}</dd></div><div><dt>Wrap minutes / talk hour</dt><dd>{rate(row.wrapRate)}</dd></div><div><dt>Allowed wrap threshold</dt><dd>{row.wrapThreshold.toFixed(2)}</dd></div><div><dt>Net counted time</dt><dd>{formatDurationSeconds(row.netCountedSeconds).hms}</dd></div><div><dt>Pause time</dt><dd>{formatDurationSeconds(row.pausedSeconds).hms}</dd></div><div><dt>Pause minutes / net hour</dt><dd>{rate(row.pauseRate)}</dd></div><div><dt>Allowed pause threshold</dt><dd>{row.pauseThreshold.toFixed(2)}</dd></div></dl>
          </section>
          {row.triggeredFlags.length === 0 ? <p className="feature-no-flags" role="status">No active flags</p> : null}
        </>}
      </div>
    );
  }

  return (
    <div className="feature-view">
      <div className="feature-view__heading"><div><h2>Performance Flags</h2><p>Wrap is flagged only above 7.00 minutes per talk hour; pause only above 8.00 minutes per net counted hour.</p></div></div>
      <form className="feature-filter-grid" method="get">
        <label className="ui-label">Week containing<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label>
        <label className="ui-label">Team<select className="ui-select" defaultValue={first(params.team) ?? ""} name="team"><option value="">All authorized teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        {actor.role === "admin" ? <label className="ui-label">Manager<select className="ui-select" defaultValue={first(params.manager) ?? ""} name="manager"><option value="">All managers</option>{data.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label> : null}
        <label className="ui-label">Agent search<input className="ui-input" defaultValue={first(params.q) ?? ""} name="q" type="search" /></label>
        <label className="ui-label">Wrap flags<select className="ui-select" defaultValue={first(params.wrap) ?? "all"} name="wrap"><option value="all">All</option><option value="flagged">Flagged only</option></select></label>
        <label className="ui-label">Pause flags<select className="ui-select" defaultValue={first(params.pause) ?? "all"} name="pause"><option value="all">All</option><option value="flagged">Flagged only</option></select></label>
        <label className="feature-checkbox"><input defaultChecked={first(params.flagged) === "true"} name="flagged" type="checkbox" value="true" /> All flagged agents</label>
        <div className="feature-filter-grid__actions"><button className="ui-button ui-button--primary">Apply filters</button><Link className="ui-button ui-button--secondary" href="/flags/performance">Clear</Link></div>
      </form>
      {data.summary ? <dl className="feature-summary"><div><dt>Scoped agents</dt><dd>{data.summary.scopedAgents}</dd></div><div><dt>Flagged agents</dt><dd>{data.summary.flaggedAgents}</dd></div><div><dt>Wrap flags</dt><dd>{data.summary.wrapFlags}</dd></div><div><dt>Pause flags</dt><dd>{data.summary.pauseFlags}</dd></div></dl> : null}
      <section className="ui-card"><div className="ui-card__header"><div><h2 className="ui-card__title">Weekly efficiency calculations</h2><p className="ui-card__subtitle">Net counted time is talk + wrap + ready from active dataset versions only.</p></div></div>
        <TableScroll label="Performance flag results"><table className="ui-table feature-table"><caption>Weekly performance flags</caption><thead><tr><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Week</th><th scope="col">Talk time</th><th scope="col">Wrap time</th><th scope="col">Wrap / talk hour</th><th scope="col">Wrap limit</th><th scope="col">Net counted</th><th scope="col">Pause time</th><th scope="col">Pause / net hour</th><th scope="col">Pause limit</th><th scope="col">Triggered flags</th><th scope="col">Status</th></tr></thead>
        <tbody>{data.rows.length === 0 ? <EmptyTableRow colSpan={13} title="No flag results" description="No active agents match the selected filters." /> : data.rows.map((row) => <tr key={row.agentId}><th scope="row">{row.agentName}</th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td>{week.start} – {week.end}</td><td>{formatDurationSeconds(row.talkSeconds).hms}</td><td>{formatDurationSeconds(row.wrapSeconds).hms}</td><td className="numeric">{rate(row.wrapRate)}</td><td className="numeric">{row.wrapThreshold.toFixed(2)}</td><td>{formatDurationSeconds(row.netCountedSeconds).hms}</td><td>{formatDurationSeconds(row.pausedSeconds).hms}</td><td className="numeric">{rate(row.pauseRate)}</td><td className="numeric">{row.pauseThreshold.toFixed(2)}</td><td>{row.triggeredFlags.join(", ") || "None"}</td><td><StatusBadge tone={row.triggeredFlags.length ? "danger" : "success"}>{row.status}</StatusBadge></td></tr>)}</tbody></table></TableScroll>
      </section>
    </div>
  );
}
