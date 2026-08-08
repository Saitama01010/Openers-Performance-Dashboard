"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import styles from "@/components/dashboard/flags/flags-page.module.css";
import { AreaTrend } from "@/components/ui/area-trend";
import { DonutChart } from "@/components/ui/donut-chart";
import type { getPerformanceFlagsData, getTransferFlagsData } from "@/flags/data";
import { TRANSFER_FLAG_LABELS } from "@/flags/domain";
import { formatDurationSeconds } from "@/import/format";

type PerformanceData = Awaited<ReturnType<typeof getPerformanceFlagsData>>;
type TransferData = Awaited<ReturnType<typeof getTransferFlagsData>>;
type Range = PerformanceData["filters"]["dateRange"];
type Filter = { label: string; name: string; value?: string; options: Array<{ label: string; value: string }> };
type SeriesKey = "wrap" | "pause" | "strong" | "improvement";

const COLORS: Record<SeriesKey, string> = {
  wrap: "#ef4457",
  pause: "#f59a23",
  strong: "#ef4457",
  improvement: "#f59a23",
};

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("en-US");
}

function percent(value: number, total: number) {
  return total === 0 ? "0%" : `${((value / total) * 100).toFixed(1)}%`;
}

function comparison(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  const delta = current - previous;
  const percentage = previous === 0 ? null : (delta / previous) * 100;
  return { delta, percentage };
}

function KpiCard({
  color,
  current,
  icon,
  label,
  previous,
  range,
  scopedAgents,
  source,
  trend,
}: {
  color: string;
  current: number | null;
  icon: DashboardIconName;
  label: string;
  previous?: number;
  range: Range;
  scopedAgents: number | null;
  source: string;
  trend: number[];
}) {
  const change = current === null ? null : comparison(current, previous);
  return (
    <details className={styles.kpiCard} style={{ "--accent": color } as React.CSSProperties}>
      <summary>
        <span className={styles.kpiIcon}><DashboardIcon name={icon} /></span>
        <span className={styles.kpiCopy}>
          <small>{label}</small>
          <strong>{current === null ? "N/A" : number(current)}</strong>
          <span className={styles.kpiComparison} data-direction={change ? (change.delta > 0 ? "up" : change.delta < 0 ? "down" : "flat") : "flat"}>
            {change ? `${change.delta > 0 ? "↑" : change.delta < 0 ? "↓" : "—"} ${Math.abs(change.delta)}${change.percentage === null ? "" : ` (${Math.abs(change.percentage).toFixed(1)}%)`} vs ${range.comparison?.label ?? "prior period"}` : source === "ready" ? "No comparable period" : "Source unavailable"}
          </span>
        </span>
        <AreaTrend
          ariaLabel={`${label} weekly trend`}
          className={styles.sparkline}
          color={color}
          emptyLabel="No trend history"
          interactive={false}
          points={trend.map((value, index) => ({ label: `Period ${index + 1}`, value }))}
        />
      </summary>
      <div className={styles.kpiPopover} role="tooltip">
        <strong>{label}</strong>
        <span>Current <b>{current === null ? "Unavailable" : number(current)}</b></span>
        <span>Previous <b>{previous === undefined ? "Unavailable" : number(previous)}</b></span>
        <span>Absolute delta <b>{change ? `${change.delta >= 0 ? "+" : ""}${change.delta}` : "Unavailable"}</b></span>
        <span>Percentage change <b>{change?.percentage === null || !change ? "Unavailable" : `${change.percentage.toFixed(1)}%`}</b></span>
        <span>Selected range <b>{range.label ?? `${range.from ?? "First record"} – ${range.to ?? "Today"}`}</b></span>
        <span>Agents in scope <b>{scopedAgents === null ? "Private view" : number(scopedAgents)}</b></span>
        <span>Source <b>{source === "ready" ? "Available" : "Unavailable"}</b></span>
      </div>
    </details>
  );
}

