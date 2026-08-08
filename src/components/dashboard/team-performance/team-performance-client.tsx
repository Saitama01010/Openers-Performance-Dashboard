"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { AreaTrend } from "@/components/ui/area-trend";
import {
  metricValue,
  type TeamPerformanceData,
  type TeamPerformanceMetric,
  type TeamPerformanceRow,
  type TeamPerformanceSortKey,
} from "@/teams/performance-analytics";
import styles from "@/components/dashboard/team-performance/team-performance.module.css";

const METRICS: Array<{ value: TeamPerformanceMetric; label: string }> = [
  { value: "transfers", label: "Transfers" },
  { value: "closed-deals", label: "Closed Deals" },
  { value: "conversion", label: "Conversion" },
];
const SORTS: Array<{ value: TeamPerformanceSortKey; label: string }> = [
  ...METRICS,
  { value: "active-agents", label: "Active agents" },
  { value: "logged-in", label: "Avg logged-in time" },
  { value: "talk-percentage", label: "Avg talk %" },
];
const COLORS = ["#1769ef", "#22a65a", "#7c3aed", "#f59e0b", "#e24a43"];

function formatNumber(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function metricLabel(metric: TeamPerformanceMetric) {
  return METRICS.find((item) => item.value === metric)?.label ?? "Transfers";
}

function displayMetric(row: TeamPerformanceRow, metric: TeamPerformanceMetric) {
  const value = metricValue(row, metric);
  return metric === "conversion" ? formatPercent(value) : formatNumber(value);
}

function change(current: number | null, previous: number | null, points = false) {
  if (current === null || previous === null) return null;
  if (points) return { value: current - previous, label: `${Math.abs(current - previous).toFixed(1)} pp` };
  if (previous === 0) return null;
  const value = ((current - previous) / previous) * 100;
  return { value, label: `${Math.abs(value).toFixed(1)}%` };
}

function Comparison({ current, previous, points = false }: { current: number | null; previous: number | null; points?: boolean }) {
  const result = change(current, previous, points);
  if (!result) return <span className={styles.noComparison}>No period comparison</span>;
  const direction = result.value > 0 ? "up" : result.value < 0 ? "down" : "flat";
  return <span className={styles.comparison} data-direction={direction}>{direction === "up" ? "↑" : direction === "down" ? "↓" : "—"} {result.label} vs prior period</span>;
}

function MiniTrend({ row, metric, color = "#1769ef" }: { row: TeamPerformanceRow; metric: TeamPerformanceMetric; color?: string }) {
  const points = row.trend.map((point) => {
    const value = metric === "transfers" ? point.transfers : metric === "closed-deals" ? point.closedDeals : point.conversion;
    return { label: point.date, value };
  });
  return (
    <AreaTrend
      ariaLabel={`${metricLabel(metric)} trend for ${row.teamName}`}
      className={styles.miniTrend}
      color={color}
      emptyLabel="No trend"
      formatValue={(value) => metric === "conversion" ? formatPercent(value) : formatNumber(value)}
      points={points}
    />
  );
}

function KpiCard({ label, value, icon, color, children }: { label: string; value: string; icon: "teams" | "calls" | "leaderboard" | "performance" | "freshness"; color: string; children: React.ReactNode }) {
  return <article className={styles.kpiCard}><span className={styles.kpiIcon} style={{ backgroundColor: `${color}16`, color }}><DashboardIcon name={icon} /></span><div><span>{label}</span><strong>{value}</strong>{children}</div></article>;
}

function Standings({ data, navigate }: { data: TeamPerformanceData; navigate: (changes: Record<string, string | null>) => void }) {
  const visible = data.standings.slice(0, 8);
  const maximum = Math.max(1, ...visible.map((row) => metricValue(row, data.filters.metric) ?? 0));
  return <section className={styles.card} aria-labelledby="team-standings-title"><header className={styles.cardHeader}><div><h2 id="team-standings-title">Team standings</h2><p>Ranked by {metricLabel(data.filters.metric).toLocaleLowerCase("en-US")}</p></div><div aria-label="Standings metric" className={styles.tabs} role="group">{METRICS.map((metric) => <button aria-pressed={data.filters.metric === metric.value} key={metric.value} onClick={() => navigate({ metric: metric.value, sort: metric.value })} type="button">{metric.label}</button>)}</div></header><div className={styles.barChart}>{visible.length === 0 ? <Empty title="No team performance is available" detail="No active teams are visible in your reporting scope." /> : visible.map((row, index) => { const value = metricValue(row, data.filters.metric); return <button className={styles.barRow} key={row.teamId} onClick={() => navigate({ teamId: row.teamId })} type="button"><span className={styles.rank}>{index + 1}</span><span className={styles.barName}>{row.teamName}</span><span className={styles.barTrack}><span style={{ width: value === null ? "0" : `${Math.max(2, (value / maximum) * 100)}%` }} /></span><strong>{displayMetric(row, data.filters.metric)}</strong></button>; })}</div></section>;
}

function Spotlight({ data }: { data: TeamPerformanceData }) {
  const team = data.spotlight;
  if (!team) return <section className={styles.card}><Empty title="No team spotlight" detail="No active team is available in this reporting scope." /></section>;
  const attainment = team.targetValue && actualFor(team, data.filters.metric) !== null
    ? ((actualFor(team, data.filters.metric) ?? 0) / team.targetValue) * 100
    : null;
  const params = new URLSearchParams({ team: team.teamId, range: data.range.key });
  if (data.range.from) params.set("from", data.range.from);
  if (data.range.to) params.set("to", data.range.to);
  return <section className={styles.spotlight} aria-labelledby="team-spotlight-title"><header><div><span>Team spotlight</span><h2 id="team-spotlight-title">{team.teamName}</h2><p>{team.healthLabel}</p></div><span className={styles.teamMark}><DashboardIcon name="teams" /></span></header><div className={styles.spotlightMetrics}><span><strong>{formatNumber(team.transfers)}</strong>Transfers</span><span><strong>{formatNumber(team.closedDeals)}</strong>Closed deals</span><span><strong>{formatPercent(team.conversion)}</strong>Conversion</span></div><div className={styles.attainment}><span className={styles.attainmentRing} style={{ "--attainment": `${Math.min(100, attainment ?? 0) * 3.6}deg` } as React.CSSProperties}><strong>{attainment === null ? "N/A" : `${attainment.toFixed(0)}%`}</strong><small>{attainment === null ? "No target" : "Target"}</small></span><p>{team.targetValue === null ? "No effective target is configured for this metric." : `${displayTarget(team.targetValue, data.filters.metric)} ${metricLabel(data.filters.metric).toLocaleLowerCase("en-US")} target`}</p></div><Link className={styles.drillLink} href={`/agents?${params.toString()}`}>View team agents <DashboardIcon name="arrowRight" /></Link></section>;
}

function actualFor(row: TeamPerformanceRow, metric: TeamPerformanceMetric) {
  return metric === "transfers" ? row.transfers : metric === "closed-deals" ? row.closedDeals : row.conversion;
}

function displayTarget(value: number, metric: TeamPerformanceMetric) {
  return metric === "conversion" ? `${value.toFixed(1)}%` : formatNumber(value);
}

function Attention({ data, navigate }: { data: TeamPerformanceData; navigate: (changes: Record<string, string | null>) => void }) {
  const configured = data.healthMix.filter((item) => item.health === "healthy" || item.health === "under-target").reduce((total, item) => total + item.count, 0);
  return <section className={styles.attention} aria-labelledby="attention-title"><header><DashboardIcon name="info" /><h2 id="attention-title">Needs attention</h2></header>{data.attention.length > 0 ? <ul>{data.attention.map((team) => <li key={team.teamId}><button onClick={() => navigate({ teamId: team.teamId })} type="button"><span><strong>{team.teamName}</strong><small>{team.healthLabel}</small></span><span><strong>{displayMetric(team, data.filters.metric)}</strong><small>{metricLabel(data.filters.metric)}</small></span></button></li>)}</ul> : <div className={styles.neutralState}><strong>{configured === 0 ? "Health targets are not configured" : "No teams are currently under target"}</strong><span>{configured === 0 ? "Configure an effective team target to enable health classification." : "All teams with configured targets are meeting them for this period."}</span></div>}<button className={styles.attentionLink} onClick={() => navigate({ status: data.attention.length > 0 ? "under-target" : null })} type="button">{data.attention.length > 0 ? "View under-target teams" : "View all teams"} <DashboardIcon name="arrowRight" /></button></section>;
}

function TrendChart({ data }: { data: TeamPerformanceData }) {
  const dates = useMemo(() => [...new Set(data.trendTeams.flatMap((team) => team.trend.map((point) => point.date)))].sort(), [data.trendTeams]);
  const [active, setActive] = useState(Math.max(0, dates.length - 1));
  const values = data.trendTeams.flatMap((team) => team.trend.flatMap((point) => { const value = data.filters.metric === "transfers" ? point.transfers : data.filters.metric === "closed-deals" ? point.closedDeals : point.conversion; return value === null ? [] : [value]; }));
  const maximum = Math.max(1, ...values);
  const width = 760;
  const height = 220;
  const x = (index: number) => 24 + (index / Math.max(1, dates.length - 1)) * (width - 48);
  const y = (value: number) => height - 24 - (value / maximum) * (height - 48);
  const path = (team: TeamPerformanceRow) => dates.flatMap((date, index) => { const point = team.trend.find((item) => item.date === date); const value = point ? data.filters.metric === "transfers" ? point.transfers : data.filters.metric === "closed-deals" ? point.closedDeals : point.conversion : null; return value === null ? [] : [`${x(index)},${y(value)}`]; }).join(" ");
  function setFromPointer(clientX: number, target: SVGSVGElement) { const box = target.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width)); setActive(Math.round(ratio * Math.max(0, dates.length - 1))); }
  return <section className={`${styles.card} ${styles.trends}`} aria-labelledby="trend-title"><header className={styles.cardHeader}><div><h2 id="trend-title">Performance trends</h2><p>Daily {metricLabel(data.filters.metric).toLocaleLowerCase("en-US")} across the leading visible teams</p></div><div className={styles.legend}>{data.trendTeams.map((team, index) => <span key={team.teamId}><i style={{ background: COLORS[index % COLORS.length] }} />{team.teamName}</span>)}</div></header>{dates.length < 2 ? <Empty title="No daily trend is available" detail="The active data does not contain enough dated records for this period." /> : <div className={styles.chartWrap}><svg aria-label={`${metricLabel(data.filters.metric)} daily team trend. Use left and right arrow keys to inspect dates.`} className={styles.lineChart} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); } if (event.key === "ArrowRight") { event.preventDefault(); setActive((value) => Math.min(dates.length - 1, value + 1)); } }} onPointerMove={(event) => setFromPointer(event.clientX, event.currentTarget)} role="img" tabIndex={0} viewBox={`0 0 ${width} ${height}`}>{[0, .25, .5, .75, 1].map((portion) => <line key={portion} x1="24" x2={width - 24} y1={24 + portion * (height - 48)} y2={24 + portion * (height - 48)} />)}{data.trendTeams.map((team, index) => <polyline fill="none" key={team.teamId} points={path(team)} stroke={COLORS[index % COLORS.length]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />)}<line className={styles.crosshair} x1={x(active)} x2={x(active)} y1="18" y2={height - 18} />{data.trendTeams.map((team, index) => { const point = team.trend.find((item) => item.date === dates[active]); const value = point ? data.filters.metric === "transfers" ? point.transfers : data.filters.metric === "closed-deals" ? point.closedDeals : point.conversion : null; return value === null ? null : <circle cx={x(active)} cy={y(value)} fill="#fff" key={team.teamId} r="4" stroke={COLORS[index % COLORS.length]} strokeWidth="2" />; })}</svg><div aria-live="polite" className={styles.chartTooltip}><strong>{dates[active]}</strong>{data.trendTeams.map((team, index) => { const point = team.trend.find((item) => item.date === dates[active]); const value = point ? data.filters.metric === "transfers" ? point.transfers : data.filters.metric === "closed-deals" ? point.closedDeals : point.conversion : null; return <span key={team.teamId}><i style={{ background: COLORS[index % COLORS.length] }} />{team.teamName}<b>{data.filters.metric === "conversion" ? formatPercent(value) : formatNumber(value)}</b></span>; })}</div></div>}</section>;
}

