"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuditCategory } from "@/admin/audit-format";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Badge } from "@/components/ui/base-badge";
import { METRIC_CARD_TONES, metricCardStyle } from "@/components/ui/statistics-card";
import { roleLabel } from "@/presentation/labels";
import styles from "./audit-admin.module.css";

type Row = {
  id: string;
  createdAt: string;
  actor: { id: string | null; name: string; email: string | null; role: "admin" | "manager" | "agent"; unavailable: boolean };
  action: string;
  title: string;
  description: string;
  entityType: string;
  entityId: string | null;
  target: { label: string; typeLabel: string; available: boolean };
  category: AuditCategory;
  categoryLabel: string;
  isToday: boolean;
  isImportEvent: boolean;
  isAdminAction: boolean;
};

type Details = {
  id: string;
  action: string;
  title: string;
  description: string;
  category: AuditCategory;
  categoryLabel: string;
  createdAt: string;
  actor: Row["actor"];
  target: Row["target"] & { id: string | null; entityType: string };
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  relatedLinks: Array<{ href: string; label: string }>;
};

type Props = {
  data: {
    rows: Row[];
    options: {
      actors: Array<{ id: string; name: string }>;
      actions: Array<{ value: string; label: string }>;
      targets: Array<{ value: string; label: string }>;
      categories: Array<{ value: AuditCategory; label: string }>;
    };
    pagination: { page: number; pageSize: number; totalRows: number; totalPages: number; from: number; to: number };
  };
  filters: {
    query: string; range: string; from: string; to: string; actorId: string; action: string; targetType: string;
    category: AuditCategory | ""; page: number; pageSize: number; direction: "asc" | "desc";
    focus: "today" | "admin-actions" | "import-events" | "unique-actors" | ""; dateLabel: string;
  };
  stats: { totalEvents: number; eventsToday: number; adminActions: number; importEvents: number; uniqueActors: number; periodLabel: string };
  timeZone: string;
  now: string;
};

const SAVED_VIEW_KEY = "openers:audit-view:v1";
const SAVED_KEYS = ["q", "range", "from", "to", "actor", "action", "target", "category", "pageSize", "direction"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function formatWhen(value: string, timeZone: string, now: string) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone });
  const delta = Math.max(0, new Date(now).getTime() - date.getTime());
  const relative = delta < 60_000 ? "Just now" : delta < 3_600_000 ? `${Math.floor(delta / 60_000)} minutes ago` : delta < 86_400_000 ? `${Math.floor(delta / 3_600_000)} hours ago` : null;
  return { absolute: formatter.format(date), relative };
}

function pageNumbers(page: number, total: number) {
  const values = new Set([1, total, page - 1, page, page + 1]);
  return [...values].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
}