function FilterBar({ filters }: { filters: Filter[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  function navigate(name: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value); else next.delete(name);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  function clear() {
    const next = new URLSearchParams();
    for (const key of ["range", "from", "to"]) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  return (
    <div aria-busy={pending || undefined} aria-label="Flag filters" className={styles.filters} role="group">
      {filters.map((filter) => (
        <label key={filter.name}><span>{filter.label}</span><select disabled={pending} onChange={(event) => navigate(filter.name, event.target.value)} value={filter.value ?? ""}>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      ))}
      <button className={styles.clearFilters} disabled={pending} onClick={clear} type="button"><span aria-hidden="true">↻</span> Clear filters</button>
      <span aria-live="polite" className={styles.pending}>{pending ? "Updating…" : ""}</span>
    </div>
  );
}

function Donut({
  active,
  items,
  onActive,
  title,
}: {
  active: SeriesKey | null;
  items: Array<{ key: SeriesKey; label: string; count: number; agents: number }>;
  onActive: (key: SeriesKey | null) => void;
  title: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className={styles.panel} aria-labelledby={`${title.replaceAll(" ", "-")}-title`}>
      <header className={styles.panelHeader}><div><h2 id={`${title.replaceAll(" ", "-")}-title`}>{title}</h2><p>Distribution across authoritative flag categories</p></div><DashboardIcon name="info" /></header>
      {total === 0 ? <EmptyState title="No composition is available" detail="No triggered flags exist for the selected filters and period." /> : (
        <div className={styles.donutBody}>
          <div className={styles.donutWrap}>
            <DonutChart activeSegmentId={active} ariaLabel={`${title}. Use Tab to inspect categories.`} centerClassName={styles.donutCenter} centerContent={<><strong>{active ? number(items.find((item) => item.key === active)?.count ?? total) : number(total)}</strong><small>{active ? items.find((item) => item.key === active)?.label : "Total flags"}</small></>} className={styles.donut} data={items.map((item) => ({ id: item.key, value: item.count, color: COLORS[item.key], label: item.label, accessibleLabel: `${item.label}: ${item.count} flags (${percent(item.count, total)}), ${item.agents} agents` }))} interactiveSegments onSegmentHover={(segment) => onActive((segment?.id as SeriesKey | undefined) ?? null)} onSegmentSelect={(segment) => onActive(active === segment.id ? null : segment.id as SeriesKey)} size={120} strokeWidth={20} />
          </div>
          <ul className={styles.legend}>{items.map((item) => <li key={item.key}><button aria-pressed={active === item.key} onBlur={() => onActive(null)} onClick={() => onActive(active === item.key ? null : item.key)} onFocus={() => onActive(item.key)} onPointerEnter={() => onActive(item.key)} onPointerLeave={() => onActive(null)} type="button"><i style={{ background: COLORS[item.key] }} /><span>{item.label}<small>{item.agents} distinct agents</small></span><strong>{number(item.count)} <small>{percent(item.count, total)}</small></strong></button></li>)}</ul>
        </div>
      )}
    </section>
  );
}

type TrendPoint = { weekStart: string; weekEnd: string; agents: number } & Record<string, string | number>;

function TrendChart({
  activeCategory,
  firstKey,
  firstLabel,
  onCategory,
  points,
  secondKey,
  secondLabel,
  title,
}: {
  activeCategory: SeriesKey | null;
  firstKey: SeriesKey;
  firstLabel: string;
  onCategory: (key: SeriesKey | null) => void;
  points: TrendPoint[];
  secondKey: SeriesKey;
  secondLabel: string;
  title: string;
}) {
  const [index, setIndex] = useState(Math.max(0, points.length - 1));
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ wrap: true, pause: true, strong: true, improvement: true });
  const safeIndex = Math.min(index, Math.max(0, points.length - 1));
  const width = 620;
  const height = 210;
  const maximum = Math.max(1, ...points.flatMap((point) => [Number(point[firstKey] ?? 0), Number(point[secondKey] ?? 0)]));
  const x = (value: number) => 38 + (value / Math.max(1, points.length - 1)) * (width - 62);
  const y = (value: number) => height - 30 - (value / maximum) * (height - 62);
  const line = (key: SeriesKey) => points.map((point, pointIndex) => `${x(pointIndex)},${y(Number(point[key] ?? 0))}`).join(" ");
  function move(clientX: number, target: SVGSVGElement) {
    if (pinned) return;
    const bounds = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setIndex(Math.round(ratio * Math.max(0, points.length - 1)));
  }
  function toggle(key: SeriesKey) {
    const other = key === firstKey ? secondKey : firstKey;
    if (visible[key] && !visible[other]) {
      setVisible((current) => ({ ...current, [firstKey]: true, [secondKey]: true }));
      return;
    }
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  }
  const activePoint = points[safeIndex];
  const previous = safeIndex > 0 ? points[safeIndex - 1] : null;
  const activeTotal = activePoint ? Number(activePoint[firstKey] ?? 0) + Number(activePoint[secondKey] ?? 0) : 0;
  const previousTotal = previous ? Number(previous[firstKey] ?? 0) + Number(previous[secondKey] ?? 0) : null;
  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby={`${title.replaceAll(" ", "-")}-title`}>
      <header className={styles.panelHeader}>
        <div><h2 id={`${title.replaceAll(" ", "-")}-title`}>{title}</h2><p>Independent calendar-week flag counts</p></div>
        <div aria-label={`${title} series`} className={styles.trendLegend} role="group">
          {[[firstKey, firstLabel], [secondKey, secondLabel]].map(([key, label]) => <button aria-pressed={visible[key as SeriesKey]} data-active={activeCategory === key ? "true" : undefined} key={key} onBlur={() => onCategory(null)} onClick={() => toggle(key as SeriesKey)} onFocus={() => onCategory(key as SeriesKey)} onPointerEnter={() => onCategory(key as SeriesKey)} onPointerLeave={() => onCategory(null)} type="button"><i style={{ background: COLORS[key as SeriesKey] }} />{label}</button>)}
          {(!visible[firstKey] || !visible[secondKey]) ? <button className={styles.resetSeries} onClick={() => setVisible((current) => ({ ...current, [firstKey]: true, [secondKey]: true }))} type="button">Reset</button> : null}
        </div>
      </header>
      {points.length === 0 ? <EmptyState title="No weekly trend is available" detail="No historical flag points exist for this selection." /> : (
        <div className={styles.trendBody}>
          <svg
            aria-label={`${title}. Use Left and Right Arrow keys to inspect weeks, Enter to pin, and Escape to close.`}
            className={styles.trendChart}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
              if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(points.length - 1, value + 1)); }
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned((value) => !value); }
              if (event.key === "Escape") { setPinned(false); onCategory(null); }
            }}
            onPointerDown={() => setPinned(true)}
            onPointerMove={(event) => move(event.clientX, event.currentTarget)}
            role="img"
            tabIndex={0}
            viewBox={`0 0 ${width} ${height}`}
          >
            {[0, .25, .5, .75, 1].map((part) => <line className={styles.gridLine} key={part} x1="38" x2={width - 24} y1={28 + part * (height - 58)} y2={28 + part * (height - 58)} />)}
            {visible[firstKey] ? <polyline className={styles.trendLine} data-dimmed={activeCategory && activeCategory !== firstKey ? "true" : undefined} fill="none" points={line(firstKey)} stroke={COLORS[firstKey]} strokeWidth={activeCategory === firstKey ? 3.8 : 2.5} /> : null}
            {visible[secondKey] ? <polyline className={styles.trendLine} data-dimmed={activeCategory && activeCategory !== secondKey ? "true" : undefined} fill="none" points={line(secondKey)} stroke={COLORS[secondKey]} strokeWidth={activeCategory === secondKey ? 3.8 : 2.5} /> : null}
            <line className={styles.crosshair} x1={x(safeIndex)} x2={x(safeIndex)} y1="20" y2={height - 24} />
            {[firstKey, secondKey].map((key) => visible[key] && activePoint ? <circle cx={x(safeIndex)} cy={y(Number(activePoint[key] ?? 0))} fill="#fff" key={key} r={activeCategory === key ? 6 : 4.5} stroke={COLORS[key]} strokeWidth="2.5" /> : null)}
          </svg>
          {activePoint ? <div aria-live="polite" className={styles.chartTooltip}><strong>{activePoint.weekStart} – {activePoint.weekEnd}</strong><span><i style={{ background: COLORS[firstKey] }} />{firstLabel}<b>{activePoint[firstKey]}</b></span><span><i style={{ background: COLORS[secondKey] }} />{secondLabel}<b>{activePoint[secondKey]}</b></span><span>Total flags <b>{activeTotal}</b></span><span>Distinct agents <b>{activePoint.agents}</b></span>{previousTotal === null ? null : <span>Change from prior week <b>{activeTotal - previousTotal >= 0 ? "+" : ""}{activeTotal - previousTotal}</b></span>}<small>{pinned ? "Pinned · press Escape to close" : "Move pointer or use arrow keys"}</small></div> : null}
          <details className={styles.chartData}><summary>Accessible chart data</summary><div><table><caption>{title} data</caption><thead><tr><th>Week</th><th>{firstLabel}</th><th>{secondLabel}</th><th>Agents</th></tr></thead><tbody>{points.map((point) => <tr key={point.weekStart}><th>{point.weekStart} – {point.weekEnd}</th><td>{point[firstKey]}</td><td>{point[secondKey]}</td><td>{point.agents}</td></tr>)}</tbody></table></div></details>
        </div>
      )}
    </section>
  );
}

