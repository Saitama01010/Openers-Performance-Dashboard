import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { COACHING_CATEGORY_LABELS, OVERALL_IMPROVEMENT_LABELS, type ImprovementComponent, type OverallImprovementStatus } from "@/coaching/domain";
import { getCoachingImprovementData } from "@/coaching/improvement-data";
import { CoachingSummaryCards, type CoachingMetricCard } from "@/components/dashboard/coaching/coaching-summary-cards";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function componentText(component: ImprovementComponent, kind: "count" | "rate") { if (!component.available || component.score === null) return "Unavailable"; const before = kind === "count" ? component.before : component.before?.toFixed(2); const after = kind === "count" ? component.after : component.after?.toFixed(2); return `${before} → ${after} (${component.label ?? `${component.score.toFixed(1)}%`})`; }
function tone(status: OverallImprovementStatus) { if (status === "improved") return "green"; if (status === "declined" || status === "source_unavailable") return "red"; return "orange"; }
function exportHref(params: Record<string, string | string[] | undefined>) { const next = new URLSearchParams(); for (const [key, raw] of Object.entries(params)) { const value = first(raw); if (value && key !== "page") next.set(key, value); } return `/api/coaching/improvement/export?${next}`; }

export default async function CoachingImprovementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getCurrentUser(); if (!actor) redirect("/login"); if (actor.role === "agent") redirect("/flags");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const teamId = first(params.team)?.trim() || undefined; const managerId = first(params.manager)?.trim() || undefined;
  const data = await getCoachingImprovementData(actor, { dateRange, teamId, managerId });
  const declined = data.improvement.filter((row) => row.overall.status === "declined").length;
  const focus = new Map<string, number>(); for (const row of data.improvement) focus.set(row.category, (focus.get(row.category) ?? 0) + 1);
  const focusRows = Array.from(focus.entries()).sort((a, b) => b[1] - a[1]); const focusMax = Math.max(1, ...focusRows.map((row) => row[1]));
  const cards: CoachingMetricCard[] = [
    { label: "Overdue Coaching", value: null, previous: null, icon: "freshness", tone: "orange", trend: [], unavailableLabel: "Cadence is not configured" },
    { label: "Agents Needing Support", value: declined, previous: null, icon: "agent", tone: "orange", trend: [{ date: dateRange.label, value: declined }] },
    { label: "Critical Cases", value: null, previous: null, icon: "info", tone: "orange", trend: [], unavailableLabel: "Critical threshold is not configured" },
    { label: "Avg. Days Since Coaching", value: null, previous: null, icon: "calendar", tone: "purple", trend: [], unavailableLabel: "Cadence is not configured" },
  ];
  return <>
    <div className={styles.header}><div><h2 className={styles.eyebrow}>Improvement</h2><p className={styles.muted}>Compare equal-weight outcomes around coaching sessions without inventing cadence or severity rules.</p></div><div className={styles.headerActions}><DashboardDateFilter ariaLabel="Coaching improvement date filter" pathname="/coaching/improvement" range={dateRange} /><Link className={styles.export} download href={exportHref(params)}><DashboardIcon name="import" />Export</Link></div></div>
    <CoachingSummaryCards cards={cards} columns={4} />
    <div className={styles.notice}><strong>Coaching cadence is not configured.</strong> Overdue, due-soon, critical, and average-days status remain N/A until an authoritative cadence and severity policy exists. Outcome comparisons below continue to use real session and performance data.</div>
    <form className={styles.filters} method="get"><input name="range" type="hidden" value={dateRange.key} />{dateRange.from ? <input name="from" type="hidden" value={dateRange.from} /> : null}{dateRange.to ? <input name="to" type="hidden" value={dateRange.to} /> : null}<label>Team<select defaultValue={teamId ?? ""} name="team"><option value="">All teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{actor.role === "admin" ? <label>Manager<select defaultValue={managerId ?? ""} name="manager"><option value="">All managers</option>{data.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label> : null}<button className={styles.secondaryButton} type="submit">Update</button><Link className={styles.reset} href={`/coaching/improvement?range=${dateRange.key}`}>Clear filters</Link></form>
    {data.closedSource.status === "unavailable" ? <div className={styles.notice}><strong>Closed source unavailable.</strong> {data.closedSource.message} Overall improvement is not fabricated from a zero-deal assumption.</div> : null}
    <div className={styles.insightGrid}><section className={styles.panel} aria-labelledby="status-distribution-title"><header className={styles.panelHeader}><div><h2 id="status-distribution-title">Coaching status distribution</h2><p>Cadence-based statuses require configured policy</p></div></header><div className={styles.donutBody}><div className={styles.donut}><span><strong>N/A</strong>Not configured</span></div><p className={styles.muted}>No overdue, due-soon, or up-to-date classification is shown because the application has no authoritative coaching cadence configuration.</p></div></section><section className={styles.panel} aria-labelledby="focus-areas-title"><header className={styles.panelHeader}><div><h2 id="focus-areas-title">Top coaching focus areas</h2><p>Latest selected coaching sessions by agent</p></div></header>{focusRows.length === 0 ? <p className={styles.empty}>No coaching focus data is available for this scope.</p> : <ul className={styles.focusList}>{focusRows.map(([item, count]) => <li key={item}><span>{COACHING_CATEGORY_LABELS[item as keyof typeof COACHING_CATEGORY_LABELS]}</span><span className={styles.focusBar}><i style={{ width: `${(count / focusMax) * 100}%` }} /></span><strong>{count}</strong></li>)}</ul>}</section></div>
    <section className={styles.panel} aria-labelledby="improvement-results-title"><header className={styles.panelHeader}><div><h2 id="improvement-results-title">Agent improvement outcomes</h2><p>Seven complete days before versus seven complete days after; coaching date excluded.</p></div><span className={styles.muted}>{data.improvement.length} coached agents</span></header><div className={styles.tableScroll}><table className={styles.table}><caption>Equal-weight coaching improvement results</caption><thead><tr><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Coach</th><th scope="col">Main Focus</th><th scope="col">Coaching Date</th><th scope="col">Closed-deal Change</th><th scope="col">Wrap-efficiency Change</th><th scope="col">Pause-efficiency Change</th><th scope="col">Outcome</th></tr></thead><tbody>{data.improvement.length === 0 ? <tr><td className={styles.empty} colSpan={9}>No coaching session in this period has an improvement record.</td></tr> : data.improvement.map((row) => <tr key={`${row.agentId}:${row.sessionDate}`}><th scope="row">{row.agentName}</th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td>{row.coachName}</td><td><span className={styles.badge}>{COACHING_CATEGORY_LABELS[row.category]}</span></td><td>{row.sessionDate}</td><td>{componentText(row.components.closedDeals, "count")}</td><td>{componentText(row.components.wrapEfficiency, "rate")}</td><td>{componentText(row.components.pauseEfficiency, "rate")}</td><td><span className={styles.badge} data-tone={tone(row.overall.status)}>{OVERALL_IMPROVEMENT_LABELS[row.overall.status]}</span></td></tr>)}</tbody></table></div></section>
  </>;
}
