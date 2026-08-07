import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { getCoachingLeaderboardData, getCoachingSummaryData, type CoachingLeaderboardSort } from "@/coaching/data";
import { CoachingSummaryCards, type CoachingMetricCard } from "@/components/dashboard/coaching/coaching-summary-cards";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function href(params: Record<string, string | string[] | undefined>, changes: Record<string, string | number | null>) { const next = new URLSearchParams(); for (const [key, raw] of Object.entries(params)) { const value = first(raw); if (value) next.set(key, value); } for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, String(value)); } return `/coaching/leaderboard?${next}`; }

export default async function CoachingLeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/coaching/room");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const requestedSort = first(params.sort);
  const sort: CoachingLeaderboardSort = ["coverage", "coached", "manager"].includes(requestedSort ?? "") ? requestedSort as CoachingLeaderboardSort : "coverage";
  const direction: "asc" | "desc" = first(params.direction) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.floor(Number(first(params.page)) || 1));
  const pageSize = 10;
  const filters = { managerId: first(params.manager)?.trim() || undefined, teamId: first(params.team)?.trim() || undefined, sort, direction };
  const [data, summary] = await Promise.all([getCoachingLeaderboardData(actor, { dateRange, ...filters }), getCoachingSummaryData(actor, { dateRange, filters: { teamId: filters.teamId, coachProfileId: filters.managerId } })]);
  const totalPages = Math.max(1, Math.ceil(data.rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = data.rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const trend = (key: "sessions" | "agents" | "actions") => summary.current.trend.map((point) => ({ date: point.date, value: point[key] }));
  const cards: CoachingMetricCard[] = [
    { label: "Sessions Completed", value: summary.current.sessionsCompleted, previous: summary.comparison?.sessionsCompleted ?? null, comparisonLabel: summary.comparisonLabel, icon: "coaching", tone: "blue", trend: trend("sessions") },
    { label: "Agents Coached", value: summary.current.agentsCoached, previous: summary.comparison?.agentsCoached ?? null, comparisonLabel: summary.comparisonLabel, icon: "users", tone: "green", trend: trend("agents") },
    { label: "Actions Assigned", value: summary.current.actionsAssigned, previous: summary.comparison?.actionsAssigned ?? null, comparisonLabel: summary.comparisonLabel, icon: "audit", tone: "purple", trend: trend("actions") },
    { label: "Actions Completed", value: null, previous: null, icon: "permissions", tone: "green", trend: [], unavailableLabel: "Completion state is not tracked" },
    { label: "Completion Rate", value: null, previous: null, icon: "performance", tone: "orange", trend: [], unavailableLabel: "No authoritative denominator" },
  ];
  return <>
    <div className={styles.header}><div><h2 className={styles.eyebrow}>Manager coaching leaderboard</h2><p className={styles.muted}>Coverage counts distinct currently assigned active agents coached in the selected period.</p></div><div className={styles.headerActions}><DashboardDateFilter ariaLabel="Coaching leaderboard date filter" pathname="/coaching/leaderboard" range={dateRange} /></div></div>
    <CoachingSummaryCards cards={cards} />
    <form className={styles.filters} method="get">
      <input name="range" type="hidden" value={dateRange.key} />{dateRange.from ? <input name="from" type="hidden" value={dateRange.from} /> : null}{dateRange.to ? <input name="to" type="hidden" value={dateRange.to} /> : null}
      <label>Manager<select defaultValue={filters.managerId ?? ""} name="manager"><option value="">All managers</option>{data.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
      <label>Team<select defaultValue={filters.teamId ?? ""} name="team"><option value="">All teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>Coverage metric<select defaultValue={sort} name="sort"><option value="coverage">Coverage</option><option value="coached">Coached agents</option><option value="manager">Manager</option></select></label>
      <label>Sort direction<select defaultValue={direction} name="direction"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <button className={styles.secondaryButton} type="submit">Update</button><Link className={styles.reset} href={`/coaching/leaderboard?range=${dateRange.key}`}>Reset filters</Link>
    </form>
    <section className={styles.panel} aria-labelledby="manager-leaderboard-title"><header className={styles.panelHeader}><div><h2 id="manager-leaderboard-title">Manager coaching leaderboard</h2><p>Repeated coaching counts once per agent; a grouped session remains one completed session.</p></div><span className={styles.muted}>Showing {(safePage - 1) * pageSize + (rows.length ? 1 : 0)}–{(safePage - 1) * pageSize + rows.length} of {data.rows.length}</span></header><div className={styles.tableScroll}><table className={styles.table}><caption>Manager coaching coverage for the selected period</caption><thead><tr><th scope="col">Rank</th><th scope="col">Manager</th><th scope="col">Teams</th><th scope="col">Assigned Agents</th><th scope="col">Coached Agents</th><th scope="col">Sessions Completed</th><th scope="col">Coverage</th></tr></thead><tbody>{rows.length === 0 ? <tr><td className={styles.empty} colSpan={7}>No active manager matches the authorized filters.</td></tr> : rows.map((row, index) => { const rank = (safePage - 1) * pageSize + index + 1; const percentage = row.coveragePercentage === null ? null : Math.min(100, Math.max(0, row.coveragePercentage)); return <tr key={row.managerId}><td><span className={styles.rank} data-medal={rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : undefined}>{rank}</span></td><th scope="row"><span className={styles.manager}><span className={styles.avatar}>{initials(row.managerName)}</span>{row.managerName}</span></th><td>{row.teamNames.join(", ") || "No active teams"}</td><td className={styles.numeric}>{row.assignedAgents}</td><td className={styles.numeric}>{row.coachedAgents}</td><td className={styles.numeric}>{row.sessionsCompleted}</td><td>{percentage === null ? "N/A" : <div aria-label={`${row.managerName} coaching coverage`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Number(percentage.toFixed(1))} className={styles.progress} role="progressbar"><strong>{percentage.toFixed(1)}%</strong><span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ width: `${percentage}%` }} /></span></div>}</td></tr>; })}</tbody></table></div><footer className={styles.footer}><span>Page {safePage} of {totalPages}</span><nav aria-label="Leaderboard pages" className={styles.pagination}>{safePage > 1 ? <Link href={href(params, { page: safePage - 1 })}>‹</Link> : null}{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((item) => <Link aria-current={item === safePage ? "page" : undefined} href={href(params, { page: item })} key={item}>{item}</Link>)}{safePage < totalPages ? <Link href={href(params, { page: safePage + 1 })}>›</Link> : null}</nav></footer></section>
  </>;
}