function TeamRanking({
  activeTeam,
  firstKey,
  firstLabel,
  onTeam,
  range,
  secondKey,
  secondLabel,
  teams,
}: {
  activeTeam: string | null;
  firstKey: string;
  firstLabel: string;
  onTeam: (team: string | null) => void;
  range: Range;
  secondKey: string;
  secondLabel: string;
  teams: Array<{ teamName: string; total: number; agents: number } & Record<string, string | number>>;
}) {
  const visible = teams.slice(0, 6);
  const maximum = Math.max(1, ...visible.map((team) => team.total));
  return (
    <section className={styles.panel} aria-labelledby="most-flagged-teams-title">
      <header className={styles.panelHeader}><div><h2 id="most-flagged-teams-title">Most flagged teams</h2><p>Authorized teams ranked by total triggered flags</p></div><DashboardIcon name="info" /></header>
      {visible.length === 0 ? <EmptyState title="No team ranking is available" detail="No team has a triggered flag for this selection." /> : <div className={styles.teamBars}>{visible.map((team) => <button aria-pressed={activeTeam === team.teamName} data-dimmed={activeTeam && activeTeam !== team.teamName ? "true" : undefined} key={team.teamName} onBlur={() => onTeam(null)} onClick={() => onTeam(activeTeam === team.teamName ? null : team.teamName)} onFocus={() => onTeam(team.teamName)} onPointerEnter={() => onTeam(team.teamName)} onPointerLeave={() => onTeam(null)} type="button"><span>{team.teamName}</span><i><b style={{ width: `${Math.max(4, (team.total / maximum) * 100)}%` }} /></i><strong>{team.total}</strong><em role="tooltip"><b>{team.teamName}</b><span>Total flags {team.total}</span><span>{firstLabel} {team[firstKey]}</span><span>{secondLabel} {team[secondKey]}</span><span>Distinct agents {team.agents}</span><span>{range.label ?? "Selected period"}</span></em></button>)}</div>}
    </section>
  );
}

