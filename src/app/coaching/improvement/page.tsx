import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  COACHING_CATEGORY_LABELS,
  OVERALL_IMPROVEMENT_LABELS,
  type ImprovementComponent,
  type OverallImprovementStatus,
} from "@/coaching/domain";
import { getCoachingImprovementData } from "@/coaching/improvement-data";
import { resolveWeekWindow } from "@/coaching/week";
import {
  EmptyTableRow,
  StatusBanner,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function componentText(component: ImprovementComponent, kind: "count" | "rate") {
  if (!component.available || component.score === null) return "Unavailable";
  const before = kind === "count" ? component.before : component.before?.toFixed(2);
  const after = kind === "count" ? component.after : component.after?.toFixed(2);
  return `${before} → ${after} (${component.label ?? `${component.score.toFixed(1)}%`})`;
}

function statusTone(status: OverallImprovementStatus) {
  if (status === "improved") return "success" as const;
  if (status === "declined" || status === "source_unavailable") return "danger" as const;
  if (status === "pending") return "info" as const;
  return "warning" as const;
}

export default async function CoachingImprovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role === "agent") redirect("/flags");
  const params = await searchParams;
  const week = resolveWeekWindow(first(params.week));
  const data = await getCoachingImprovementData(actor, {
    week,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading"><div><h2>Improvement</h2><p>Find overdue agents and compare equal-weight outcomes around the latest coaching session.</p></div></div>
      <form className="feature-filter-grid" method="get">
        <label className="ui-label">Week containing<input className="ui-input" defaultValue={week.start} name="week" type="date" /></label>
        <label className="ui-label">Team<select className="ui-select" defaultValue={first(params.team) ?? ""} name="team"><option value="">All authorized teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        {actor.role === "admin" ? <label className="ui-label">Manager<select className="ui-select" defaultValue={first(params.manager) ?? ""} name="manager"><option value="">All managers</option>{data.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label> : null}
        <div className="feature-filter-grid__actions"><button className="ui-button ui-button--primary">Apply filters</button><Link className="ui-button ui-button--secondary" href="/coaching/improvement">Clear</Link></div>
      </form>
      {data.closedSource.status === "unavailable" ? <StatusBanner tone="danger"><strong>Closed source unavailable.</strong> {data.closedSource.message} Overall improvement is not fabricated from a zero-deal assumption.</StatusBanner> : null}
      <section className="ui-card">
        <div className="ui-card__header"><div><h2 className="ui-card__title">Overdue coaching</h2><p className="ui-card__subtitle">Active agents with no coaching participant record during {week.start} – {week.end}.</p></div></div>
        <TableScroll label="Overdue coaching agents"><table className="ui-table"><caption>Agents overdue for weekly coaching</caption>
          <thead><tr><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Manager</th><th scope="col">Last coaching date</th><th scope="col">Days since last coaching</th><th scope="col">Current-week status</th><th scope="col">Last category</th></tr></thead>
          <tbody>{data.overdue.length === 0 ? <EmptyTableRow colSpan={7} title="No overdue agents" description="Every active agent in this scope has received coaching in the selected week." /> : data.overdue.map((row) => <tr key={row.agentId}><th scope="row">{row.agentName}</th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td>{row.managerNames.join(", ") || "Unassigned"}</td><td>{row.lastCoachingDate ?? "Never"}</td><td className="numeric">{row.daysSinceLastCoaching ?? "—"}</td><td><StatusBadge tone="danger">{row.currentWeekStatus}</StatusBadge></td><td>{row.lastCategory ? COACHING_CATEGORY_LABELS[row.lastCategory] : "—"}</td></tr>)}</tbody>
        </table></TableScroll>
      </section>
      <section className="ui-card">
        <div className="ui-card__header"><div><h2 className="ui-card__title">Improvement after coaching</h2><p className="ui-card__subtitle">Seven complete days before versus seven complete days after; the coaching date is excluded.</p></div></div>
        <TableScroll label="Coaching improvement results"><table className="ui-table feature-table"><caption>Equal-weight coaching improvement results</caption>
          <thead><tr><th scope="col">Agent</th><th scope="col">Coaching</th><th scope="col">Closed-deal change</th><th scope="col">Wrap-efficiency change</th><th scope="col">Pause-efficiency change</th><th scope="col">Overall rate</th><th scope="col">Status</th></tr></thead>
          <tbody>{data.improvement.length === 0 ? <EmptyTableRow colSpan={7} title="No coached agents" description="Improvement results appear after a coaching session is recorded." /> : data.improvement.map((row) => <tr key={`${row.agentId}:${row.sessionDate}`}><th scope="row">{row.agentName}<span className="feature-cell-detail">{row.teamNames.join(", ") || "Unassigned"}</span></th><td>{row.sessionDate}<span className="feature-cell-detail">{COACHING_CATEGORY_LABELS[row.category]} · {row.coachName}</span></td><td>{componentText(row.components.closedDeals, "count")}</td><td>{componentText(row.components.wrapEfficiency, "rate")}</td><td>{componentText(row.components.pauseEfficiency, "rate")}</td><td className="numeric">{row.overall.rate === null ? "—" : `${row.overall.rate.toFixed(1)}%`}</td><td><StatusBadge tone={statusTone(row.overall.status)}>{OVERALL_IMPROVEMENT_LABELS[row.overall.status]}</StatusBadge></td></tr>)}</tbody>
        </table></TableScroll>
      </section>
    </div>
  );
}
