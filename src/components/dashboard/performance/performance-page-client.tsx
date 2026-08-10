"use client";

import Link from "next/link";
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import { AreaTrend } from "@/components/ui/area-trend";
import { DonutChart } from "@/components/ui/donut-chart";
import {
  calculatePerformanceDelta,
  PRODUCTIVITY_MIX_KEYS,
  productivityStatePercentage,
  sumProductivityMixSeconds,
  type PerformanceSeriesPoint,
} from "@/performance/aggregations";
import type { PerformancePageData, PerformanceSource } from "@/performance/data";
import styles from "@/components/dashboard/performance/performance-page.module.css";

type MetricKey = "transfers" | "closedDeals" | "loggedInSeconds";
type ActivityKey =
  | "readySeconds"
  | "talkSeconds"
  | "ringingSeconds"
  | "wrapSeconds"
  | "pausedSeconds"
  | "systemPauseSeconds"
  | "idleSeconds"
  | "untrackedSeconds"
  | "netSeconds";

const metricMeta: Record<MetricKey, { label: string; color: string }> = {
  transfers: { label: "Transfers", color: "#1767f2" },
  closedDeals: { label: "Closed Deals", color: "#20ae68" },
  loggedInSeconds: { label: "Logged-in Time", color: "#7c3aed" },
};

const activityStates: Array<{
  key: ActivityKey;
  label: string;
  shortLabel: string;
  icon: DashboardIconName;
  color: string;
}> = [
  { key: "readySeconds", label: "Ready Time", shortLabel: "Ready", icon: "activity", color: "#3385f5" },
  { key: "talkSeconds", label: "Talk Time", shortLabel: "Talk", icon: "calls", color: "#2fc978" },
  { key: "ringingSeconds", label: "Ringing Time", shortLabel: "Ringing", icon: "ringing", color: "#7c3aed" },
  { key: "wrapSeconds", label: "Wrap Time", shortLabel: "Wrap", icon: "activity", color: "#37beca" },
  { key: "pausedSeconds", label: "Paused Time", shortLabel: "Paused", icon: "pause", color: "#f47b20" },
  { key: "systemPauseSeconds", label: "System Pause", shortLabel: "System Pause", icon: "pause", color: "#f2a03a" },
  { key: "idleSeconds", label: "Idle Time", shortLabel: "Idle", icon: "freshness", color: "#ef5a65" },
  { key: "untrackedSeconds", label: "Untracked Time", shortLabel: "Untracked", icon: "untracked", color: "#9ca8b8" },
  { key: "netSeconds", label: "Net", shortLabel: "Net", icon: "activity", color: "#1767f2" },
];

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatNumber(value: number | null) {
  return value === null ? "—" : integer.format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${decimal.format(value)}%`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "0";
  const safe = Math.max(0, Math.trunc(seconds));
  return `${integer.format(Math.floor(safe / 3600))}h ${Math.floor((safe % 3600) / 60)}m`;
}

function formatDate(value: string, granularity: PerformancePageData["granularity"], end?: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (granularity === "month") return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  if (granularity !== "week" || !end || end === value) return formatted;
  return `${formatted}–${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${end}T00:00:00Z`))}`;
}

function sourceLabel(source: PerformanceSource) {
  if (source.status === "healthy") return "Available";
  if (source.status === "partial") return "Partial";
  return "Unavailable";
}

function latestSync(data: PerformancePageData, sources: PerformanceSource[]) {
  const values = sources.flatMap((source) => source.latestSync ? [new Date(source.latestSync)] : []);
  if (values.length === 0) return "Unavailable";
  const latest = values.sort((left, right) => right.getTime() - left.getTime())[0];
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timeZone }).format(latest);
}

function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])"));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const next = index < 0
        ? event.key === "ArrowDown" ? 0 : items.length - 1
        : (index + offset + items.length) % items.length;
      items[next]?.focus();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return (
    <div className={styles.menu} onClick={(event) => event.stopPropagation()} onKeyDown={onMenuKeyDown}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={styles.iconButton}
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open ? (
        <div className={styles.menuPopover} role="menu">
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} role="menuitem" type="button">{children}</button>;
}