function EmptyState({ detail, title }: { detail: string; title: string }) {
  return <div className={styles.empty}><DashboardIcon name="flag" /><strong>{title}</strong><span>{detail}</span></div>;
}

function Columns({ columns, onToggle }: { columns: Record<string, boolean>; onToggle: (column: string) => void }) {
  return <details className={styles.columns}><summary><span aria-hidden="true">▦</span> Columns</summary><div>{Object.entries(columns).map(([column, checked]) => <label key={column}><input checked={checked} onChange={() => onToggle(column)} type="checkbox" />{column}</label>)}</div></details>;
}

function Pagination({ pagination }: { pagination: PerformanceData["pagination"] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  function href(page: number) { const next = new URLSearchParams(searchParams.toString()); next.set("page", String(page)); return `${pathname}?${next.toString()}`; }
  function pageSize(value: string) { const next = new URLSearchParams(searchParams.toString()); next.set("pageSize", value); next.delete("page"); router.replace(`${pathname}?${next.toString()}`, { scroll: false }); }
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.total, pagination.page * pagination.pageSize);
  const pages = Array.from({ length: pagination.totalPages }, (_, index) => index + 1).filter((page) => page === 1 || page === pagination.totalPages || Math.abs(page - pagination.page) <= 1);
  return <footer className={styles.tableFooter}><span>Showing {start}–{end} of {pagination.total} results</span><label>Rows per page <select onChange={(event) => pageSize(event.target.value)} value={pagination.pageSize}>{[10, 20, 50].map((value) => <option key={value}>{value}</option>)}</select></label><nav aria-label="Flag results pages"><Link aria-disabled={pagination.page === 1} href={href(Math.max(1, pagination.page - 1))}>‹<span className={styles.srOnly}>Previous</span></Link>{pages.map((page, index) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 ? <i>…</i> : null}<Link aria-current={page === pagination.page ? "page" : undefined} href={href(page)}>{page}</Link></span>)}<Link aria-disabled={pagination.page === pagination.totalPages} href={href(Math.min(pagination.totalPages, pagination.page + 1))}>›<span className={styles.srOnly}>Next</span></Link></nav></footer>;
}

