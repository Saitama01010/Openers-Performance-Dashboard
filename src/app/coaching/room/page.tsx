import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { getCoachingRoomData, getCoachingSummaryData } from "@/coaching/data";
import { COACHING_CATEGORIES, COACHING_CATEGORY_LABELS, type CoachingCategory } from "@/coaching/domain";
import { CoachingSessionComposer } from "@/components/dashboard/coaching/coaching-session-composer";
import { CoachingSummaryCards, type CoachingMetricCard } from "@/components/dashboard/coaching/coaching-summary-cards";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { Badge } from "@/components/ui/base-badge";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function category(value?: string): CoachingCategory | undefined { return COACHING_CATEGORIES.includes(value as CoachingCategory) ? value as CoachingCategory : undefined; }
function href(params: Record<string, string | string[] | undefined>, page: number) { const next = new URLSearchParams(); for (const [key, raw] of Object.entries(params)) { const value = first(raw); if (value && key !== "page") next.set(key, value); } next.set("page", String(page)); return `/coaching/room?${next}`; }
function exportHref(params: Record<string, string | string[] | undefined>) { const next = new URLSearchParams(); for (const [key, raw] of Object.entries(params)) { const value = first(raw); if (value && key !== "page") next.set(key, value); } return `/api/coaching/sessions/export?${next}`; }

export default async function CoachingRoomPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getCurrentUser(); if (!actor) redirect("/login"); if (actor.role === "agent") redirect("/flags");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const page = Math.max(1, Math.floor(Number(first(params.page)) || 1));
  const selectedCategory = category(first(params.category));
  const filters = { coachProfileId: actor.role === "admin" ? first(params.coach)?.trim() || undefined : undefined, teamId: first(params.team)?.trim() || undefined, agentProfileId: first(params.agent)?.trim() || undefined, category: selectedCategory };
  const [data, summary] = await Promise.all([getCoachingRoomData(actor, { ...filters, dateRange, page, pageSize: 10 }), getCoachingSummaryData(actor, { dateRange, filters })]);
  const totalPages = Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize));
  const trend = (key: "sessions" | "agents" | "actions") => summary.current.trend.map((point) => ({ date: point.date, value: point[key] }));
  const cards: CoachingMetricCard[] = [
    { label: "Active Sessions", value: null, previous: null, icon: "users", tone: "blue", trend: [], unavailableLabel: "Session lifecycle is not tracked" },
    { label: "Completion Rate", value: null, previous: null, icon: "permissions", tone: "green", trend: [], unavailableLabel: "No session status model" },
    { label: "Actions Assigned", value: summary.current.actionsAssigned, previous: summary.comparison?.actionsAssigned ?? null, comparisonLabel: summary.comparisonLabel, icon: "audit", tone: "orange", trend: trend("actions") },
    { label: "Recent Sessions", value: summary.current.sessionsCompleted, previous: summary.comparison?.sessionsCompleted ?? null, comparisonLabel: summary.comparisonLabel, icon: "freshness", tone: "purple", trend: trend("sessions") },
  ];
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  return <>
    <div className={styles.header}><div><h2 className={styles.eyebrow}>Coaching Room</h2><p className={styles.muted}>Past sessions appear once, with every in-scope participant grouped together.</p></div><div className={styles.headerActions}><DashboardDateFilter ariaLabel="Coaching Room date filter" pathname="/coaching/room" range={dateRange} /><Link className={styles.export} download href={exportHref(params)}><DashboardIcon name="import" />Export</Link></div></div>
    <CoachingSummaryCards cards={cards} columns={4} />
    <form className={styles.filters} method="get"><input name="range" type="hidden" value={dateRange.key} />{dateRange.from ? <input name="from" type="hidden" value={dateRange.from} /> : null}{dateRange.to ? <input name="to" type="hidden" value={dateRange.to} /> : null}
      {actor.role === "admin" ? <label>Coach<select defaultValue={filters.coachProfileId ?? ""} name="coach"><option value="">All coaches</option>{data.coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label> : null}
      <label>Team<select defaultValue={filters.teamId ?? ""} name="team"><option value="">All teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>Agent<select defaultValue={filters.agentProfileId ?? ""} name="agent"><option value="">All agents</option>{data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      <label>Category<select defaultValue={selectedCategory ?? ""} name="category"><option value="">All categories</option>{COACHING_CATEGORIES.map((item) => <option key={item} value={item}>{COACHING_CATEGORY_LABELS[item]}</option>)}</select></label>
      <button className={styles.secondaryButton} type="submit">Update</button><Link className={styles.reset} href={`/coaching/room?range=${dateRange.key}`}>Clear filters</Link>
    </form>
    <CoachingSessionComposer actorId={actor.id} actorRole={actor.role} coaches={data.coaches} today={dateKeyInTimeZone(new Date(), timeZone)} />
    <section className={styles.panel} aria-labelledby="past-sessions-title"><header className={styles.panelHeader}><div><h2 id="past-sessions-title">Past coaching sessions</h2><p>Newest grouped sessions first</p></div><span className={styles.muted}>{data.pagination.total} sessions</span></header><div className={styles.tableScroll}><table className={styles.table}><caption>Past coaching sessions and grouped participants</caption><thead><tr><th scope="col">Session Date</th><th scope="col">Coach</th><th scope="col">Category</th><th scope="col">Participants</th><th scope="col">Coached Agents</th><th scope="col">Coaching Note</th><th scope="col">Created</th></tr></thead><tbody>{data.rows.length === 0 ? <tr><td className={styles.empty} colSpan={7}>No coaching sessions match the authorized scope and filters.</td></tr> : data.rows.map((row) => <tr key={row.id}><td>{row.sessionDate}</td><th scope="row">{row.coachName}</th><td><Badge appearance="light" size="xs" variant="primary">{COACHING_CATEGORY_LABELS[row.category]}</Badge></td><td><ul className={styles.nameList}>{row.participants.map((participant) => <li key={participant.id}>{participant.name} · {participant.teamName}</li>)}</ul></td><td className={styles.numeric}>{row.participants.length}</td><td>{row.note ?? "—"}</td><td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(row.createdAt))}</td></tr>)}</tbody></table></div><footer className={styles.footer}><span>Showing {data.rows.length} of {data.pagination.total} sessions</span><nav aria-label="Coaching session pages" className={styles.pagination}>{page > 1 ? <Link href={href(params, page - 1)}>Previous</Link> : null}<span aria-current="page">{page}</span>{page < totalPages ? <Link href={href(params, page + 1)}>Next</Link> : null}</nav></footer></section>
  </>;
}