function percent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}% of events` : "0% of events";
}

export function AdminAuditWorkspace({ data, filters, stats, timeZone, now }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [preview, setPreview] = useState<"today" | "admin" | "import" | "actors" | null>(null);
  const [range, setRange] = useState(filters.range);
  const exportHref = `/api/admin/audit/export${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const hasFilters = Boolean(filters.query || filters.actorId || filters.action || filters.targetType || filters.category || filters.range !== "last-7" || filters.focus);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  const openDetails = async (id: string, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    setSelectedId(id);
    setDetails(null);
    setError("");
    setLoading(true);
    dialogRef.current?.showModal();
    try {
      const response = await fetch(`/api/admin/audit/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "This event is no longer available." : "Technical evidence could not be loaded.");
      setDetails(await response.json() as Details);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Technical evidence could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const closeDetails = () => dialogRef.current?.close();
  const restoreFocus = () => {
    setSelectedId(null);
    returnFocusRef.current?.focus();
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setAnnouncement(`${label} copied.`);
    } catch {
      setAnnouncement(`${label} could not be copied.`);
    }
  };

  const saveView = () => {
    const saved = Object.fromEntries(SAVED_KEYS.map((key) => [key, searchParams.get(key) ?? ""]).filter(([, value]) => value));
    localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify(saved));
    setAnnouncement("Audit view saved on this browser.");
  };

  const applyView = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_VIEW_KEY) ?? "{}") as Record<string, unknown>;
      const next = new URLSearchParams();
      for (const key of SAVED_KEYS) if (typeof saved[key] === "string" && saved[key]) next.set(key, saved[key] as string);
      router.push(`${pathname}${next.size ? `?${next}` : ""}`);
      setAnnouncement("Saved audit view applied.");
    } catch {
      setAnnouncement("The saved view could not be applied.");
    }
  };

  const clearView = () => {
    localStorage.removeItem(SAVED_VIEW_KEY);
    setAnnouncement("Saved audit view removed.");
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("close", restoreFocus);
    return () => dialog.removeEventListener("close", restoreFocus);
  }, []);

  const filteredSummary = useMemo(() => `${data.pagination.totalRows.toLocaleString()} authorized event${data.pagination.totalRows === 1 ? "" : "s"} in ${filters.dateLabel.toLowerCase()}`, [data.pagination.totalRows, filters.dateLabel]);

  return <>
    <section aria-label="Audit statistics" className={styles.kpis}>
      <Kpi active={!filters.focus} detail={`All authorized events in ${stats.periodLabel.toLowerCase()}.`} icon="audit" label="Total events" meta={stats.periodLabel} onActivate={() => updateParams({ focus: null })} onPreview={setPreview} preview={null} value={stats.totalEvents} />
      <Kpi active={filters.focus === "today"} detail="Events recorded today in the configured reporting timezone." icon="calendar" label="Events today" meta={percent(stats.eventsToday, stats.totalEvents)} onActivate={() => updateParams({ focus: filters.focus === "today" ? null : "today", range: filters.focus === "today" ? "last-7" : "today" })} onPreview={setPreview} preview="today" value={stats.eventsToday} />
      <Kpi active={filters.focus === "admin-actions"} detail="User, team, and data-management actions; import events are classified separately." icon="users" label="Admin actions" meta={percent(stats.adminActions, stats.totalEvents)} onActivate={() => updateParams({ focus: filters.focus === "admin-actions" ? null : "admin-actions" })} onPreview={setPreview} preview="admin" value={stats.adminActions} />
      <Kpi active={filters.focus === "import-events"} detail="Dialer and user-import lifecycle events derived from stored action and entity keys." icon="import" label="Import events" meta={percent(stats.importEvents, stats.totalEvents)} onActivate={() => updateParams({ focus: filters.focus === "import-events" ? null : "import-events" })} onPreview={setPreview} preview="import" value={stats.importEvents} />
      <Kpi active={false} detail="Distinct authorized actors represented in the selected period. Activate to move to the Actor filter." icon="agent" label="Unique actors" meta={stats.periodLabel} onActivate={() => { document.getElementById("audit-actor-filter")?.focus(); setAnnouncement("Actor filter focused."); }} onPreview={setPreview} preview="actors" value={stats.uniqueActors} />
    </section>

    <section className={styles.workspace}>
      <form action={pathname} className={styles.filters} method="get">
        <label className={styles.search}><span className={styles.srOnly}>Search audit events</span><DashboardIcon name="search" /><input defaultValue={filters.query} name="q" placeholder="Search by actor, action, target, or description..." type="search" /></label>
        <label><span>Date range</span><select name="range" onChange={(event) => setRange(event.target.value)} value={range}><option value="today">Today</option><option value="last-7">Last 7 days</option><option value="last-30">Last 30 days</option><option value="all-time">All time</option><option value="custom">Custom</option></select></label>
        {range === "custom" ? <><label><span>From</span><input defaultValue={filters.from} name="from" required type="date" /></label><label><span>To</span><input defaultValue={filters.to} name="to" required type="date" /></label></> : null}
        <label><span>Actor</span><select defaultValue={filters.actorId} id="audit-actor-filter" name="actor"><option value="">All actors</option>{data.options.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
        <label><span>Action</span><select defaultValue={filters.action} name="action"><option value="">All actions</option>{data.options.actions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
        <label><span>Target</span><select defaultValue={filters.targetType} name="target"><option value="">All targets</option>{data.options.targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select></label>
        <label><span>Category</span><select defaultValue={filters.category} name="category"><option value="">All categories</option>{data.options.categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        <input name="direction" type="hidden" value={filters.direction} />
        <div className={styles.filterActions}>
          <button className={styles.button} type="submit">Apply filters</button>
          <Link aria-disabled={!hasFilters} className={styles.buttonSecondary} href={pathname}>Clear filters</Link>
          <details className={styles.savedView}><summary className={styles.buttonSecondary}>Save view</summary><div><button onClick={saveView} type="button">Save current view</button><button onClick={applyView} type="button">Apply saved view</button><button onClick={clearView} type="button">Remove saved view</button></div></details>
          <a className={styles.buttonSecondary} download href={exportHref}><DashboardIcon name="import" /> Export</a>
        </div>
      </form>

      <div className={styles.tableHeading}><span>{filteredSummary}</span><button className={styles.sortButton} onClick={() => updateParams({ direction: filters.direction === "desc" ? "asc" : "desc" })} type="button">{filters.direction === "desc" ? "Newest first" : "Oldest first"}</button></div>
      <div aria-label="Audit events table; scroll horizontally for additional columns" className={styles.tableScroll} role="region" tabIndex={0}>
        <table className={styles.table} data-preview={preview ?? undefined}>
          <caption>Administrative and import audit events</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Category</th><th scope="col">Description</th><th scope="col"><span className={styles.srOnly}>Details</span></th></tr></thead>
          <tbody>{data.rows.length === 0 ? <tr><td className={styles.empty} colSpan={7}><strong>{hasFilters ? "No events match this view" : "No audit events recorded"}</strong><span>{hasFilters ? "Clear or change the server-side filters to see other authorized events." : "Administrative and import activity will appear here after it is recorded."}</span></td></tr> : data.rows.map((row) => {
            const when = formatWhen(row.createdAt, timeZone, now);
            const dimmed = preview === "today" ? !row.isToday : preview === "admin" ? !row.isAdminAction : preview === "import" ? !row.isImportEvent : false;
            return <tr className={dimmed ? styles.dimmed : undefined} data-selected={selectedId === row.id ? "true" : undefined} key={row.id} onClick={(event) => openDetails(row.id, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(row.id, event.currentTarget); } }} tabIndex={0}>
              <td><time dateTime={row.createdAt}>{when.absolute}</time>{when.relative ? <small>{when.relative}</small> : null}</td>
              <td><span className={styles.actor}><span className={styles.avatar}>{initials(row.actor.name)}</span><span><strong>{row.actor.name}</strong><small>{row.actor.unavailable ? "Deleted account" : roleLabel(row.actor.role)}</small></span></span></td>
              <td><span className={styles.action}><i data-category={row.category} />{row.title}</span></td>
              <td><strong>{row.target.label}</strong><small>{row.target.available ? row.target.typeLabel : `${row.target.typeLabel} · unavailable`}</small></td>
              <td><Badge appearance="light" data-category={row.category} size="xs" variant={row.category === "import" ? "primary" : "secondary"}>{row.categoryLabel}</Badge></td>
              <td>{row.description}</td>
              <td><button aria-label={`View details for ${row.title}`} onClick={(event) => { event.stopPropagation(); openDetails(row.id, event.currentTarget); }} type="button"><DashboardIcon name="arrowRight" /></button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className={styles.pagination}>
        <span>Showing {data.pagination.from} to {data.pagination.to} of {data.pagination.totalRows.toLocaleString()} events</span>
        <nav aria-label="Audit log pages">
          <PageLink disabled={data.pagination.page <= 1} label="Previous page" page={data.pagination.page - 1} searchParams={searchParams}>‹</PageLink>
          {pageNumbers(data.pagination.page, data.pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}<PageLink active={page === data.pagination.page} label={`Page ${page}`} page={page} searchParams={searchParams}>{page}</PageLink></span>)}
          <PageLink disabled={data.pagination.page >= data.pagination.totalPages} label="Next page" page={data.pagination.page + 1} searchParams={searchParams}>›</PageLink>
        </nav>
        <label><span>Rows per page</span><select onChange={(event) => updateParams({ pageSize: event.target.value })} value={filters.pageSize}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
      </footer>
    </section>

    <dialog aria-labelledby="audit-drawer-title" className={styles.drawer} onClick={(event) => { if (event.target === dialogRef.current) closeDetails(); }} ref={dialogRef}>
      <div className={styles.drawerPanel}>
        <header><strong id="audit-drawer-title">Event details</strong><button aria-label="Close event details" onClick={closeDetails} type="button"><DashboardIcon name="close" /></button></header>
        {loading ? <div aria-live="polite" className={styles.drawerState}>Loading authorized evidence…</div> : error ? <div className={styles.drawerState} role="alert">{error}</div> : details ? <EventDetails details={details} onCopy={copy} timeZone={timeZone} /> : null}
      </div>
    </dialog>
    <p aria-live="polite" className={styles.srOnly}>{announcement}</p>
  </>;
}

function Kpi({ active, detail, icon, label, meta, onActivate, onPreview, preview, value }: { active: boolean; detail: string; icon: "audit" | "calendar" | "users" | "import" | "agent"; label: string; meta: string; onActivate: () => void; onPreview: (value: "today" | "admin" | "import" | "actors" | null) => void; preview: "today" | "admin" | "import" | "actors" | null; value: number }) {
  const tone = icon === "calendar" ? METRIC_CARD_TONES.cyan : icon === "users" ? METRIC_CARD_TONES.purple : icon === "import" ? METRIC_CARD_TONES.orange : icon === "agent" ? METRIC_CARD_TONES.green : METRIC_CARD_TONES.blue;
  return <button aria-pressed={active} className={`${styles.kpi} metric-color-card`} onBlur={() => onPreview(null)} onClick={onActivate} onFocus={() => onPreview(preview)} onPointerEnter={() => onPreview(preview)} onPointerLeave={() => onPreview(null)} style={metricCardStyle(tone)} type="button"><span className="metric-card-label">{label}</span><strong className="metric-card-value">{value.toLocaleString()}</strong><small className="metric-card-detail">{meta}</small><i className="metric-card-icon"><DashboardIcon name={icon} /></i><span className={styles.kpiDetail} role="tooltip">{detail}</span></button>;
}

function PageLink({ active, children, disabled, label, page, searchParams }: { active?: boolean; children: React.ReactNode; disabled?: boolean; label: string; page: number; searchParams: URLSearchParams }) {
  const next = new URLSearchParams(searchParams.toString()); next.set("page", String(page));
  return disabled ? <span aria-disabled="true" className={styles.pageLink}>{children}</span> : <Link aria-current={active ? "page" : undefined} aria-label={label} className={styles.pageLink} href={`?${next}`}>{children}</Link>;
}

function EventDetails({ details, onCopy, timeZone }: { details: Details; onCopy: (value: string, label: string) => void; timeZone: string }) {
  const raw = JSON.stringify(details.metadata ?? {}, null, 2);
  return <div className={styles.details}>
    <section className={styles.eventIdentity}><span className={styles.statusDot} data-category={details.category} /><div><h2>{details.title}</h2><p>{details.categoryLabel}</p></div></section>
    <section><h3>Overview</h3><dl><dt>When</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone }).format(new Date(details.createdAt))}</dd><dt>Actor</dt><dd><strong>{details.actor.name}</strong><span>{roleLabel(details.actor.role)}{details.actor.email ? ` · ${details.actor.email}` : ""}</span></dd><dt>Target</dt><dd><strong>{details.target.label}</strong><span>{details.target.typeLabel}{details.target.available ? "" : " · unavailable"}</span></dd>{details.ipAddress ? <><dt>IP address</dt><dd>{details.ipAddress}</dd></> : null}{details.userAgent ? <><dt>User agent</dt><dd>{details.userAgent}</dd></> : null}<dt>Category</dt><dd><Badge appearance="light" size="xs" variant={details.category === "import" ? "primary" : "secondary"}>{details.categoryLabel}</Badge></dd><dt>Description</dt><dd>{details.description}</dd></dl></section>
    <details className={styles.technical}><summary>Technical details</summary>{details.metadata && Object.keys(details.metadata as object).length ? <><div className={styles.technicalActions}><button onClick={() => onCopy(raw, "Redacted JSON")} type="button">Copy safe JSON</button></div><pre>{raw}</pre></> : <p>No additional technical evidence was recorded for this event.</p>}</details>
    {details.relatedLinks.length ? <section><h3>Related links</h3><ul className={styles.related}>{details.relatedLinks.map((link) => <li key={link.href}><Link href={link.href}>{link.label} <span aria-hidden="true">↗</span></Link></li>)}</ul></section> : <p className={styles.unavailable}>The related entity is unavailable or does not have an authorized management screen.</p>}
    <section><h3>Actions</h3><button className={styles.copyButton} onClick={() => onCopy(details.id, "Event ID")} type="button"><DashboardIcon name="audit" /> Copy event ID</button></section>
  </div>;
}