function Preview({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    function close(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); previous?.focus(); };
  }, [onClose]);
  return <div className={styles.previewBackdrop} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="flag-preview-title" aria-modal="true" className={styles.preview} ref={dialogRef} role="dialog"><header><div><span>Flag detail</span><h2 id="flag-preview-title">{title}</h2></div><button aria-label="Close flag preview" onClick={onClose} type="button"><DashboardIcon name="close" /></button></header>{children}</section></div>;
}

function PerformanceTable({
  activeCategory,
  activeTeam,
  data,
  exportHref,
  range,
}: {
  activeCategory: SeriesKey | null;
  activeTeam: string | null;
  data: PerformanceData;
  exportHref: string;
  range: Range;
}) {
  const [selected, setSelected] = useState<PerformanceData["rows"][number] | null>(null);
  const [columns, setColumns] = useState<Record<string, boolean>>({ "Talk Time": true, "Wrap Time": true, "Pause Time": true, Severity: true });
  return <section className={`${styles.panel} ${styles.results}`} aria-labelledby="performance-results-title"><header className={styles.resultsHeader}><div><h2 id="performance-results-title">Triggered performance flags</h2><p>Net counted time is talk + wrap + ready from active dataset versions only.</p></div><div><Link className={styles.export} download href={exportHref}><DashboardIcon name="import" />Export</Link><Columns columns={columns} onToggle={(column) => setColumns((current) => ({ ...current, [column]: !current[column] }))} /></div></header><div className={styles.tableScroll}><table><caption>Agents with triggered performance flags</caption><thead><tr><th>Agent</th><th>Team</th>{columns["Talk Time"] ? <th className={styles.numeric}>Talk Time</th> : null}{columns["Wrap Time"] ? <th className={styles.numeric}>Wrap Time</th> : null}{columns["Pause Time"] ? <th className={styles.numeric}>Pause Time</th> : null}<th>Triggered Flag</th>{columns.Severity ? <th>Severity</th> : null}<th>Action</th></tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={8}><EmptyState title={data.source.status === "unavailable" ? "Performance flags unavailable" : "No active flags"} detail={data.source.message ?? "No agent in the authorized scope triggered a flag in this period."} /></td></tr> : data.rows.map((row) => { const dimmedByTeam = activeTeam && !row.teamNames.includes(activeTeam); const dimmedByCategory = activeCategory === "wrap" && !row.wrapFlag || activeCategory === "pause" && !row.pauseFlag; return <tr data-dimmed={dimmedByTeam || dimmedByCategory ? "true" : undefined} key={row.agentId} tabIndex={0}><th scope="row"><span className={styles.avatar}>{initials(row.agentName)}</span><span>{row.agentName}</span></th><td>{row.teamNames.join(", ") || "Unassigned"}</td>{columns["Talk Time"] ? <td className={styles.numeric}>{formatDurationSeconds(row.talkSeconds).hms}</td> : null}{columns["Wrap Time"] ? <td className={styles.numeric}>{formatDurationSeconds(row.wrapSeconds).hms}</td> : null}{columns["Pause Time"] ? <td className={styles.numeric}>{formatDurationSeconds(row.pausedSeconds).hms}</td> : null}<td><div className={styles.flagBadges}>{row.wrapFlag && row.wrapRate !== null ? <button data-kind="wrap" title={`Actual ${row.wrapRate.toFixed(1)} min per talk hour. Threshold ${row.wrapThreshold.toFixed(1)}. Difference ${(row.wrapRate - row.wrapThreshold).toFixed(1)}. Formula: wrap minutes / talk hours. Period: ${range.label ?? "selected"}.`} type="button">Wrap Time — {row.wrapRate.toFixed(1)} min per talk hour, above the {row.wrapThreshold.toFixed(1)} limit</button> : null}{row.pauseFlag && row.pauseRate !== null ? <button data-kind="pause" title={`Actual ${row.pauseRate.toFixed(1)} min per net counted hour. Threshold ${row.pauseThreshold.toFixed(1)}. Difference ${(row.pauseRate - row.pauseThreshold).toFixed(1)}. Formula: pause minutes / (talk + wrap + ready) hours. Period: ${range.label ?? "selected"}.`} type="button">Pause Time — {row.pauseRate.toFixed(1)} min per net counted hour, above the {row.pauseThreshold.toFixed(1)} limit</button> : null}</div></td>{columns.Severity ? <td><span className={styles.unconfigured} title="No authoritative severity policy is configured; original flag classification is preserved.">Not configured</span></td> : null}<td><button aria-label={`Preview flags for ${row.agentName}`} className={styles.viewAction} onClick={() => setSelected(row)} type="button"><DashboardIcon name="search" /></button></td></tr>; })}</tbody></table></div><Pagination pagination={data.pagination} />{selected ? <Preview onClose={() => setSelected(null)} title={selected.agentName}><div className={styles.previewIdentity}><span className={styles.avatar}>{initials(selected.agentName)}</span><p><strong>{selected.agentName}</strong><small>{selected.teamNames.join(", ") || "Unassigned"}</small></p></div><dl className={styles.previewGrid}><div><dt>Talk time</dt><dd>{formatDurationSeconds(selected.talkSeconds).hms}</dd></div><div><dt>Wrap time</dt><dd>{formatDurationSeconds(selected.wrapSeconds).hms}</dd></div><div><dt>Pause time</dt><dd>{formatDurationSeconds(selected.pausedSeconds).hms}</dd></div><div><dt>Wrap ratio</dt><dd>{selected.wrapRate === null ? "N/A" : `${selected.wrapRate.toFixed(1)} min/hour`}</dd></div><div><dt>Pause ratio</dt><dd>{selected.pauseRate === null ? "N/A" : `${selected.pauseRate.toFixed(1)} min/hour`}</dd></div><div><dt>Period</dt><dd>{range.from ?? "First record"} – {range.to ?? "Today"}</dd></div></dl><div className={styles.previewRules}>{selected.wrapFlag ? <p><b>Wrap threshold</b>{selected.wrapThreshold.toFixed(1)} min per talk hour</p> : null}{selected.pauseFlag ? <p><b>Pause threshold</b>{selected.pauseThreshold.toFixed(1)} min per net counted hour</p> : null}</div><Link className={styles.primaryAction} href={`/agents/${selected.agentId}`}>Open full agent performance <DashboardIcon name="arrowRight" /></Link></Preview> : null}</section>;
}