function MetricCard({
  color,
  current,
  data,
  description,
  format,
  icon,
  id,
  label,
  previous,
  series,
  sources,
}: {
  color: string;
  current: number | null;
  data: PerformancePageData;
  description: string;
  format: (value: number | null) => string;
  icon: DashboardIconName;
  id: string;
  label: string;
  previous: number | null;
  series: Array<{ label: string; value: number | null }>;
  sources: PerformanceSource[];
}) {
  const [pinned, setPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const delta = calculatePerformanceDelta(current, previous);
  const trendTone = delta.absolute === null || delta.absolute === 0 ? "neutral" : delta.absolute > 0 ? "up" : "down";
  const trend = delta.absolute === null
    ? "—"
    : `${delta.absolute > 0 ? "↑" : delta.absolute < 0 ? "↓" : "—"} ${delta.percentage === null ? format(Math.abs(delta.absolute)) : formatPercent(Math.abs(delta.percentage))}`;
  const sourceStatus = sources.some((source) => source.status === "unavailable")
    ? "Unavailable"
    : sources.some((source) => source.status === "partial")
      ? "Partial"
      : "Available";

  async function copyValue() {
    await navigator.clipboard?.writeText(`${label}: ${format(current)}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article
      aria-describedby={`${id}-description`}
      className={styles.metricCard}
      data-open={pinned || undefined}
      id={id}
      onClick={() => setPinned((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setPinned((value) => !value);
        }
        if (event.key === "Escape") setPinned(false);
      }}
      style={{ "--metric-color": color } as CSSProperties}
      tabIndex={0}
    >
      <div className={styles.metricTop}>
        <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
        <strong>{label}</strong>
        <ActionMenu label={`${label} actions`}>
          {(close) => <MenuButton onClick={() => { void copyValue(); close(); }}>Copy formatted value</MenuButton>}
        </ActionMenu>
      </div>
      <p className={styles.metricValue}>{format(current)}</p>
      <p className={styles.metricTrend} data-tone={trendTone}>
        <span>{trend}</span> vs {data.comparison?.label ?? "previous period"}
      </p>
      <AreaTrend
        ariaLabel={`${label} trend`}
        className={styles.sparkline}
        color={color}
        emptyLabel="No trend history"
        formatValue={(value) => format(value)}
        points={series}
      />
      <p className={styles.metricDescription} id={`${id}-description`}>{description}</p>
      <div className={styles.metricTooltip} role="tooltip">
        <strong>{label}</strong>
        <dl>
          <div><dt>Selected range</dt><dd>{data.range.label}</dd></div>
          <div><dt>Current</dt><dd>{format(current)}</dd></div>
          <div><dt>Previous</dt><dd>{format(previous)}</dd></div>
          <div><dt>Absolute change</dt><dd>{delta.absolute === null ? "Unavailable" : format(delta.absolute)}</dd></div>
          <div><dt>Percentage change</dt><dd>{formatPercent(delta.percentage)}</dd></div>
          <div><dt>Source</dt><dd>{sourceStatus}</dd></div>
          <div><dt>Latest sync</dt><dd>{latestSync(data, sources)}</dd></div>
        </dl>
      </div>
      {copied ? <span className={styles.copyStatus} role="status">Copied</span> : null}
    </article>
  );
}

function PanelHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <header className={styles.panelHeader}>
      <div><h2>{title}</h2><p>{description}</p></div>
      {actions ? <div className={styles.panelActions}>{actions}</div> : null}
    </header>
  );
}

function PointTooltip({ data, point }: { data: PerformancePageData; point: PerformanceSeriesPoint }) {
  return (
    <div className={styles.chartTooltip} role="tooltip">
      <strong>{formatDate(point.rangeStart, data.granularity, point.rangeEnd)}</strong>
      <dl>
        <div><dt>Transfers</dt><dd>{formatNumber(point.transfers)}</dd></div>
        <div><dt>Closed Deals</dt><dd>{formatNumber(point.closedDeals)}</dd></div>
        <div><dt>Closed Deal Rate</dt><dd>{formatPercent(point.closedDealRate)}</dd></div>
        <div><dt>Logged-in Time</dt><dd>{formatDuration(point.loggedInSeconds)}</dd></div>
        <div><dt>Transfer source</dt><dd>{sourceLabel(data.sources.transfers)}</dd></div>
        <div><dt>Closed source</dt><dd>{sourceLabel(data.sources.closedDeals)}</dd></div>
        <div><dt>Source rows</dt><dd>{integer.format(point.sourceRows)}</dd></div>
      </dl>
    </div>
  );
}

function buildLineSegments(points: PerformanceSeriesPoint[], getY: (seconds: number) => number, xAt: (index: number) => number) {
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.loggedInSeconds === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${xAt(index)},${getY(point.loggedInSeconds)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

function DailyPerformanceChart({
  data,
  exportHref,
  highlightedKey,
  onHighlight,
}: {
  data: PerformancePageData;
  exportHref: string;
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
}) {
  const [mode, setMode] = useState<"all" | "single">("all");
  const [singleMetric, setSingleMetric] = useState<MetricKey>("transfers");
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({ transfers: true, closedDeals: true, loggedInSeconds: true });
  const [hoveredSeries, setHoveredSeries] = useState<MetricKey | null>(null);
  const refs = useRef<Array<SVGGElement | null>>([]);
  const points = data.series;
  const selectedKey = highlightedKey;
  const selectedIndex = points.findIndex((point) => point.key === selectedKey);
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null;
  const enabled = (key: MetricKey) => mode === "single" ? singleMetric === key : visible[key];
  const chartWidth = 860;
  const chartHeight = 250;
  const left = 46;
  const right = 54;
  const top = 22;
  const bottom = 42;
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const countMax = Math.max(1, ...points.flatMap((point) => [point.transfers ?? 0, point.closedDeals ?? 0]));
  const secondsMax = Math.max(1, ...points.map((point) => point.loggedInSeconds ?? 0));
  const step = plotWidth / Math.max(1, points.length);
  const xAt = (index: number) => left + step * index + step / 2;
  const countY = (value: number) => top + plotHeight - (value / countMax) * plotHeight;
  const timeY = (value: number) => top + plotHeight - (value / secondsMax) * plotHeight;
  const lineSegments = buildLineSegments(points, timeY, xAt);
  const visibleCount = (Object.keys(visible) as MetricKey[]).filter((key) => visible[key]).length;

  function toggleSeries(key: MetricKey) {
    setVisible((current) => current[key] && visibleCount === 1 ? current : { ...current, [key]: !current[key] });
  }

  function focusDate(index: number) {
    const target = Math.max(0, Math.min(points.length - 1, index));
    const key = points[target]?.key ?? null;
    onHighlight(key);
    refs.current[target]?.focus();
  }

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`}>
      <PanelHeader
        actions={
          <>
            <div className={styles.segmented} aria-label="Chart mode">
              <button aria-pressed={mode === "all"} onClick={() => setMode("all")} type="button">Three metrics</button>
              <button aria-pressed={mode === "single"} onClick={() => setMode("single")} type="button">By metric</button>
            </div>
            <ActionMenu label="Daily performance chart actions">
              {(close) => (
                <>
                  <MenuButton onClick={() => { setVisible({ transfers: true, closedDeals: true, loggedInSeconds: true }); close(); }}>Reset visible series</MenuButton>
                  <Link href={exportHref} onClick={close} role="menuitem">Download displayed data</Link>
                  <MenuButton onClick={() => { document.getElementById("performance-data-table")?.focus(); close(); }}>Open accessible data table</MenuButton>
                </>
              )}
            </ActionMenu>
          </>
        }
        description="Transfers, closed deals, and logged-in time across the selected period."
        title="Daily performance trend"
      />
      <div className={styles.chartToolbar}>
        <div className={styles.legend} aria-label="Chart series">
          {(Object.keys(metricMeta) as MetricKey[]).map((key) => (
            <button
              aria-pressed={enabled(key)}
              data-active={hoveredSeries === key || undefined}
              key={key}
              onBlur={() => setHoveredSeries(null)}
              onClick={() => mode === "single" ? setSingleMetric(key) : toggleSeries(key)}
              onFocus={() => setHoveredSeries(key)}
              onMouseEnter={() => setHoveredSeries(key)}
              onMouseLeave={() => setHoveredSeries(null)}
              type="button"
            >
              <span style={{ background: metricMeta[key].color }} />{metricMeta[key].label}
            </button>
          ))}
        </div>
        {mode === "single" ? (
          <label className={styles.metricSelect}>Metric
            <select onChange={(event) => setSingleMetric(event.target.value as MetricKey)} value={singleMetric}>
              {(Object.keys(metricMeta) as MetricKey[]).map((key) => <option key={key} value={key}>{metricMeta[key].label}</option>)}
            </select>
          </label>
        ) : null}
        <span className={styles.granularity}>{data.granularity === "day" ? "Daily" : data.granularity === "week" ? "Weekly" : "Monthly"} aggregation</span>
      </div>
      {points.length === 0 ? (
        <div className={styles.emptyState}><DashboardIcon name="info" /><strong>No daily activity is available</strong><span>The authorized sources contain no records for this period.</span></div>
      ) : (
        <div className={styles.chartFrame} onPointerCancel={() => onHighlight(null)} onPointerLeave={() => onHighlight(null)}>
          <svg aria-labelledby="performance-chart-title performance-chart-description" className={styles.chart} role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            <title id="performance-chart-title">Daily performance trend</title>
            <desc id="performance-chart-description">Transfers and closed deals use the left count axis. Logged-in time uses the right hours axis.</desc>
            {[0, 0.5, 1].map((ratio) => {
              const y = top + plotHeight * ratio;
              return <line className={styles.gridline} key={ratio} x1={left} x2={chartWidth - right} y1={y} y2={y} />;
            })}
            <text className={styles.axisTitle} x={left} y={12}>Count</text>
            <text className={styles.axisTitle} textAnchor="end" x={chartWidth - right} y={12}>Hours</text>
            <text className={styles.axisLabel} x={8} y={top + 4}>{integer.format(countMax)}</text>
            <text className={styles.axisLabel} x={20} y={top + plotHeight}>{0}</text>
            <text className={styles.axisLabel} textAnchor="end" x={chartWidth - 8} y={top + 4}>{decimal.format(secondsMax / 3600)}h</text>
            <text className={styles.axisLabel} textAnchor="end" x={chartWidth - 8} y={top + plotHeight}>0h</text>
            {points.map((point, index) => {
              const x = xAt(index);
              const active = selectedKey === point.key;
              const faded = selectedKey !== null && !active;
              const barWidth = Math.min(14, Math.max(3, step * 0.28));
              return (
                <g
                  aria-label={`${formatDate(point.rangeStart, data.granularity, point.rangeEnd)}. Transfers ${formatNumber(point.transfers)}, closed deals ${formatNumber(point.closedDeals)}, logged-in time ${formatDuration(point.loggedInSeconds)}.`}
                  className={styles.chartDate}
                  data-active={active || undefined}
                  data-faded={faded || undefined}
                  key={point.key}
                  onBlur={() => onHighlight(null)}
                  onFocus={() => onHighlight(point.key)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") { event.preventDefault(); focusDate(index - 1); }
                    if (event.key === "ArrowRight") { event.preventDefault(); focusDate(index + 1); }
                    if (event.key === "Escape") onHighlight(null);
                  }}
                  onPointerEnter={() => onHighlight(point.key)}
                  ref={(node) => { refs.current[index] = node; }}
                  role="button"
                  tabIndex={0}
                >
                  {active ? <line className={styles.crosshair} x1={x} x2={x} y1={top} y2={top + plotHeight} /> : null}
                  {enabled("transfers") && point.transfers !== null ? <rect className={styles.bar} data-series="transfers" height={Math.max(point.transfers > 0 ? 2 : 0, top + plotHeight - countY(point.transfers))} width={barWidth} x={x - barWidth - 1} y={countY(point.transfers)} /> : null}
                  {enabled("closedDeals") && point.closedDeals !== null ? <rect className={styles.bar} data-series="closedDeals" height={Math.max(point.closedDeals > 0 ? 2 : 0, top + plotHeight - countY(point.closedDeals))} width={barWidth} x={x + 1} y={countY(point.closedDeals)} /> : null}
                  <rect fill="transparent" height={plotHeight + bottom} width={Math.max(8, step)} x={x - step / 2} y={top} />
                  {(index % Math.max(1, Math.ceil(points.length / 9)) === 0 || index === points.length - 1) ? <text className={styles.xLabel} textAnchor="middle" x={x} y={chartHeight - 12}>{formatDate(point.rangeStart, data.granularity)}</text> : null}
                </g>
              );
            })}
            {enabled("loggedInSeconds") ? lineSegments.map((segment, index) => <polyline className={styles.timeLine} key={index} points={segment} />) : null}
            {enabled("loggedInSeconds") ? points.map((point, index) => point.loggedInSeconds === null ? null : <circle className={styles.timePoint} data-active={selectedKey === point.key || undefined} cx={xAt(index)} cy={timeY(point.loggedInSeconds)} key={point.key} r={selectedKey === point.key ? 5 : 3.25} />) : null}
          </svg>
          {selectedPoint ? <div className={styles.chartTooltipAnchor} style={{ left: `${Math.min(82, Math.max(10, ((selectedIndex + 0.5) / points.length) * 100))}%` }}><PointTooltip data={data} point={selectedPoint} /></div> : null}
        </div>
      )}
      <div className={styles.srOnly}>
        <table><caption>Accessible daily performance chart data</caption><thead><tr><th>Date</th><th>Transfers</th><th>Closed Deals</th><th>Logged-in Time</th></tr></thead><tbody>{points.map((point) => <tr key={point.key}><th>{point.rangeStart}</th><td>{formatNumber(point.transfers)}</td><td>{formatNumber(point.closedDeals)}</td><td>{formatDuration(point.loggedInSeconds)}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function ProductivityMix({
  activeState,
  data,
  onActiveState,
}: {
  activeState: ActivityKey | null;
  data: PerformancePageData;
  onActiveState: (key: ActivityKey | null) => void;
}) {
  const [visible, setVisible] = useState<Record<ActivityKey, boolean>>(() => Object.fromEntries(activityStates.map((state) => [state.key, true])) as Record<ActivityKey, boolean>);
  const available = activityStates.filter(
    (state) =>
      PRODUCTIVITY_MIX_KEYS.some((key) => key === state.key) &&
      data.totals[state.key] !== null,
  );
  const totalRecorded = sumProductivityMixSeconds(data.totals);
  const visibleTotal = available.filter((state) => visible[state.key]).reduce((total, state) => total + (data.totals[state.key] ?? 0), 0);
  const active = activityStates.find((state) => state.key === activeState) ?? null;
  const activeSeconds = active ? data.totals[active.key] : null;
  const visibleAvailableCount = available.filter((state) => visible[state.key]).length;

  return (
    <section className={`${styles.panel} ${styles.productivityPanel}`}>
      <PanelHeader
        actions={<ActionMenu label="Productivity mix actions">{(close) => <><MenuButton onClick={() => { setVisible(Object.fromEntries(activityStates.map((state) => [state.key, true])) as Record<ActivityKey, boolean>); close(); }}>Reset visible states</MenuButton><MenuButton onClick={() => { document.getElementById("performance-source-status")?.focus(); close(); }}>View source availability</MenuButton></>}</ActionMenu>}
        description="Share of all recorded activity time."
        title="Productivity mix"
      />
      <div className={styles.productivityBody}>
        <DonutChart activeSegmentId={activeState} ariaLabel={totalRecorded > 0 ? `Productivity mix totaling ${formatDuration(totalRecorded)}` : "Productivity mix unavailable"} centerContent={<><strong>{active ? formatPercent(productivityStatePercentage(data.totals[active.key], totalRecorded)) : totalRecorded > 0 ? "100%" : "0"}</strong><span>{active?.shortLabel ?? (totalRecorded > 0 ? "Total" : "No data")}</span></>} className={styles.donut} data={available.filter((state) => visible[state.key]).map((state) => ({ id: state.key, value: data.totals[state.key] ?? 0, color: state.color, label: state.label, accessibleLabel: `${state.label}: ${formatDuration(data.totals[state.key])}, ${formatPercent(productivityStatePercentage(data.totals[state.key], visibleTotal))}` }))} onSegmentHover={(segment) => onActiveState((segment?.id as ActivityKey | undefined) ?? null)} size={200} strokeWidth={32} />
        <div className={styles.productivityLegend}>
          {activityStates.filter((state) => PRODUCTIVITY_MIX_KEYS.some((key) => key === state.key)).map((state) => {
            const seconds = data.totals[state.key];
            const percentage = productivityStatePercentage(seconds, totalRecorded);
            return (
              <button
                aria-pressed={seconds !== null && visible[state.key]}
                data-active={activeState === state.key || undefined}
                disabled={seconds === null}
                key={state.key}
                onBlur={() => onActiveState(null)}
                onClick={() => {
                  if (seconds === null || (visible[state.key] && visibleAvailableCount === 1)) return;
                  setVisible((current) => ({ ...current, [state.key]: !current[state.key] }));
                  onActiveState(state.key);
                }}
                onFocus={() => onActiveState(state.key)}
                onMouseEnter={() => onActiveState(state.key)}
                onMouseLeave={() => onActiveState(null)}
                type="button"
              >
                <span style={{ background: state.color }} /><b>{state.shortLabel}</b><strong>{seconds === null ? "0" : formatPercent(percentage)}</strong>
                <small>{seconds === null ? "Not reported by source" : `${formatDuration(seconds)} · ${integer.format(seconds)}s`}</small>
              </button>
            );
          })}
          <div className={styles.productivityTotal}><span>Total recorded</span><strong>{totalRecorded > 0 ? formatDuration(totalRecorded) : "0"}</strong></div>
        </div>
      </div>
      {active ? <div className={styles.inlineTooltip} role="tooltip"><strong>{active.label}</strong><span>{formatDuration(activeSeconds)} · {activeSeconds === null ? "Unavailable" : `${integer.format(activeSeconds)} seconds`}</span><span>{formatPercent(productivityStatePercentage(activeSeconds, totalRecorded))} of recorded activity</span><span>{formatPercent(data.totals.loggedInSeconds && activeSeconds !== null ? (activeSeconds / data.totals.loggedInSeconds) * 100 : null)} of logged-in time</span></div> : null}
    </section>
  );
}

function ActivityStates({ activeState, data, onActiveState }: { activeState: ActivityKey | null; data: PerformancePageData; onActiveState: (key: ActivityKey | null) => void }) {
  return (
    <section className={`${styles.panel} ${styles.activityPanel}`}>
      <PanelHeader description="Each state shown against total logged-in time." title="Activity states" />
      <div className={styles.activityGrid}>
        {activityStates.map((state) => {
          const seconds = data.totals[state.key];
          const previous = data.comparison?.[state.key] ?? null;
          const share = data.totals.loggedInSeconds && seconds !== null ? (seconds / data.totals.loggedInSeconds) * 100 : null;
          return (
            <article
              className={styles.activityCard}
              data-active={activeState === state.key || undefined}
              key={state.key}
              onBlur={() => onActiveState(null)}
              onFocus={() => onActiveState(state.key)}
              style={{ "--state-color": state.color } as CSSProperties}
              tabIndex={0}
            >
              <div className={styles.activityHeading}><span><DashboardIcon name={state.icon} /></span><strong>{state.label}</strong></div>
              <div className={styles.activityValue}><b>{formatDuration(seconds)}</b><span>{formatPercent(share)}</span></div>
              <p>{seconds === null ? "Not reported by source" : share === null ? "No logged-in time" : `${formatPercent(share)} of logged-in time`}</p>
              <span className={styles.progress}><i style={{ width: `${Math.min(100, Math.max(0, share ?? 0))}%` }} /></span>
              <div className={styles.activityTooltip} role="tooltip"><strong>{state.label}</strong><span>{formatDuration(seconds)}</span><span>{seconds === null ? "Exact seconds unavailable" : `${integer.format(seconds)} seconds`}</span><span>{formatPercent(share)} of logged-in time</span><span>Previous: {formatDuration(previous)}</span><span>Source: {sourceLabel(data.sources.dialer)}</span></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type ColumnKey = "date" | "transfers" | "closedDeals" | "loggedInSeconds" | "conversion" | "sourceRows" | "readySeconds" | "talkSeconds" | "wrapSeconds" | "pausedSeconds";
const columns: Array<{ key: ColumnKey; label: string; format: (row: PerformanceSeriesPoint, granularity: PerformancePageData["granularity"]) => string }> = [
  { key: "date", label: "Date", format: (row, granularity) => formatDate(row.rangeStart, granularity, row.rangeEnd) },
  { key: "transfers", label: "Transfers", format: (row) => formatNumber(row.transfers) },
  { key: "closedDeals", label: "Closed Deals", format: (row) => formatNumber(row.closedDeals) },
  { key: "loggedInSeconds", label: "Logged-in Time", format: (row) => formatDuration(row.loggedInSeconds) },
  { key: "conversion", label: "Conversion", format: (row) => formatPercent(row.closedDealRate) },
  { key: "sourceRows", label: "Source Rows", format: (row) => formatNumber(row.sourceRows) },
  { key: "readySeconds", label: "Ready Time", format: (row) => formatDuration(row.loggedInSeconds === null ? null : row.readySeconds) },
  { key: "talkSeconds", label: "Talk Time", format: (row) => formatDuration(row.loggedInSeconds === null ? null : row.talkSeconds) },
  { key: "wrapSeconds", label: "Wrap Time", format: (row) => formatDuration(row.loggedInSeconds === null ? null : row.wrapSeconds) },
  { key: "pausedSeconds", label: "Paused Time", format: (row) => formatDuration(row.loggedInSeconds === null ? null : row.pausedSeconds) },
];

function DailyPerformanceTable({ data, exportHref, highlightedKey, onHighlight }: { data: PerformancePageData; exportHref: string; highlightedKey: string | null; onHighlight: (key: string | null) => void }) {
  const defaultColumns: ColumnKey[] = ["date", "transfers", "closedDeals", "loggedInSeconds", "conversion", "sourceRows"];
  const [visible, setVisible] = useState<ColumnKey[]>(defaultColumns);
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 15;
  const sorted = useMemo(() => [...data.series].sort((left, right) => sort === "asc" ? left.rangeStart.localeCompare(right.rangeStart) : right.rangeStart.localeCompare(left.rangeStart)), [data.series, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const rows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <section className={`${styles.panel} ${styles.tablePanel}`} id="performance-data-table" tabIndex={-1}>
      <PanelHeader
        actions={
          <>
            <ActionMenu label="Choose daily performance columns">
              {() => <fieldset className={styles.columnMenu}><legend>Visible columns</legend>{columns.map((column) => <label key={column.key}><input checked={visible.includes(column.key)} disabled={column.key === "date"} onChange={() => setVisible((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : [...current, column.key])} type="checkbox" />{column.label}</label>)}</fieldset>}
            </ActionMenu>
            <ActionMenu label="Daily performance table actions">
              {(close) => <><MenuButton onClick={() => { setSort("asc"); close(); }}>Reset sorting</MenuButton><MenuButton onClick={() => { setVisible(defaultColumns); close(); }}>Reset visible columns</MenuButton><Link href={exportHref} onClick={close} role="menuitem">Export displayed rows</Link></>}
            </ActionMenu>
          </>
        }
        description="Source-level aggregates used by the daily performance metrics."
        title="Daily performance detail"
      />
      <div className={styles.tableScroll} role="region" aria-label="Daily performance detail table" tabIndex={0}>
        <table>
          <caption className={styles.srOnly}>Authorized daily performance values for the selected date range.</caption>
          <thead><tr>{columns.filter((column) => visible.includes(column.key)).map((column) => <th className={column.key === "date" ? undefined : styles.numeric} key={column.key} scope="col">{column.key === "date" ? <button aria-label={`Sort date ${sort === "asc" ? "descending" : "ascending"}`} onClick={() => setSort((current) => current === "asc" ? "desc" : "asc")} type="button">Date <span aria-hidden="true">{sort === "asc" ? "↑" : "↓"}</span></button> : column.label}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={visible.length}><div className={styles.tableEmpty}><DashboardIcon name="import" /><strong>No daily activity is available</strong><span>The active data does not contain daily records for this period.</span></div></td></tr> : rows.map((row) => (
              <tr
                data-active={highlightedKey === row.key || undefined}
                key={row.key}
                onBlur={() => onHighlight(null)}
                onFocus={() => onHighlight(row.key)}
                onMouseEnter={() => onHighlight(row.key)}
                onMouseLeave={() => onHighlight(null)}
                tabIndex={0}
                title={`${formatDate(row.rangeStart, data.granularity, row.rangeEnd)}: ${formatNumber(row.transfers)} transfers, ${formatNumber(row.closedDeals)} closed deals, ${formatDuration(row.loggedInSeconds)} logged in`}
              >
                {columns.filter((column) => visible.includes(column.key)).map((column, index) => index === 0 ? <th key={column.key} scope="row">{column.format(row, data.granularity)}</th> : <td className={styles.numeric} key={column.key}>{column.format(row, data.granularity)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? <nav aria-label="Daily performance pages" className={styles.pagination}><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} type="button">Previous</button><span>Page {page + 1} of {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} type="button">Next</button></nav> : null}
    </section>
  );
}

function SourceBanner({ data }: { data: PerformancePageData }) {
  const issues = Object.entries(data.sources).filter(([, source]) => source.status !== "healthy");
  if (issues.length === 0) return null;
  return (
    <div className={styles.sourceBanner} id="performance-source-status" tabIndex={-1}>
      <DashboardIcon name="info" />
      <div><strong>Some performance sources need attention</strong><p>{issues.map(([name, source]) => `${name === "closedDeals" ? "Closed Deals" : name[0].toUpperCase() + name.slice(1)}: ${source.message}`).join(" ")}</p></div>
    </div>
  );
}

export function PerformancePageClient({ data, exportHref }: { data: PerformancePageData; exportHref: string }) {
  const [activeState, setActiveState] = useState<ActivityKey | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const previous = data.comparison;
  return (
    <div className={styles.content}>
      <div className={styles.kpiGrid}>
        <MetricCard color="#1767f2" current={data.totals.transfers} data={data} description="Total transfers in the active scope" format={formatNumber} icon="calls" id="performance-transfers" label="Transfers" previous={previous?.transfers ?? null} series={data.series.map((row) => ({ label: formatDate(row.rangeStart, data.granularity, row.rangeEnd), value: row.transfers }))} sources={[data.sources.transfers]} />
        <MetricCard color="#20ae68" current={data.totals.closedDeals} data={data} description="Total closed deals in the active scope" format={formatNumber} icon="leaderboard" id="performance-closed-deals" label="Closed Deals" previous={previous?.closedDeals ?? null} series={data.series.map((row) => ({ label: formatDate(row.rangeStart, data.granularity, row.rangeEnd), value: row.closedDeals }))} sources={[data.sources.closedDeals]} />
        <MetricCard color="#f47b20" current={data.totals.loggedInSeconds} data={data} description="Total active time in the system" format={formatDuration} icon="freshness" id="performance-logged-in" label="Logged-in Time" previous={previous?.loggedInSeconds ?? null} series={data.series.map((row) => ({ label: formatDate(row.rangeStart, data.granularity, row.rangeEnd), value: row.loggedInSeconds }))} sources={[data.sources.dialer]} />
        <MetricCard color="#7c3aed" current={data.totals.closedDealRate} data={data} description="Closed deals divided by transfers" format={formatPercent} icon="performance" id="performance-rate" label="Closed Deal Rate" previous={previous?.closedDealRate ?? null} series={data.series.map((row) => ({ label: formatDate(row.rangeStart, data.granularity, row.rangeEnd), value: row.closedDealRate }))} sources={[data.sources.transfers, data.sources.closedDeals]} />
      </div>
      <SourceBanner data={data} />
      <div className={styles.analyticsGrid}>
        <DailyPerformanceChart data={data} exportHref={exportHref} highlightedKey={highlightedKey} onHighlight={setHighlightedKey} />
        <ProductivityMix activeState={activeState} data={data} onActiveState={setActiveState} />
      </div>
      <ActivityStates activeState={activeState} data={data} onActiveState={setActiveState} />
      <DailyPerformanceTable data={data} exportHref={exportHref} highlightedKey={highlightedKey} onHighlight={setHighlightedKey} />
    </div>
  );
}
