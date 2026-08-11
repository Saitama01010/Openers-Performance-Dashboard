"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import styles from "@/components/leaderboard/leaderboard-page.module.css";
import { AreaTrend } from "@/components/ui/area-trend";
import { metricCardForeground, metricCardStyle } from "@/components/ui/statistics-card";
import type { OverviewDateRange } from "@/dashboard/date-range";
import {
  aggregateLeaderboardTrend,
  calculateLeaderboardConversion,
  calculateLeaderboardDelta,
  deriveLeaderboardPodium,
  leaderboardTotals,
  prepareLeaderboardRows,
  type LeaderboardMetric,
  type LeaderboardPreparedRow,
  type LeaderboardViewState,
} from "@/leaderboard/analytics";
import type { LeaderboardData } from "@/leaderboard/data";
import type { LeaderboardRow, LeaderboardTrendPoint } from "@/leaderboard/ranking";
import type { LeaderboardSortColumn } from "@/leaderboard/sorting";

const PAGE_SIZE = 20;
const EMPTY_LEADERBOARD_ROWS: LeaderboardRow[] = [];
const metricLabels: Record<LeaderboardMetric, string> = {
  "closed-deals": "Closed Deals",
  transfers: "Transfers",
  conversion: "Conversion",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatRange(range: OverviewDateRange) {
  if (!range.from || !range.to) return "All available history";
  if (range.from === range.to) return formatDate(range.from);
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMetric(value: number | null, metric: LeaderboardMetric) {
  if (value === null) return "N/A";
  return metric === "conversion" ? `${value.toFixed(1)}%` : formatNumber(value);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? parts[0][1] ?? ""}`.toLocaleUpperCase("en-US");
}

function movementLabel(movement: number | null) {
  if (movement === null) return "No comparison rank";
  if (movement > 0) return `Up ${movement}`;
  if (movement < 0) return `Down ${Math.abs(movement)}`;
  return "No rank change";
}

function metricPointValue(point: LeaderboardTrendPoint, metric: LeaderboardMetric) {
  if (metric === "transfers") return point.transferCount;
  if (metric === "closed-deals") return point.closedDeals;
  return calculateLeaderboardConversion(point.closedDeals, point.transferCount);
}

function sourceTone(status: "healthy" | "partial" | "unavailable") {
  return status === "healthy" ? "Healthy" : status === "partial" ? "Needs attention" : "Unavailable";
}

function Sparkline({
  color,
  label,
  metric,
  points,
}: {
  color: string;
  label: string;
  metric: LeaderboardMetric;
  points: LeaderboardTrendPoint[];
}) {
  return (
    <span className={styles.sparklineWrap}>
      <AreaTrend
        ariaLabel={`${label} dated trend`}
        className={styles.sparkline}
        color={color}
        emptyLabel="No dated history"
        formatValue={(value) => formatMetric(value, metric)}
        points={points.map((point) => ({ label: formatDate(point.date), value: metricPointValue(point, metric) }))}
      />
    </span>
  );
}

function KpiCard({
  current,
  dateRange,
  latestSync,
  metric,
  onActive,
  open,
  previous,
  sourceStatus,
  trend,
}: {
  current: number | null;
  dateRange: OverviewDateRange;
  latestSync: string | null;
  metric: LeaderboardMetric;
  onActive: (metric: LeaderboardMetric | null) => void;
  open: boolean;
  previous: number | null;
  sourceStatus: "healthy" | "partial" | "unavailable";
  trend: LeaderboardTrendPoint[];
}) {
  const details = {
    transfers: { color: "#1765ff", icon: "import" as const, label: "Total Transfers" },
    "closed-deals": { color: "#16a765", icon: "leaderboard" as const, label: "Closed Deals" },
    conversion: { color: "#7b42ff", icon: "performance" as const, label: "Conversion Rate %" },
  }[metric];
  const tooltipId = `leaderboard-kpi-${metric}-details`;
  const delta = calculateLeaderboardDelta(current, previous);
  const deltaTone = (delta.absolute ?? 0) > 0 ? "up" : (delta.absolute ?? 0) < 0 ? "down" : "neutral";

  return (
    <article
      aria-label={`${details.label} details`}
      aria-describedby={open ? tooltipId : undefined}
      className={`${styles.kpiCard} metric-color-card`}
      data-open={open ? "" : undefined}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onActive(null); }}
      onClick={() => onActive(metric)}
      onFocus={() => onActive(metric)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onActive(null);
      }}
      onMouseEnter={() => onActive(metric)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) onActive(null);
      }}
      role="group"
      style={{ ...metricCardStyle(details.color), "--leader-color": details.color } as React.CSSProperties}
      tabIndex={0}
    >
      <div className={styles.kpiIdentity}>
        <span className={`${styles.kpiIcon} metric-card-icon`}><DashboardIcon name={details.icon} /></span>
        <div>
          <p className="metric-card-label">{details.label}</p>
          <strong className="metric-card-value">{formatMetric(current, metric)}</strong>
          <span className={`${styles.kpiDelta} metric-card-comparison`} data-tone={deltaTone}>
            {previous === null || delta.absolute === null
              ? "No equivalent-period comparison"
              : `${delta.absolute >= 0 ? "↑" : "↓"} ${formatMetric(Math.abs(delta.absolute), metric)}${delta.percentage === null ? "" : ` · ${Math.abs(delta.percentage).toFixed(1)}%`}`}
          </span>
        </div>
      </div>
      <span className="metric-card-trend"><Sparkline color={metricCardForeground(details.color)} label={details.label} metric={metric} points={trend} /></span>
      {open ? (
        <div className={styles.detailPopover} id={tooltipId} role="tooltip">
          <strong>{details.label}</strong>
          <span>{dateRange.label} · {formatRange(dateRange)}</span>
          <dl>
            <div><dt>Current</dt><dd>{formatMetric(current, metric)}</dd></div>
            <div><dt>Previous</dt><dd>{formatMetric(previous, metric)}</dd></div>
            <div><dt>Absolute change</dt><dd>{formatMetric(delta.absolute, metric)}</dd></div>
            <div><dt>Percentage change</dt><dd>{delta.percentage === null ? "N/A" : `${delta.percentage.toFixed(1)}%`}</dd></div>
            <div><dt>Source</dt><dd>{sourceTone(sourceStatus)}</dd></div>
            <div><dt>Last updated</dt><dd>{latestSync ? new Date(latestSync).toLocaleString("en-US") : "N/A"}</dd></div>
          </dl>
        </div>
      ) : null}
    </article>
  );
}

function PodiumCard({
  active,
  closedMetricsAvailable,
  dateRange,
  metric,
  onActive,
  row,
  sourceNote,
}: {
  active: boolean;
  closedMetricsAvailable: boolean;
  dateRange: OverviewDateRange;
  metric: LeaderboardMetric;
  onActive: (profileId: string | null) => void;
  row: LeaderboardPreparedRow;
  sourceNote: string;
}) {
  const rank = row.displayRank;
  const labels = rank === 1
    ? { badge: "1", title: "Top performer" }
    : rank === 2
      ? { badge: "2", title: "Second place" }
      : { badge: "3", title: "Third place" };
  const tooltipId = `leaderboard-podium-${row.profileId}-details`;
  return (
    <article
      aria-describedby={active ? tooltipId : undefined}
      aria-expanded={active}
      className={styles.podiumCard}
      data-active={active ? "" : undefined}
      data-rank={rank}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onActive(null); }}
      onClick={() => onActive(row.profileId)}
      onFocus={() => onActive(row.profileId)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onActive(null);
      }}
      onMouseEnter={() => onActive(row.profileId)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) onActive(null);
      }}
      role="button"
      tabIndex={0}
    >
      <div aria-hidden="true" className={styles.podiumMedal}>
        {rank === 1 ? <span className={styles.trophy}>♛</span> : null}
        <strong>{labels.badge}</strong>
      </div>
      <span className={styles.monogram}>{initials(row.americanName)}</span>
      <h3>{row.americanName}</h3>
      <p>{row.teamName ?? "Unassigned"}</p>
      {rank === 1 ? <span className={styles.topPerformer}>★ {labels.title}</span> : null}
      <dl className={styles.podiumStats}>
        <div><dt>Transfers</dt><dd>{formatNumber(row.transferCount)}</dd></div>
        <div><dt>Closed Deals</dt><dd>{closedMetricsAvailable ? formatNumber(row.closedDeals) : "N/A"}</dd></div>
        <div><dt>Conversion</dt><dd>{closedMetricsAvailable ? formatMetric(row.conversion, "conversion") : "N/A"}</dd></div>
      </dl>
      <span className={styles.pedestal} aria-hidden="true" />
      {active ? (
        <div className={styles.podiumPopover} id={tooltipId} role="tooltip">
          <strong>Rank {rank} · {metricLabels[metric]}</strong>
          <span>{row.realName}</span>
          <span>{row.americanName} · {row.teamName ?? "Unassigned"}</span>
          <span>{movementLabel(row.movement)}</span>
          <span>{dateRange.label} · {formatRange(dateRange)}</span>
          <span>{sourceNote}</span>
        </div>
      ) : null}
    </article>
  );
}

function TrendCell({ metric, row }: { metric: LeaderboardMetric; row: LeaderboardPreparedRow }) {
  const points = row.trend ?? [];
  if (points.length < 2) {
    return <span className={styles.limitedTrend}>{points.length === 1 ? "Limited history" : "No history"}</span>;
  }
  return <Sparkline color="#16a765" label={`${row.americanName} ${metricLabels[metric]}`} metric={metric} points={points} />;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className={styles.emptyState}>
      <span aria-hidden="true">—</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

export function LeaderboardView({
  data,
  dateRange,
  initialView,
}: {
  data: LeaderboardData;
  dateRange: OverviewDateRange;
  initialView: LeaderboardViewState;
}) {
  const closedMetricsAvailable =
    data.status === "ready" && data.closedMetricsAvailable !== false;
  const [view, setView] = useState(() =>
    !closedMetricsAvailable && initialView.metric !== "transfers"
      ? { ...initialView, metric: "transfers" as const, sortBy: "transfers" as const }
      : initialView,
  );
  const deferredQuery = useDeferredValue(view.query);
  const effectiveView = useMemo(
    () => ({ ...view, query: deferredQuery }),
    [deferredQuery, view],
  );
  const rows = data.status === "ready" ? data.rows : EMPTY_LEADERBOARD_ROWS;
  const preparedScope = useMemo(
    () => prepareLeaderboardRows(rows, { ...effectiveView, sortBy: effectiveView.metric, direction: "desc", topOnly: false }),
    [effectiveView, rows],
  );
  const displayedRows = useMemo(
    () => prepareLeaderboardRows(rows, effectiveView),
    [effectiveView, rows],
  );
  const podium = useMemo(
    () => deriveLeaderboardPodium(rows, effectiveView),
    [effectiveView, rows],
  );
  const scopeRows = preparedScope as LeaderboardRow[];
  const totals = leaderboardTotals(scopeRows);
  const trend = aggregateLeaderboardTrend(scopeRows);
  const currentConversion = closedMetricsAvailable
    ? calculateLeaderboardConversion(totals.current.closedDeals, totals.current.transferCount)
    : null;
  const previousConversion = closedMetricsAvailable && totals.comparison
    ? calculateLeaderboardConversion(totals.comparison.closedDeals, totals.comparison.transferCount)
    : null;
  const [activeKpi, setActiveKpi] = useState<LeaderboardMetric | null>(null);
  const [activePodium, setActivePodium] = useState<string | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(displayedRows.length / PAGE_SIZE));
  const visibleRows = displayedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const updates: Record<string, string | null> = {
      q: view.query || null,
      teamId: view.teamId || null,
      metric: view.metric,
      sort: view.sortBy,
      direction: view.direction,
      top: view.topOnly ? "1" : null,
    };
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [view]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ range: dateRange.key, metric: view.metric, sort: view.sortBy, direction: view.direction });
    if (dateRange.key === "custom" && dateRange.from && dateRange.to) {
      params.set("from", dateRange.from);
      params.set("to", dateRange.to);
    }
    if (view.query) params.set("q", view.query);
    if (view.teamId) params.set("teamId", view.teamId);
    if (view.topOnly) params.set("top", "1");
    return `/api/leaderboard/export?${params.toString()}`;
  }, [dateRange, view]);

  const transferStatus = data.status !== "ready"
    ? "unavailable" as const
    : data.stale || data.transferDiagnosticCount > 0 ? "partial" as const : "healthy" as const;
  const closedStatus = data.status !== "ready"
    ? "unavailable" as const
    : !closedMetricsAvailable
      ? "unavailable" as const
    : data.stale || data.closedDiagnosticCount > 0 ? "partial" as const : "healthy" as const;
  const conversionStatus = transferStatus === "unavailable" || closedStatus === "unavailable"
    ? "unavailable" as const
    : transferStatus === "partial" || closedStatus === "partial" ? "partial" as const : "healthy" as const;
  const latestSync = data.status === "ready" ? data.latestSynchronization : null;
  const sourceNote = `Transfers: ${sourceTone(transferStatus)} · Closed Deals: ${sourceTone(closedStatus)}`;

  function updateView(updater: (current: LeaderboardViewState) => LeaderboardViewState) {
    setPage(1);
    setView(updater);
  }

  function updateMetric(metric: LeaderboardMetric) {
    updateView((current) => ({ ...current, metric, sortBy: metric, direction: "desc" }));
  }

  function updateSort(column: LeaderboardSortColumn) {
    updateView((current) => ({
      ...current,
      sortBy: column,
      direction: current.sortBy === column && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  return (
    <div className={styles.content}>
      <section aria-label="Leaderboard summary" className={styles.kpiGrid}>
        <KpiCard
          current={data.status === "ready" ? totals.current.transferCount : null}
          dateRange={dateRange}
          latestSync={latestSync}
          metric="transfers"
          onActive={setActiveKpi}
          open={activeKpi === "transfers"}
          previous={totals.comparison?.transferCount ?? null}
          sourceStatus={transferStatus}
          trend={trend}
        />
        <KpiCard
          current={closedMetricsAvailable ? totals.current.closedDeals : null}
          dateRange={dateRange}
          latestSync={latestSync}
          metric="closed-deals"
          onActive={setActiveKpi}
          open={activeKpi === "closed-deals"}
          previous={closedMetricsAvailable ? totals.comparison?.closedDeals ?? null : null}
          sourceStatus={closedStatus}
          trend={closedMetricsAvailable ? trend : []}
        />
        <KpiCard
          current={data.status === "ready" ? currentConversion : null}
          dateRange={dateRange}
          latestSync={latestSync}
          metric="conversion"
          onActive={setActiveKpi}
          open={activeKpi === "conversion"}
          previous={previousConversion}
          sourceStatus={conversionStatus}
          trend={closedMetricsAvailable ? trend : []}
        />
      </section>

      {data.status === "ready" && (data.stale || transferStatus === "partial" || closedStatus !== "healthy") ? (
        <section className={styles.sourceBanner} role="status">
          <DashboardIcon name="info" />
          <div>
            <strong>{closedMetricsAvailable ? "Some source rows need attention" : "Closed attribution needs attention"}</strong>
            <span>{data.closedMessage ?? `${sourceNote}. Valid matched records remain authoritative.`}</span>
          </div>
        </section>
      ) : null}

      {data.status === "ready" && podium.length > 0 ? (
        <section aria-labelledby="leaderboard-podium-title" className={styles.podiumSection}>
          <h2 className={styles.srOnly} id="leaderboard-podium-title">Top three openers</h2>
          <div className={styles.lightBurst} aria-hidden="true" />
          <div className={styles.podiumGrid}>
            {[podium[1], podium[0], podium[2]].filter(Boolean).map((row) => (
              <PodiumCard
                active={activePodium === row.profileId || highlightedRow === row.profileId}
                closedMetricsAvailable={closedMetricsAvailable}
                dateRange={dateRange}
                key={row.profileId}
                metric={view.metric}
                onActive={setActivePodium}
                row={row}
                sourceNote={sourceNote}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Opener rankings" className={styles.rankingPanel}>
        <div className={styles.toolbar}>
          <label className={styles.searchControl}>
            <span className={styles.srOnly}>Search agents</span>
            <DashboardIcon name="search" />
            <input
              onChange={(event) => updateView((current) => ({ ...current, query: event.target.value }))}
              placeholder="Search agents…"
              type="search"
              value={view.query}
            />
          </label>
          <label className={styles.selectControl}>
            <span className={styles.srOnly}>Filter by team</span>
            <select onChange={(event) => updateView((current) => ({ ...current, teamId: event.target.value }))} value={view.teamId}>
              <option value="">All teams</option>
              {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <DashboardIcon name="chevronDown" />
          </label>
          <label className={styles.selectControl}>
            <span>Sort by</span>
            <select onChange={(event) => updateView((current) => ({ ...current, sortBy: event.target.value as LeaderboardSortColumn }))} value={view.sortBy}>
              <option disabled={!closedMetricsAvailable} value="closed-deals">Closed Deals</option>
              <option value="transfers">Transfers</option>
              <option disabled={!closedMetricsAvailable} value="conversion">Conversion</option>
            </select>
            <DashboardIcon name="chevronDown" />
          </label>
          <label className={styles.selectControl}>
            <span>Order</span>
            <select onChange={(event) => updateView((current) => ({ ...current, direction: event.target.value === "asc" ? "asc" : "desc" }))} value={view.direction}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <DashboardIcon name="chevronDown" />
          </label>
          <div aria-label="Ranking metric" className={styles.metricSelector} role="group">
            {(Object.keys(metricLabels) as LeaderboardMetric[]).map((metric) => (
              <button
                aria-pressed={view.metric === metric}
                disabled={!closedMetricsAvailable && metric !== "transfers"}
                key={metric}
                onClick={() => updateMetric(metric)}
                type="button"
              >
                {metricLabels[metric]}
              </button>
            ))}
          </div>
          <label className={styles.topToggle}>
            <input checked={view.topOnly} onChange={(event) => updateView((current) => ({ ...current, topOnly: event.target.checked }))} type="checkbox" />
            <span aria-hidden="true"><i /></span>
            Top performers only
          </label>
          <a className={styles.exportButton} download href={exportHref}>
            <DashboardIcon name="import" /> Export
          </a>
        </div>

        {data.status === "unconfigured" ? (
          <EmptyState title="LeaderBoard is awaiting transfer data" description={data.message} />
        ) : data.status === "source_error" ? (
          <EmptyState title="Transfer source needs attention" description={data.message} />
        ) : displayedRows.length === 0 ? (
          <EmptyState title="No ranking data found" description="No authorized openers match the active search and team filters." />
        ) : (
          <>
            <div className={styles.tableMeta}>
              <div><h2 id="leaderboard-table-heading">Opener rankings</h2><p>Ranked by {metricLabels[view.metric].toLocaleLowerCase("en-US")} within the selected authorized scope.</p></div>
              <strong>{formatNumber(displayedRows.length)} {displayedRows.length === 1 ? "opener" : "openers"}</strong>
            </div>
            <div aria-label="LeaderBoard rankings. Scroll horizontally inside this region to view all columns." className={styles.tableScroller} role="region" tabIndex={0}>
              <table className={styles.table}>
                <caption>Authorized LeaderBoard results for {formatRange(dateRange)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Real Name</th>
                    <th scope="col">American Name</th>
                    <th scope="col">Team</th>
                    <th aria-sort={view.sortBy === "transfers" ? (view.direction === "asc" ? "ascending" : "descending") : "none"} scope="col"><button onClick={() => updateSort("transfers")} type="button">Transfers ↕</button></th>
                    <th aria-sort={view.sortBy === "closed-deals" ? (view.direction === "asc" ? "ascending" : "descending") : "none"} scope="col"><button disabled={!closedMetricsAvailable} onClick={() => updateSort("closed-deals")} type="button">Closed Deals ↕</button></th>
                    <th aria-sort={view.sortBy === "conversion" ? (view.direction === "asc" ? "ascending" : "descending") : "none"} scope="col"><button disabled={!closedMetricsAvailable} onClick={() => updateSort("conversion")} type="button">Conversion % ↕</button></th>
                    <th scope="col">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      data-highlighted={highlightedRow === row.profileId ? "" : undefined}
                      data-podium={row.displayRank <= 3 ? row.displayRank : undefined}
                      key={row.profileId}
                      onBlur={() => setHighlightedRow(null)}
                      onFocus={() => setHighlightedRow(row.profileId)}
                      onMouseEnter={() => setHighlightedRow(row.profileId)}
                      onMouseLeave={() => setHighlightedRow(null)}
                      tabIndex={0}
                    >
                      <td><span className={styles.rankBadge} data-rank={row.displayRank <= 3 ? row.displayRank : undefined}>{row.displayRank <= 3 ? "♛" : null} {row.displayRank}</span><small data-tone={(row.movement ?? 0) > 0 ? "up" : (row.movement ?? 0) < 0 ? "down" : "neutral"}>{row.movement === null ? "—" : row.movement > 0 ? `↑ ${row.movement}` : row.movement < 0 ? `↓ ${Math.abs(row.movement)}` : "—"}</small></td>
                      <th scope="row">{row.realName}</th>
                      <td>{row.americanName}</td>
                      <td><span className={styles.teamPill}>{row.teamName ?? "Unassigned"}</span></td>
                      <td className={styles.numeric}>{formatNumber(row.transferCount)}</td>
                      <td className={`${styles.numeric} ${view.metric === "closed-deals" ? styles.activeMetric : ""}`}>{closedMetricsAvailable ? formatNumber(row.closedDeals) : "N/A"}</td>
                      <td className={styles.numeric}><span className={styles.conversionPill} data-tone={(row.conversion ?? 0) >= 40 ? "high" : (row.conversion ?? 0) >= 25 ? "medium" : "low"}>{closedMetricsAvailable ? formatMetric(row.conversion, "conversion") : "N/A"}</span></td>
                      <td><TrendCell metric={view.metric} row={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayedRows.length)} of {displayedRows.length}</span>
              <div>
                <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Previous</button>
                <strong>{page} / {pageCount}</strong>
                <button disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">Next</button>
              </div>
            </div>
          </>
        )}
      </section>

      {data.status === "ready" && closedMetricsAvailable && data.closedSourceEmpty ? (
        <p className={styles.quietStatus} role="status">The Closed source is connected, but no closed-deal submissions were found.</p>
      ) : null}

      {data.status === "ready" && data.closedDiagnostics ? (
        <details className={styles.diagnostics}>
          <summary>Administrator source diagnostics</summary>
          <dl>
            <div><dt>Connection</dt><dd>{data.closedDiagnostics.connectionStatus}</dd></div>
            <div><dt>Worksheet</dt><dd>{data.closedDiagnostics.worksheet}</dd></div>
            <div><dt>Valid rows</dt><dd>{formatNumber(data.closedDiagnostics.validRows)}</dd></div>
            <div><dt>Matched rows</dt><dd>{formatNumber(data.closedDiagnostics.matchedRows)}</dd></div>
            <div><dt>Unmatched rows</dt><dd>{formatNumber(data.closedDiagnostics.unmatchedRows)}</dd></div>
            <div><dt>Invalid rows</dt><dd>{formatNumber(data.closedDiagnostics.invalidRows)}</dd></div>
          </dl>
        </details>
      ) : null}

      {data.status === "ready" && data.closedErrorDiagnostics ? (
        <details className={styles.diagnostics}>
          <summary>Administrator source diagnostics</summary>
          <dl>
            <div><dt>Connection</dt><dd>{data.closedErrorDiagnostics.connectionStatus}</dd></div>
            <div><dt>Worksheet</dt><dd>{data.closedErrorDiagnostics.worksheet}</dd></div>
            <div><dt>Headers</dt><dd>{data.closedErrorDiagnostics.headerValidationStatus}</dd></div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}