function TransferTable({ activeCategory, activeTeam, data, exportHref }: { activeCategory: SeriesKey | null; activeTeam: string | null; data: TransferData; exportHref: string }) {
  const [selected, setSelected] = useState<TransferData["rows"][number] | null>(null);
  const [columns, setColumns] = useState<Record<string, boolean>>({ "Week Range": true, Severity: true });
  return <section className={`${styles.panel} ${styles.results}`} aria-labelledby="transfer-results-title"><header className={styles.resultsHeader}><div><h2 id="transfer-results-title">Triggered transfer flags</h2><p>Agents can appear more than once when separate calendar weeks trigger a flag.</p></div><div><Link className={styles.export} download href={exportHref}><DashboardIcon name="import" />Export</Link><Columns columns={columns} onToggle={(column) => setColumns((current) => ({ ...current, [column]: !current[column] }))} /></div></header><div className={styles.tableScroll}><table><caption>Flagged weekly Closed-deal records</caption><thead><tr><th>Agent</th><th>Team</th><th className={styles.numeric}>Closed Deals This Week</th>{columns["Week Range"] ? <th>Week Range</th> : null}<th>Flag Type</th>{columns.Severity ? <th>Severity</th> : null}<th>Action</th></tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={7}><EmptyState title={data.source.status === "unavailable" ? "Transfer flags unavailable" : "No active flags"} detail={data.source.status === "unavailable" ? "The Closed source must load successfully before transfer flags can be evaluated." : "No agent-week record in this period triggered a transfer flag."} /></td></tr> : data.rows.map((row) => { const category = row.classification; const dimmed = activeTeam && !row.teamNames.includes(activeTeam) || activeCategory && activeCategory !== category; return <tr data-dimmed={dimmed ? "true" : undefined} key={`${row.agentId}:${row.week.start}`} tabIndex={0}><th scope="row"><span className={styles.avatar}>{initials(row.agentName)}</span><span>{row.agentName}</span></th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td className={styles.numeric}><strong>{row.closedDeals}</strong></td>{columns["Week Range"] ? <td>{row.week.start} – {row.week.end}</td> : null}<td><button className={styles.transferBadge} data-kind={category} title={`${row.closedDeals} closed deals from ${row.week.start} through ${row.week.end}. Rule: 0–1 = Strong, 2 = Improvement, 3+ = Not Flagged. Result: ${TRANSFER_FLAG_LABELS[category]}.`} type="button">{TRANSFER_FLAG_LABELS[category]}</button></td>{columns.Severity ? <td><span className={styles.unconfigured} title="No separate severity policy is configured; the authoritative transfer classification is shown in Flag Type.">Not configured</span></td> : null}<td><button aria-label={`Preview transfer flag for ${row.agentName}`} className={styles.viewAction} onClick={() => setSelected(row)} type="button"><DashboardIcon name="search" /></button></td></tr>; })}</tbody></table></div><Pagination pagination={data.pagination} />{selected ? <Preview onClose={() => setSelected(null)} title={selected.agentName}><div className={styles.previewIdentity}><span className={styles.avatar}>{initials(selected.agentName)}</span><p><strong>{selected.agentName}</strong><small>{selected.teamNames.join(", ") || "Unassigned"}</small></p></div><dl className={styles.previewGrid}><div><dt>Week range</dt><dd>{selected.week.start} – {selected.week.end}</dd></div><div><dt>Closed deals</dt><dd>{selected.closedDeals}</dd></div><div><dt>Classification</dt><dd>{TRANSFER_FLAG_LABELS[selected.classification]}</dd></div><div><dt>Source</dt><dd>Matched Closed worksheet</dd></div></dl><div className={styles.previewRules}><p><b>Applicable rule</b>{selected.classification === "strong" ? "0–1 closed deals = Strong" : "2 closed deals = Improvement"}</p><p><b>Adjacent weekly status</b>Not loaded in this compact preview</p></div><Link className={styles.primaryAction} href={`/agents/${selected.agentId}`}>Open full agent performance <DashboardIcon name="arrowRight" /></Link></Preview> : null}</section>;
}