function HealthMix({ data }: { data: TeamPerformanceData }) {
  const total = data.kpis.totalTeams;
  const values = Object.fromEntries(data.healthMix.map((item) => [item.health, item.count])) as Record<string, number>;
  const healthyEnd = total ? (values.healthy / total) * 360 : 0;
  const underEnd = total ? healthyEnd + (values["under-target"] / total) * 360 : 0;
  const noTargetEnd = total ? underEnd + (values["not-configured"] / total) * 360 : 0;
  const classified = values.healthy + values["under-target"];
  const background = `conic-gradient(#22a65a 0deg ${healthyEnd}deg, #e24a43 ${healthyEnd}deg ${underEnd}deg, #f59e0b ${underEnd}deg ${noTargetEnd}deg, #9aa6ba ${noTargetEnd}deg 360deg)`;
  return <section className={`${styles.card} ${styles.health}`} aria-labelledby="health-title"><header className={styles.cardHeader}><div><h2 id="health-title">Team health mix</h2><p>Only effective configured targets produce health status</p></div></header><div className={styles.healthBody}><div className={styles.donut} style={{ background }}><span><strong>{classified === 0 ? "N/A" : total}</strong><small>{classified === 0 ? "No targets" : "Total teams"}</small></span></div><ul>{data.healthMix.map((item) => <li data-health={item.health} key={item.health}><i /><span>{item.label}</span><strong>{item.count}</strong><small>{total ? `${((item.count / total) * 100).toFixed(0)}%` : "—"}</small></li>)}</ul></div>{classified === 0 ? <p className={styles.healthNote}>Health is intentionally neutral until an administrator configures an effective target.</p> : null}</section>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.empty}><DashboardIcon name="teams" /><strong>{title}</strong><span>{detail}</span></div>;
}

