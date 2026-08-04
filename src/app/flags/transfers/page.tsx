import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { resolveWeekWindow } from "@/coaching/week";
import {
  EmptyTableRow,
  StatusBanner,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { getTransferFlagsData } from "@/flags/data";
import {
  TRANSFER_FLAG_LABELS,
  type TransferFlagClassification,
} from "@/flags/domain";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function classification(value: string | undefined) {
  return ["strong", "improvement", "none"].includes(value ?? "")
    ? (value as TransferFlagClassification)
    : undefined;
}

export default async function TransferFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const week = resolveWeekWindow(first(params.week));
  const data = await getTransferFlagsData(actor, {
    week,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
    profileId: first(params.profile)?.trim() || undefined,
    query: first(params.q)?.trim() || undefined,
    classification: classification(first(params.flag)),
  });
  const ownRow = actor.role === "agent" ? data.rows[0] : null;

  return (
    <div className="feature-view">
      <div className="feature-view__heading"><div><h2>Transfer Flags</h2><p>These flags use weekly closed-deal counts from matched Closed worksheet deals: 0–1 Strong, 2 Improvement, 3+ no flag.</p></div>{actor.role === "agent" ? <form><label className="ui-label">Selected week<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label><button className="ui-button ui-button--secondary">View week</button></form> : null}</div>
      {data.source.status === "unavailable" ? <StatusBanner tone="danger"><strong>Closed source unavailable.</strong> {data.source.message} No zero-deal flags were generated.</StatusBanner> : null}
      {actor.role === "agent" ? (
        ownRow ? <section className="ui-card ui-card--padded feature-self-card"><div className="feature-self-card__header"><div><h2>{ownRow.agentName}</h2><p>{week.start} – {week.end}</p></div>{ownRow.classification ? <StatusBadge tone={ownRow.classification === "none" ? "success" : ownRow.classification === "strong" ? "danger" : "warning"}>{TRANSFER_FLAG_LABELS[ownRow.classification]}</StatusBadge> : <StatusBadge tone="danger">Source unavailable</StatusBadge>}</div><dl className="feature-metric-list"><div><dt>Weekly closed deals</dt><dd>{ownRow.closedDeals ?? "Unavailable"}</dd></div><div><dt>Flag classification</dt><dd>{ownRow.classification ? TRANSFER_FLAG_LABELS[ownRow.classification] : "Unavailable"}</dd></div><div><dt>Selected week</dt><dd>{week.start} – {week.end}</dd></div><div><dt>Closed source health</dt><dd>{data.source.status}</dd></div></dl>{ownRow.classification === "none" ? <p className="feature-no-flags">No active flags</p> : null}</section> : <section className="ui-card ui-card--padded feature-empty"><h2>No active flags</h2><p>Your active profile is not available for this week.</p></section>
      ) : <>
        <form className="feature-filter-grid" method="get"><label className="ui-label">Week containing<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label><label className="ui-label">Team<select className="ui-select" defaultValue={first(params.team) ?? ""} name="team"><option value="">All authorized teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{actor.role === "admin" ? <label className="ui-label">Manager<select className="ui-select" defaultValue={first(params.manager) ?? ""} name="manager"><option value="">All managers</option>{data.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label> : null}<label className="ui-label">Agent search<input className="ui-input" defaultValue={first(params.q) ?? ""} name="q" type="search" /></label><label className="ui-label">Flag type<select className="ui-select" defaultValue={first(params.flag) ?? ""} name="flag"><option value="">All types</option><option value="strong">Strong Flag</option><option value="improvement">Flag for Improvement</option><option value="none">No flag</option></select></label><div className="feature-filter-grid__actions"><button className="ui-button ui-button--primary">Apply filters</button><Link className="ui-button ui-button--secondary" href="/flags/transfers">Clear</Link></div></form>
        {data.summary ? <dl className="feature-summary"><div><dt>Scoped agents</dt><dd>{data.summary.scopedAgents}</dd></div><div><dt>Strong flags</dt><dd>{data.summary.strongFlags}</dd></div><div><dt>Improvement flags</dt><dd>{data.summary.improvementFlags}</dd></div><div><dt>No flags</dt><dd>{data.summary.noFlags}</dd></div></dl> : null}
        <section className="ui-card"><div className="ui-card__header"><div><h2 className="ui-card__title">Matched Closed-deal flags</h2><p className="ui-card__subtitle">Active agents remain visible when the valid source returns zero matched deals.</p></div></div><TableScroll label="Transfer flag results"><table className="ui-table"><caption>Weekly transfer flags from matched Closed deals</caption><thead><tr><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Closed deals this week</th><th scope="col">Flag type</th><th scope="col">Week</th><th scope="col">Source status</th></tr></thead><tbody>{data.rows.length === 0 ? <EmptyTableRow colSpan={6} title="No transfer flag results" description="No active agents match the selected filters." /> : data.rows.map((row) => <tr key={row.agentId}><th scope="row">{row.agentName}</th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td className="numeric">{row.closedDeals ?? "Unavailable"}</td><td>{row.classification ? <StatusBadge tone={row.classification === "none" ? "success" : row.classification === "strong" ? "danger" : "warning"}>{TRANSFER_FLAG_LABELS[row.classification]}</StatusBadge> : "Unavailable"}</td><td>{week.start} – {week.end}</td><td>{row.sourceStatus}</td></tr>)}</tbody></table></TableScroll></section>
      </>}
    </div>
  );
}