export function PerformanceFlagsClient({ data, exportHref, filters }: { data: PerformanceData; exportHref: string; filters: Filter[] }) {
  const [activeCategory, setActiveCategory] = useState<SeriesKey | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const trend = data.analytics.trend;
  const current = data.summary;
  const previous = data.previousSummary;
  return <div className={styles.view}>
    {filters.length ? <FilterBar filters={filters} /> : null}
    {current ? <section aria-label="Performance flag metrics" className={styles.kpiGrid}>
      <KpiCard color="#1769ef" current={current.scopedAgents} icon="users" label="Scoped Agents" previous={previous?.scopedAgents} range={data.filters.dateRange} scopedAgents={current.scopedAgents} source="ready" trend={trend.map((point) => point.agents)} />
      <KpiCard color="#853bea" current={data.source.status === "ready" ? current.flaggedAgents : null} icon="teams" label="Flagged Agents" previous={previous?.flaggedAgents} range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={trend.map((point) => point.agents)} />
      <KpiCard color={COLORS.wrap} current={data.source.status === "ready" ? current.wrapFlags : null} icon="flag" label="Wrap Flags" previous={previous?.wrapFlags} range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={trend.map((point) => point.wrapFlags)} />
      <KpiCard color={COLORS.pause} current={data.source.status === "ready" ? current.pauseFlags : null} icon="pause" label="Pause Flags" previous={previous?.pauseFlags} range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={trend.map((point) => point.pauseFlags)} />
    </section> : <div className={styles.privateNotice}><DashboardIcon name="permissions" /><span>This private view contains only your authorized flag records; organization aggregates are hidden.</span></div>}
    {data.source.status === "unavailable" ? <div className={styles.sourceBanner} role="status"><DashboardIcon name="info" /><p><strong>Performance source unavailable.</strong>{data.source.message} Unavailable metrics were not converted into zero flags.</p></div> : null}
    <div className={styles.visualGrid}>
      <Donut active={activeCategory} items={data.analytics.composition} onActive={setActiveCategory} title="Flag composition" />
      <TrendChart activeCategory={activeCategory} firstKey="wrap" firstLabel="Wrap Flags" onCategory={setActiveCategory} points={data.analytics.trend.map((point) => ({ ...point, wrap: point.wrapFlags, pause: point.pauseFlags }))} secondKey="pause" secondLabel="Pause Flags" title="Weekly flag trend" />
      <TeamRanking activeTeam={activeTeam} firstKey="wrapFlags" firstLabel="Wrap flags" onTeam={setActiveTeam} range={data.filters.dateRange} secondKey="pauseFlags" secondLabel="Pause flags" teams={data.analytics.teams} />
    </div>
    <PerformanceTable activeCategory={activeCategory} activeTeam={activeTeam} data={data} exportHref={exportHref} range={data.filters.dateRange} />
  </div>;
}