function pageHref(searchParams: URLSearchParams, page: number) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("page", String(page));
  return `/teams/performance?${next.toString()}`;
}

function Directory({ data, exportHref, navigate }: { data: TeamPerformanceData; exportHref: string; navigate: (changes: Record<string, string | null>) => void }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(data.filters.query);
  const rank = new Map(data.standings.map((row, index) => [row.teamId, index + 1]));
  const pages = Array.from({ length: data.pagination.totalPages }, (_, index) => index + 1).filter((page) => page === 1 || page === data.pagination.totalPages || Math.abs(page - data.pagination.page) <= 1);
  return <section className={`${styles.card} ${styles.directory}`} aria-labelledby="directory-title"><header className={styles.cardHeader}><div><h2 id="directory-title">Teams directory</h2><p>Detailed performance metrics for every visible team</p></div></header><form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); navigate({ q: query || null }); }} role="search"><label className={styles.search}><DashboardIcon name="search" /><span className="sr-only">Search team</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search team…" type="search" value={query} /></label><label><span>Status</span><select onChange={(event) => navigate({ status: event.target.value || null })} value={data.filters.status}><option value="">All statuses</option><option value="healthy">Healthy</option><option value="under-target">Under target</option><option value="not-configured">Not configured</option><option value="unavailable">Unavailable</option></select></label><label><span>Metric</span><select onChange={(event) => navigate({ metric: event.target.value, sort: event.target.value })} value={data.filters.metric}>{METRICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Sort by</span><select onChange={(event) => navigate({ sort: event.target.value })} value={data.filters.sortBy}>{SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button aria-label={`Sort ${data.filters.direction === "desc" ? "ascending" : "descending"}`} className={styles.direction} onClick={() => navigate({ direction: data.filters.direction === "desc" ? "asc" : "desc" })} type="button">{data.filters.direction === "desc" ? "↓" : "↑"}</button><button className={styles.searchSubmit} type="submit">Search</button><div aria-label="Directory view" className={styles.viewToggle} role="group"><button aria-pressed={data.filters.view === "overview"} onClick={() => navigate({ view: null })} type="button">Overview</button><button aria-pressed={data.filters.view === "trends"} onClick={() => navigate({ view: "trends" })} type="button">Trends</button></div><Link className={styles.export} download href={exportHref}><DashboardIcon name="import" />Export</Link></form><div className={styles.tableScroll}><table><caption>Role-scoped team performance for {data.range.label}</caption><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Status</th><th scope="col">Active agents</th><th scope="col">Transfers</th><th scope="col">Closed deals</th><th scope="col">Conversion</th><th scope="col">Avg logged-in</th><th scope="col">Avg talk %</th><th scope="col">{data.filters.view === "trends" ? "Trend" : "Target"}</th><th aria-label="Open team agents" scope="col" /></tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={11}><Empty title="No teams match these filters" detail="Change the search or status filter to see more teams." /></td></tr> : data.rows.map((row) => <tr key={row.teamId}><td className={styles.numeric}>{rank.get(row.teamId)}</td><th scope="row"><Link href={`/agents?team=${encodeURIComponent(row.teamId)}`}>{row.teamName}</Link><small>{row.agentsWithDialerData}/{row.activeAgents} with dialer data</small></th><td><span className={styles.healthBadge} data-health={row.health}>{row.healthLabel}</span></td><td className={styles.numeric}>{formatNumber(row.activeAgents)}</td><td className={styles.numeric}>{formatNumber(row.transfers)}</td><td className={styles.numeric}>{formatNumber(row.closedDeals)}</td><td className={styles.numeric}>{formatPercent(row.conversion)}</td><td className={styles.numeric}>{formatDuration(row.averageLoggedInSeconds)}</td><td className={styles.numeric}>{formatPercent(row.averageTalkPercentage)}</td><td>{data.filters.view === "trends" ? <MiniTrend row={row} metric={data.filters.metric} /> : row.targetValue === null ? <span className={styles.noTarget}>Not configured</span> : displayTarget(row.targetValue, data.filters.metric)}</td><td><Link aria-label={`View ${row.teamName} agents`} className={styles.rowAction} href={`/agents?team=${encodeURIComponent(row.teamId)}`}><DashboardIcon name="arrowRight" /></Link></td></tr>)}</tbody></table></div><footer className={styles.tableFooter}><span>Showing {data.pagination.from}–{data.pagination.to} of {data.pagination.totalRows} teams</span><nav aria-label="Teams directory pages">{pages.map((page, index) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 ? <i>…</i> : null}<Link aria-current={page === data.pagination.page ? "page" : undefined} href={pageHref(searchParams, page)}>{page}</Link></span>)}</nav></footer></section>;
}

