"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  type AgentDirectoryData,
  type AgentDirectoryRow,
  type AgentDirectorySortKey,
} from "@/agents/directory-analytics";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { AreaTrend } from "@/components/ui/area-trend";
import styles from "@/components/dashboard/agents/agents-page.module.css";

const SORT_OPTIONS: Array<{ value: AgentDirectorySortKey; label: string }> = [
  { value: "logged-in", label: "Logged-in time" },
  { value: "transfers", label: "Transfers" },
  { value: "closed-deals", label: "Closed deals" },
  { value: "conversion", label: "Conversion" },
  { value: "talk-percentage", label: "Talk %" },
];

const INITIAL_COLORS = ["#1769ef", "#02a9a5", "#7b43ea", "#f18a18", "#24a148", "#d946ef"];

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] ?? "?"}${words.length > 1 ? words.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function initialColor(name: string) {
  const hash = [...name].reduce((value, char) => value + char.charCodeAt(0), 0);
  return INITIAL_COLORS[hash % INITIAL_COLORS.length];
}

function formatNumber(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatPercentage(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function relativeChange(current: number | null, previous: number | null, suffix = "%") {
  if (current === null || previous === null) return null;
  if (suffix === " pp") return { value: current - previous, label: `${Math.abs(current - previous).toFixed(1)} pp` };
  if (previous === 0) return null;
  const value = ((current - previous) / previous) * 100;
  return { value, label: `${Math.abs(value).toFixed(1)}%` };
}

function Comparison({ current, previous, suffix }: { current: number | null; previous: number | null; suffix?: string }) {
  const change = relativeChange(current, previous, suffix);
  if (!change) return <span className={styles.mutedComparison}>No period comparison</span>;
  const direction = change.value > 0 ? "up" : change.value < 0 ? "down" : "flat";
  return (
    <span className={styles.comparison} data-direction={direction}>
      <span aria-hidden="true">{direction === "up" ? "↑" : direction === "down" ? "↓" : "—"}</span>
      {change.label} vs prior period
    </span>
  );
}

function Sparkline({ values, labels, label, color = "#1769ef", large = false }: { values: Array<number | null>; labels?: string[]; label: string; color?: string; large?: boolean }) {
  return (
    <AreaTrend
      ariaLabel={label}
      className={large ? styles.largeSparkline : styles.sparkline}
      color={color}
      emptyLabel="No trend"
      points={values.map((value, index) => ({ label: labels?.[index] ?? `Period ${index + 1}`, value }))}
      size={large ? "large" : "compact"}
    />
  );
}

function trendValues(row: AgentDirectoryRow, sortBy: AgentDirectorySortKey) {
  return row.trend.map((point) => {
    if (sortBy === "transfers") return point.transfers;
    if (sortBy === "closed-deals") return point.closedDeals;
    if (sortBy === "conversion") return point.conversion;
    if (sortBy === "talk-percentage") return point.talkPercentage;
    return point.loggedInSeconds;
  });
}

function KpiCard({ tone, icon, label, value, detail, comparison }: { tone: string; icon: "users" | "agent" | "freshness" | "talk"; label: string; value: string; detail: string; comparison?: React.ReactNode }) {
  return (
    <article className={styles.kpiCard}>
      <span className={styles.kpiIcon} style={{ backgroundColor: `${tone}16`, color: tone }}><DashboardIcon name={icon} /></span>
      <div>
        <span className={styles.kpiLabel}>{label}</span>
        <strong>{value}</strong>
        {comparison ?? <span className={styles.kpiDetail}>{detail}</span>}
      </div>
    </article>
  );
}

function PreviewMetric({ label, value, current, previous, suffix }: { label: string; value: string; current: number | null; previous: number | null; suffix?: string }) {
  const change = relativeChange(current, previous, suffix);
  return (
    <div className={styles.previewMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
      {change ? <small data-direction={change.value > 0 ? "up" : change.value < 0 ? "down" : "flat"}>{change.value > 0 ? "↑" : change.value < 0 ? "↓" : "—"} {change.label}</small> : <small>Comparison unavailable</small>}
    </div>
  );
}

function pageHref(current: URLSearchParams, page: number) {
  const next = new URLSearchParams(current.toString());
  next.set("page", String(page));
  return `/agents?${next.toString()}`;
}

export function AgentsPageClient({ data, exportHref }: { data: AgentDirectoryData; exportHref: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(data.filters.query);
  const [selectedId, setSelectedId] = useState(data.rows[0]?.profileId ?? "");
  const [previewOpen, setPreviewOpen] = useState(data.rows.length > 0);
  const [pinned, setPinned] = useState(false);
  const selected = useMemo(
    () => data.rows.find((row) => row.profileId === selectedId) ?? data.rows[0] ?? null,
    [data.rows, selectedId],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape" && previewOpen && !pinned) {
        setPreviewOpen(false);
        return;
      }
      if (target?.matches("input:not([type='radio']), select, textarea, [contenteditable='true']")) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (data.rows.length === 0) return;
      event.preventDefault();
      const current = Math.max(0, data.rows.findIndex((row) => row.profileId === selectedId));
      const next = event.key === "ArrowDown"
        ? Math.min(data.rows.length - 1, current + 1)
        : Math.max(0, current - 1);
      setSelectedId(data.rows[next].profileId);
      setPreviewOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data.rows, pinned, previewOpen, selectedId]);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`/agents?${next.toString()}`, { scroll: false }));
  }

  function select(row: AgentDirectoryRow) {
    setSelectedId(row.profileId);
    setPreviewOpen(true);
  }

  const visiblePages = Array.from({ length: data.pagination.totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === data.pagination.totalPages || Math.abs(page - data.pagination.page) <= 1);
  const performanceHref = selected
    ? `/agents/${selected.profileId}?${new URLSearchParams({
        range: data.range.key,
        ...(data.range.from ? { from: data.range.from } : {}),
        ...(data.range.to ? { to: data.range.to } : {}),
      }).toString()}`
    : "/agents";

  return (
    <div aria-busy={isPending || undefined} className={styles.content}>
      <section aria-label="Agent directory summary" className={styles.kpiGrid}>
        <KpiCard detail="In the current reporting scope" icon="users" label="Visible agents" tone="#1769ef" value={formatNumber(data.kpis.totalAgents)} />
        <KpiCard detail={data.kpis.activeAccountRate === null ? "No visible accounts" : `${data.kpis.activeAccountRate.toFixed(1)}% of visible agents`} icon="agent" label="Active accounts" tone="#16a34a" value={formatNumber(data.kpis.activeAccounts)} />
        <KpiCard comparison={<Comparison current={data.kpis.averageLoggedInSeconds} previous={data.kpis.averageLoggedInComparison} />} detail="" icon="freshness" label="Avg logged-in time" tone="#7c3aed" value={formatDuration(data.kpis.averageLoggedInSeconds)} />
        <KpiCard comparison={<Comparison current={data.kpis.averageTalkPercentage} previous={data.kpis.averageTalkComparison} suffix=" pp" />} detail="" icon="talk" label="Avg talk %" tone="#f97316" value={formatPercentage(data.kpis.averageTalkPercentage)} />
      </section>

      {data.sources.message ? <div className={styles.sourceNotice} role="status"><DashboardIcon name="info" /><span>{data.sources.message}</span></div> : null}

      <section className={styles.directoryCard}>
        <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); navigate({ q: query || null }); }} role="search">
          <label className={styles.searchBox}>
            <span className="sr-only">Search agent name</span>
            <DashboardIcon name="search" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search agent name…" type="search" value={query} />
          </label>
          <label className={styles.field}>
            <span>Team</span>
            <select aria-label="Team" onChange={(event) => navigate({ team: event.target.value || null })} value={data.filters.teamId}>
              <option value="">All teams</option>
              {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Agent data</span>
            <select aria-label="Agent data" onChange={(event) => navigate({ data: event.target.value })} value={data.filters.data}>
              <option value="with-data">With active data</option>
              <option value="all">All visible agents</option>
              <option value="without-data">Without active data</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select aria-label="Account status" onChange={(event) => navigate({ status: event.target.value || null })} value={data.filters.status}>
              <option value="">All statuses</option>
              {data.statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Sort by</span>
            <select aria-label="Sort agents by" onChange={(event) => navigate({ sort: event.target.value })} value={data.filters.sortBy}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button aria-label={`Sort ${data.filters.direction === "desc" ? "ascending" : "descending"}`} className={styles.directionButton} onClick={() => navigate({ direction: data.filters.direction === "desc" ? "asc" : "desc" })} type="button">
            <span aria-hidden="true">{data.filters.direction === "desc" ? "↓" : "↑"}</span>
          </button>
          <button className={styles.searchSubmit} type="submit">Search</button>
          <div aria-label="Agent view" className={styles.segmented} role="group">
            {([['all', 'All agents'], ['top', 'Top performers'], ['attention', 'Needs attention']] as const).map(([value, label]) => (
              <button aria-pressed={data.filters.view === value} key={value} onClick={() => navigate({ view: value === "all" ? null : value })} type="button">{label}</button>
            ))}
          </div>
          <Link className={styles.exportButton} download href={exportHref}><DashboardIcon name="import" />Export</Link>
        </form>

        <div className={previewOpen && selected ? styles.directoryLayout : styles.directoryLayoutWide}>
          <div className={styles.tablePanel}>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption>Role-scoped agent performance for {data.range.label}</caption>
                <thead><tr><th aria-label="Select agent" scope="col" /><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Status</th><th scope="col">Logged-in</th><th scope="col">Transfers</th><th scope="col">Closed</th><th scope="col">Conversion</th><th scope="col">Talk %</th><th scope="col">Trend</th><th aria-label="Open preview" scope="col" /></tr></thead>
                <tbody>
                  {data.rows.length === 0 ? <tr><td colSpan={11}><div className={styles.emptyState}><DashboardIcon name="users" /><strong>No agents match these filters</strong><span>Change a filter or include agents without active data.</span></div></td></tr> : data.rows.map((row) => {
                    const active = selected?.profileId === row.profileId && previewOpen;
                    return (
                      <tr aria-selected={active} data-selected={active || undefined} key={row.profileId} onClick={() => select(row)}>
                        <td><input aria-label={`Preview ${row.realName}`} checked={active} name="selected-agent" onChange={() => select(row)} type="radio" /></td>
                        <th scope="row"><span className={styles.agentIdentity}><span className={styles.avatar} style={{ backgroundColor: initialColor(row.realName) }}>{initials(row.realName)}</span><span><strong>{row.realName}</strong>{row.americanName ? <small>{row.americanName}</small> : null}</span></span></th>
                        <td><span className={styles.teamBadge}>{row.teamName}</span></td>
                        <td><span className={styles.statusBadge} data-status={row.accountStatus}>{row.accountStatus}</span></td>
                        <td className={styles.numeric}>{formatDuration(row.loggedInSeconds)}</td>
                        <td className={styles.numeric}>{formatNumber(row.transfers)}</td>
                        <td className={styles.numeric}>{formatNumber(row.closedDeals)}</td>
                        <td className={styles.numeric}>{formatPercentage(row.conversion)}</td>
                        <td className={styles.numeric}>{formatPercentage(row.talkPercentage)}</td>
                        <td><Sparkline color={initialColor(row.realName)} label={`${SORT_OPTIONS.find((option) => option.value === data.filters.sortBy)?.label} trend for ${row.realName}`} labels={row.trend.map((point) => point.date)} values={trendValues(row, data.filters.sortBy)} /></td>
                        <td><button aria-label={`Open ${row.realName} preview`} className={styles.rowButton} onClick={(event) => { event.stopPropagation(); select(row); }} type="button"><DashboardIcon name="arrowRight" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className={styles.tableFooter}>
              <span>Showing {data.pagination.from}–{data.pagination.to} of {data.pagination.totalRows} agents</span>
              <nav aria-label="Agent directory pages" className={styles.pagination}>
                <Link aria-disabled={data.pagination.page === 1} href={pageHref(searchParams, Math.max(1, data.pagination.page - 1))}>‹<span className="sr-only">Previous page</span></Link>
                {visiblePages.map((page, index) => <span key={page}>{index > 0 && page - visiblePages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}<Link aria-current={page === data.pagination.page ? "page" : undefined} href={pageHref(searchParams, page)}>{page}</Link></span>)}
                <Link aria-disabled={data.pagination.page === data.pagination.totalPages} href={pageHref(searchParams, Math.min(data.pagination.totalPages, data.pagination.page + 1))}>›<span className="sr-only">Next page</span></Link>
              </nav>
            </footer>
          </div>

          {previewOpen && selected ? (
            <aside aria-label={`${selected.realName} performance preview`} className={styles.preview}>
              <div className={styles.previewHeader}>
                <span className={styles.previewAvatar} style={{ backgroundColor: initialColor(selected.realName) }}>{initials(selected.realName)}</span>
                <div><h2>{selected.realName}</h2>{selected.americanName ? <p>{selected.americanName}</p> : null}<span>{selected.teamName}</span></div>
                <button aria-label={pinned ? "Unpin preview" : "Pin preview"} aria-pressed={pinned} className={styles.pinButton} onClick={() => setPinned((value) => !value)} type="button">⌖</button>
                <button aria-label="Close agent preview" className={styles.closeButton} onClick={() => setPreviewOpen(false)} type="button"><DashboardIcon name="close" /></button>
              </div>
              <div className={styles.previewStatus}><span className={styles.statusBadge} data-status={selected.accountStatus}>{selected.accountStatus} account</span><span>{selected.hasMetrics ? "Active data included" : "No active data"}</span></div>
              <div className={styles.previewMetrics}>
                <PreviewMetric current={selected.transfers} label="Transfers" previous={selected.comparison?.transfers ?? null} value={formatNumber(selected.transfers)} />
                <PreviewMetric current={selected.closedDeals} label="Closed deals" previous={selected.comparison?.closedDeals ?? null} value={formatNumber(selected.closedDeals)} />
                <PreviewMetric current={selected.conversion} label="Conversion" previous={selected.comparison?.conversion ?? null} suffix=" pp" value={formatPercentage(selected.conversion)} />
                <PreviewMetric current={selected.loggedInSeconds} label="Logged-in time" previous={selected.comparison?.loggedInSeconds ?? null} value={formatDuration(selected.loggedInSeconds)} />
                <PreviewMetric current={selected.talkSeconds} label="Talk time" previous={null} value={formatDuration(selected.talkSeconds)} />
                <PreviewMetric current={selected.talkPercentage} label="Talk %" previous={selected.comparison?.talkPercentage ?? null} suffix=" pp" value={formatPercentage(selected.talkPercentage)} />
              </div>
              <section className={styles.previewChart}>
                <div><h3>Talk % trend</h3><span>Last {selected.trend.length || 0} recorded days</span></div>
                <Sparkline color="#1769ef" label={`Talk percentage trend for ${selected.realName}`} labels={selected.trend.map((point) => point.date)} large values={selected.trend.map((point) => point.talkPercentage)} />
              </section>
              <section className={styles.previewActions}>
                <h3>What opens next</h3>
                <p>Open the full active-version performance record for this agent.</p>
                <Link className={styles.primaryAction} href={performanceHref}>Open full performance <DashboardIcon name="arrowRight" /></Link>
              </section>
              <p className={styles.previewHint}><DashboardIcon name="info" />Use ↑ and ↓ to change agents. Press Escape to close an unpinned preview.</p>
            </aside>
          ) : null}
        </div>
      </section>
      {isPending ? <div aria-live="polite" className={styles.pending}>Updating agents…</div> : null}
    </div>
  );
}