export function TransferFlagsClient({ data, exportHref, filters }: { data: TransferData; exportHref: string; filters: Filter[] }) {
  const [activeCategory, setActiveCategory] = useState<SeriesKey | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const current = data.summary;
  const trend = data.analytics.trend;
  return <div className={styles.view}>
    {data.source.status === "unavailable" ? <div className={styles.sourceBanner} data-tone="danger" role="alert"><DashboardIcon name="info" /><p><strong>Closed source unavailable.</strong>{data.source.message} Missing-source data was not classified as zero deals.</p></div> : null}
    {filters.length ? <FilterBar filters={filters} /> : null}
    {current ? <section aria-label="Transfer flag metrics" className={styles.kpiGrid}>
      <KpiCard color="#1769ef" current={current.scopedAgents} icon="users" label="Scoped Agents" range={data.filters.dateRange} scopedAgents={current.scopedAgents} source="ready" trend={trend.map((point) => point.agents)} />
      <KpiCard color={COLORS.strong} current={data.source.status === "ready" ? current.strongFlags : null} icon="flag" label="Strong Weekly Flags" range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={trend.map((point) => point.strongFlags)} />
      <KpiCard color={COLORS.improvement} current={data.source.status === "ready" ? current.improvementFlags : null} icon="performance" label="Improvement Weekly Flags" range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={trend.map((point) => point.improvementFlags)} />
      <KpiCard color="#7c3aed" current={data.source.status === "ready" ? current.repeatFlaggedAgents : null} icon="teams" label="Repeat Flagged Agents" range={data.filters.dateRange} scopedAgents={current.scopedAgents} source={data.source.status} trend={[]} />
    </section> : <div className={styles.privateNotice}><DashboardIcon name="permissions" /><span>{data.source.status === "unavailable" ? "Aggregate transfer totals remain unavailable until the Closed source recovers." : "This private view contains only your authorized weekly flag records; organization aggregates are hidden."}</span></div>}
    <section className={styles.rules} aria-labelledby="flag-rules-title"><DashboardIcon name="info" /><div><h2 id="flag-rules-title">Flag rules</h2><p>Each Monday–Sunday bucket is evaluated independently using matched Closed worksheet records.</p></div><dl><div data-kind="strong"><dt>Strong</dt><dd>0–1 closed deals</dd></div><div data-kind="improvement"><dt>Improvement</dt><dd>2 closed deals</dd></div><div data-kind="clear"><dt>Not Flagged</dt><dd>3+ closed deals</dd></div></dl></section>
    <div className={styles.visualGrid}>
      <Donut active={activeCategory} items={data.analytics.composition} onActive={setActiveCategory} title="Weekly flag composition" />
      <TrendChart activeCategory={activeCategory} firstKey="strong" firstLabel="Strong Flags" onCategory={setActiveCategory} points={data.analytics.trend.map((point) => ({ ...point, strong: point.strongFlags, improvement: point.improvementFlags }))} secondKey="improvement" secondLabel="Improvement Flags" title="Weekly transfer flag trend" />
      <TeamRanking activeTeam={activeTeam} firstKey="strongFlags" firstLabel="Strong flags" onTeam={setActiveTeam} range={data.filters.dateRange} secondKey="improvementFlags" secondLabel="Improvement flags" teams={data.analytics.teams} />
    </div>
    <TransferTable activeCategory={activeCategory} activeTeam={activeTeam} data={data} exportHref={exportHref} />
  </div>;
}