export function TeamPerformanceClient({ data, exportHref }: { data: TeamPerformanceData; exportHref: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    startTransition(() => router.replace(`/teams/performance?${next.toString()}`, { scroll: false }));
  }
  return <div aria-busy={isPending || undefined} className={styles.content}><section aria-label="Team performance summary" className={styles.kpiGrid}><KpiCard color="#1769ef" icon="teams" label="Total teams" value={formatNumber(data.kpis.totalTeams)}><span className={styles.kpiDetail}>In your active reporting scope</span></KpiCard><KpiCard color="#22a65a" icon="calls" label="Transfers" value={formatNumber(data.kpis.transfers)}><Comparison current={data.kpis.transfers} previous={data.kpis.previousTransfers} /></KpiCard><KpiCard color="#7c3aed" icon="leaderboard" label="Closed deals" value={formatNumber(data.kpis.closedDeals)}><Comparison current={data.kpis.closedDeals} previous={data.kpis.previousClosedDeals} /></KpiCard><KpiCard color="#f97316" icon="performance" label="Conversion rate" value={formatPercent(data.kpis.conversion)}><Comparison current={data.kpis.conversion} points previous={data.kpis.previousConversion} /></KpiCard><KpiCard color="#1558c0" icon="freshness" label="Avg logged-in time" value={formatDuration(data.kpis.averageLoggedInSeconds)}><Comparison current={data.kpis.averageLoggedInSeconds} previous={data.kpis.previousAverageLoggedInSeconds} /></KpiCard></section>{data.sources.message ? <div className={styles.sourceNotice} role="status"><DashboardIcon name="info" /><span>{data.sources.message}</span></div> : null}<div className={styles.topGrid}><Standings data={data} navigate={navigate} /><div className={styles.spotlightGrid}><Spotlight data={data} /><Attention data={data} navigate={navigate} /></div></div><div className={styles.trendGrid}><TrendChart data={data} /><HealthMix data={data} /></div><Directory data={data} exportHref={exportHref} navigate={navigate} />{isPending ? <div aria-live="polite" className={styles.pending}>Updating team performance…</div> : null}</div>;
}
