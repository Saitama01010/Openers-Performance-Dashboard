"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ActiveImportDialog } from "@/app/admin/imports/active-import-dialog";
import { ImportDeleteForm } from "@/app/admin/imports/import-delete-form";
import styles from "@/app/admin/imports/import-history.module.css";
import { RestoreImportDialog } from "@/app/admin/imports/restore-import-dialog";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import type { ActiveImportLifecycleOptions } from "@/import/active-lifecycle";
import type {
  ImportHistoryFacets,
  ImportHistoryFilters,
  ImportHistoryRow,
  ImportHistorySummary,
} from "@/import/service";
import { importStatusLabel, importTypeLabel } from "@/presentation/labels";

type Highlight = "all" | "active" | "published" | "failed" | "drafts";
type DrawerIntent = "details" | "restore" | "deactivate" | "delete";

type WorkspaceProps = {
  facets: ImportHistoryFacets;
  filters: Required<
    Pick<ImportHistoryFilters, "dateRange" | "order" | "sort">
  > & {
    importType: string;
    search: string;
    status: string;
    uploadedById: string;
  };
  lifecycleEntries: ReadonlyArray<readonly [string, ActiveImportLifecycleOptions]>;
  page: number;
  pageSize: number;
  rows: ImportHistoryRow[];
  summary: ImportHistorySummary;
  total: number;
};

const draftStatuses = new Set([
  "uploaded",
  "processing",
  "draft",
  "ready_to_publish",
]);
const failedStatuses = new Set(["failed", "validation_failed"]);
const restorableStatuses = new Set([
  "deactivated",
  "superseded",
  "rolled_back",
]);

function formatDate(value: Date | null | undefined, dateOnly = false) {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en-US", dateOnly
    ? { day: "numeric", month: "short", year: "numeric" }
    : {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value));
}

function relativeDate(value: Date) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days.toLocaleString("en-US")} days ago`;
}

function reportingPeriod(row: Pick<ImportHistoryRow, "reportingEndDate" | "reportingStartDate">) {
  if (!row.reportingStartDate) return "N/A";
  if (row.reportingEndDate && row.reportingEndDate !== row.reportingStartDate) {
    return `${row.reportingStartDate} – ${row.reportingEndDate}`;
  }
  return row.reportingStartDate;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString("en-US")} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function displayStatus(row: ImportHistoryRow) {
  return row.activeVersionCount > 0 ? "active" : row.status;
}

function statusTone(status: string) {
  if (status === "active") return "success";
  if (failedStatuses.has(status) || status === "rejected") return "danger";
  if (draftStatuses.has(status)) return "warning";
  if (["superseded", "rolled_back", "deactivated"].includes(status)) {
    return "neutral";
  }
  return "info";
}

function statusExplanation(row: ImportHistoryRow) {
  const status = displayStatus(row);
  if (status === "active") {
    return "This version currently powers one or more dashboard dataset scopes.";
  }
  if (row.publishedAt && restorableStatuses.has(status)) {
    return "This published historical version can be considered for restoration under current backend rules.";
  }
  if (failedStatuses.has(status)) {
    return "This import did not become an active dataset. Open the full record for authoritative validation findings.";
  }
  if (draftStatuses.has(status)) {
    return "This draft has not been published. Review availability remains governed by its stored state.";
  }
  return `Current import status: ${importStatusLabel(status)}.`;
}

function rowMatchesHighlight(row: ImportHistoryRow, highlight: Highlight | null) {
  if (!highlight || highlight === "all") return true;
  if (highlight === "active") return row.activeVersionCount > 0;
  if (highlight === "published") return Boolean(row.publishedAt);
  if (highlight === "failed") return failedStatuses.has(row.status);
  return draftStatuses.has(row.status);
}

function excludedRows(row: ImportHistoryRow) {
  const values = [
    row.unmatchedRowCount,
    row.unauthorizedRowCount,
    row.invalidRowCount,
    row.unchangedRowCount,
  ].filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

function canRestore(row: ImportHistoryRow) {
  return (
    row.activeVersionCount === 0 &&
    Boolean(row.publishedAt) &&
    restorableStatuses.has(row.status)
  );
}

function queryString(
  filters: WorkspaceProps["filters"],
  pageSize: number,
  overrides: Record<string, string | number | null | undefined> = {},
) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.importType) params.set("type", filters.importType);
  if (filters.uploadedById) params.set("uploader", filters.uploadedById);
  if (filters.dateRange !== "all") params.set("range", filters.dateRange);
  if (filters.sort !== "uploadedAt") params.set("sort", filters.sort);
  if (filters.order !== "desc") params.set("order", filters.order);
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  return params.toString();
}

function historyHref(
  filters: WorkspaceProps["filters"],
  pageSize: number,
  overrides: Record<string, string | number | null | undefined>,
) {
  const query = queryString(filters, pageSize, overrides);
  return query ? `/admin/imports?${query}` : "/admin/imports";
}

function MetricCard({
  active,
  count,
  detail,
  highlight,
  icon,
  label,
  note,
  onHover,
  onPin,
  tone,
}: {
  active: boolean;
  count: number;
  detail: React.ReactNode;
  highlight: Highlight;
  icon: "freshness" | "import" | "info" | "permissions";
  label: string;
  note: string;
  onHover: (highlight: Highlight | null) => void;
  onPin: (highlight: Highlight) => void;
  tone: "blue" | "green" | "red" | "amber";
}) {
  const tooltipId = useId();
  return (
    <button
      aria-describedby={tooltipId}
      aria-pressed={active}
      className={`${styles.metricCard} ${styles[`metric${tone}`]} ${active ? styles.metricActive : ""}`}
      onBlur={() => onHover(null)}
      onClick={() => onPin(highlight)}
      onFocus={() => onHover(highlight)}
      onMouseEnter={() => onHover(highlight)}
      onMouseLeave={() => onHover(null)}
      type="button"
    >
      <span className={styles.metricCopy}>
        <span className={styles.metricLabel}>{label}</span>
        <strong>{count.toLocaleString("en-US")}</strong>
        <span className={styles.metricNote}>{note}</span>
      </span>
      <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
      <span className={styles.metricTooltip} id={tooltipId} role="tooltip">
        <strong>{label}</strong>
        {detail}
        <small>Click to pin the related rows.</small>
      </span>
    </button>
  );
}

function StatusBadge({ row }: { row: ImportHistoryRow }) {
  const tooltipId = useId();
  const status = displayStatus(row);
  return (
    <span
      aria-describedby={tooltipId}
      className={`${styles.statusBadge} ${styles[`status${statusTone(status)}`]}`}
      tabIndex={0}
    >
      <span aria-hidden="true" className={styles.statusDot} />
      {importStatusLabel(status)}
      <span className={styles.statusTooltip} id={tooltipId} role="tooltip">
        <strong>{importStatusLabel(status)}</strong>
        <span>{reportingPeriod(row)}</span>
        <span>{statusExplanation(row)}</span>
      </span>
    </span>
  );
}

function ActionMenu({
  onIntent,
  row,
}: {
  onIntent: (intent: DrawerIntent, trigger: HTMLElement) => void;
  row: ImportHistoryRow;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    });
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function keyboardMenu(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") move(current + 1);
    if (event.key === "ArrowUp") move(current - 1);
    if (event.key === "Home") move(0);
    if (event.key === "End") move(items.length - 1);
  }

  function choose(intent: DrawerIntent) {
    const persistentTrigger = buttonRef.current;
    if (!persistentTrigger) return;
    setOpen(false);
    onIntent(intent, persistentTrigger);
  }

  return (
    <div className={styles.actionMenuRoot} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${row.fileName}`}
        className={styles.iconButton}
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open ? (
        <div
          className={styles.actionMenu}
          onKeyDown={keyboardMenu}
          ref={menuRef}
          role="menu"
        >
          <button onClick={() => choose("details")} role="menuitem" type="button">
            View details
          </button>
          <Link href={`/admin/imports/${row.id}`} role="menuitem">Open full record</Link>
          {canRestore(row) ? (
            <button onClick={() => choose("restore")} role="menuitem" type="button">Restore</button>
          ) : null}
          {row.activeVersionCount > 0 ? (
            <button onClick={() => choose("deactivate")} role="menuitem" type="button">Deactivate</button>
          ) : null}
          {row.deletion.allowed ? (
            <button className={styles.menuDanger} onClick={() => choose("delete")} role="menuitem" type="button">
              Permanently delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailsDrawer({
  intent,
  lifecycle,
  onClose,
  returnQuery,
  row,
  trigger,
}: {
  intent: DrawerIntent;
  lifecycle: ActiveImportLifecycleOptions | undefined;
  onClose: () => void;
  returnQuery: string;
  row: ImportHistoryRow;
  trigger: HTMLElement | null;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const status = displayStatus(row);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [onClose, trigger]);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(row.fileHash);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className={styles.drawerLayer}>
      <button aria-label="Close import details" className={styles.drawerBackdrop} onClick={onClose} type="button" />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.drawer}
        ref={drawerRef}
        role="dialog"
      >
        <header className={styles.drawerHeader}>
          <div>
            <p>Import details</p>
            <h2 id={titleId}>{row.fileName}</h2>
          </div>
          <button aria-label="Close import details" className={styles.drawerClose} onClick={onClose} ref={closeRef} type="button">
            <DashboardIcon name="close" />
          </button>
        </header>

        <div className={styles.drawerScroll}>
          <section className={styles.drawerIdentity}>
            <span className={styles.fileGlyph}><DashboardIcon name="import" /></span>
            <div>
              <StatusBadge row={row} />
              <p>Batch ID: <span>{row.id}</span></p>
            </div>
          </section>

          <section className={styles.drawerSection}>
            <h3>Report</h3>
            <dl className={styles.detailList}>
              <div><dt>Reporting period</dt><dd>{reportingPeriod(row)}</dd></div>
              <div><dt>Granularity</dt><dd>{row.granularity === "daily" ? "Daily" : "Hourly"}</dd></div>
              <div><dt>Imported</dt><dd>{formatDate(row.uploadedAt)}</dd></div>
              <div><dt>Published</dt><dd>{formatDate(row.publishedAt)}</dd></div>
              <div><dt>Uploaded by</dt><dd>{row.uploadedBy}</dd></div>
            </dl>
          </section>

          <section className={styles.drawerSection}>
            <h3>File details</h3>
            <dl className={styles.detailList}>
              <div><dt>Import type</dt><dd>{importTypeLabel(row.importType)}</dd></div>
              <div><dt>File size</dt><dd>{formatFileSize(row.fileSizeBytes)}</dd></div>
              <div><dt>Duplicate state</dt><dd>{row.duplicateFile === null ? "N/A" : row.duplicateFile ? "Duplicate detected" : "Unique file"}</dd></div>
            </dl>
            <div className={styles.hashField}>
              <span>SHA-256</span>
              <code>{row.fileHash}</code>
              <button aria-label="Copy SHA-256" className={styles.copyButton} onClick={copyHash} type="button">Copy</button>
              <p aria-live="polite">{copyState === "copied" ? "SHA-256 copied." : copyState === "failed" ? "Copy failed. Select the hash manually." : ""}</p>
            </div>
          </section>

          <section className={styles.drawerSection}>
            <h3>Rows</h3>
            <dl className={styles.rowStats}>
              <div><dt>Rows in file</dt><dd>{row.rowCount.toLocaleString("en-US")}</dd></div>
              <div><dt>Mapped rows</dt><dd>{row.mappedRowCount?.toLocaleString("en-US") ?? "N/A"}</dd></div>
              <div><dt>Unmatched rows</dt><dd>{row.unmatchedRowCount?.toLocaleString("en-US") ?? "N/A"}</dd></div>
              <div><dt>Unauthorized rows</dt><dd>{row.unauthorizedRowCount?.toLocaleString("en-US") ?? "N/A"}</dd></div>
              <div><dt>Invalid rows</dt><dd>{row.invalidRowCount?.toLocaleString("en-US") ?? "N/A"}</dd></div>
              <div><dt>Unchanged rows</dt><dd>{row.unchangedRowCount?.toLocaleString("en-US") ?? "N/A"}</dd></div>
            </dl>
          </section>

          <section className={styles.drawerSection}>
            <h3>Dataset status</h3>
            <div className={`${styles.datasetState} ${styles[`dataset${statusTone(status)}`]}`}>
              <StatusBadge row={row} />
              <p>{statusExplanation(row)}</p>
            </div>
          </section>

          <section className={styles.drawerSection}>
            <h3>Actions</h3>
            {intent !== "details" ? <p className={styles.actionPrompt}>Selected action: {intent === "delete" ? "Permanent deletion" : importStatusLabel(intent)}</p> : null}
            <div className={styles.drawerActions}>
              {draftStatuses.has(row.status) ? (
                <Link className={styles.primaryButton} href={`/import?preview=${row.id}`}>Review import</Link>
              ) : null}
              <Link className={styles.secondaryButton} href={`/admin/imports/${row.id}`}>Open full record</Link>
              <a className={styles.secondaryButton} href={`/api/imports/${row.id}/download`}>Download original</a>
              {canRestore(row) ? (
                <RestoreImportDialog
                  batchId={row.id}
                  fileName={row.fileName}
                  reportingPeriod={reportingPeriod(row)}
                  returnQuery={returnQuery}
                  triggerClassName={intent === "restore" ? styles.emphasizedButton : styles.secondaryButton}
                  triggerLabel="Restore version"
                />
              ) : null}
              {lifecycle?.canDeactivate ? (
                <ActiveImportDialog
                  batchId={row.id}
                  dialer={row.dialerId ?? "Default"}
                  fileName={row.fileName}
                  importType={row.importType}
                  lifecycle={lifecycle}
                  reportingPeriod={reportingPeriod(row)}
                  returnQuery={returnQuery}
                  rowCount={row.rowCount}
                  status={row.status}
                  team={row.teams.join(", ") || "Company"}
                  triggerClassName={intent === "deactivate" ? styles.emphasizedDangerButton : styles.dangerOutlineButton}
                  triggerLabel="Deactivate dataset"
                  uploadDate={formatDate(row.uploadedAt)}
                />
              ) : null}
              {row.deletion.allowed ? (
                <ImportDeleteForm
                  assessment={row.deletion}
                  batchId={row.id}
                  fileName={row.fileName}
                  reportingPeriod={reportingPeriod(row)}
                  returnQuery={returnQuery}
                  status={status}
                  triggerClassName={intent === "delete" ? styles.emphasizedDangerButton : styles.dangerButton}
                />
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SortHeading({
  children,
  column,
  filters,
  pageSize,
}: {
  children: React.ReactNode;
  column: NonNullable<ImportHistoryFilters["sort"]>;
  filters: WorkspaceProps["filters"];
  pageSize: number;
}) {
  const selected = filters.sort === column;
  const order = selected && filters.order === "desc" ? "asc" : "desc";
  return (
    <Link
      aria-label={`Sort by ${String(children)} ${order === "asc" ? "ascending" : "descending"}`}
      className={styles.sortLink}
      href={historyHref(filters, pageSize, { order, page: null, sort: column })}
    >
      {children}<span aria-hidden="true">{selected ? (filters.order === "desc" ? "↓" : "↑") : "↕"}</span>
    </Link>
  );
}

export function ImportHistoryWorkspace({
  facets,
  filters,
  lifecycleEntries,
  page,
  pageSize,
  rows,
  summary,
  total,
}: WorkspaceProps) {
  const [hoverHighlight, setHoverHighlight] = useState<Highlight | null>(null);
  const [pinnedHighlight, setPinnedHighlight] = useState<Highlight | null>(null);
  const [selected, setSelected] = useState<{ id: string; intent: DrawerIntent; trigger: HTMLElement | null } | null>(null);
  const lifecycleById = useMemo(() => new Map(lifecycleEntries), [lifecycleEntries]);
  const activeHighlight = hoverHighlight ?? pinnedHighlight;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(total, page * pageSize);
  const selectedRow = rows.find((row) => row.id === selected?.id) ?? null;
  const currentQuery = queryString(filters, pageSize, page > 1 ? { page } : {});
  const pageNumbers = Array.from(
    new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages)),
  ).sort((left, right) => left - right);

  function pin(highlight: Highlight) {
    setPinnedHighlight((current) => current === highlight ? null : highlight);
  }

  function openDrawer(row: ImportHistoryRow, intent: DrawerIntent, trigger: HTMLElement) {
    setSelected({ id: row.id, intent, trigger });
  }

  const publishedPercent = summary.total > 0 ? (summary.published / summary.total) * 100 : 0;
  const failedPercent = summary.total > 0 ? (summary.failed / summary.total) * 100 : 0;
  const draftPercent = summary.total > 0 ? (summary.drafts / summary.total) * 100 : 0;

  return (
    <>
      <section aria-label="Import history summary" className={styles.metricGrid}>
        <MetricCard
          active={pinnedHighlight === "all"}
          count={summary.total}
          detail={<><span>First import: {formatDate(summary.earliestImportAt, true)}</span><span>Most recent: {formatDate(summary.latestImportAt, true)}</span></>}
          highlight="all"
          icon="import"
          label="Total imports"
          note="All permanent records"
          onHover={setHoverHighlight}
          onPin={pin}
          tone="blue"
        />
        <MetricCard
          active={pinnedHighlight === "active"}
          count={summary.active}
          detail={summary.activeImports.length > 0 ? <>{summary.activeImports.slice(0, 3).map((item) => <span key={item.id}>{item.fileName} · {item.reportingStartDate ?? "Date unavailable"} · {item.uploadedBy}</span>)}</> : <span>No import currently powers a dataset scope.</span>}
          highlight="active"
          icon="permissions"
          label="Active dataset"
          note={summary.active === 1 ? "1 import powers dashboards" : `${summary.active} imports power dashboards`}
          onHover={setHoverHighlight}
          onPin={pin}
          tone="green"
        />
        <MetricCard
          active={pinnedHighlight === "published"}
          count={summary.published}
          detail={<><span>{publishedPercent.toFixed(1)}% of all imports have a publication timestamp.</span><span>Includes active and historical published versions.</span></>}
          highlight="published"
          icon="freshness"
          label="Published"
          note={`${publishedPercent.toFixed(1)}% of all imports`}
          onHover={setHoverHighlight}
          onPin={pin}
          tone="green"
        />
        <MetricCard
          active={pinnedHighlight === "failed"}
          count={summary.failed}
          detail={<><span>{failedPercent.toFixed(1)}% of all imports are failed or validation failed.</span><span>Most recent: {summary.mostRecentFailure ? `${summary.mostRecentFailure.fileName} · ${formatDate(summary.mostRecentFailure.uploadedAt)}` : "None"}</span></>}
          highlight="failed"
          icon="info"
          label="Failed"
          note={`${failedPercent.toFixed(1)}% of all imports`}
          onHover={setHoverHighlight}
          onPin={pin}
          tone="red"
        />
        <MetricCard
          active={pinnedHighlight === "drafts"}
          count={summary.drafts}
          detail={<><span>{draftPercent.toFixed(1)}% of all imports remain unpublished drafts.</span><span>Oldest: {summary.oldestDraft ? `${summary.oldestDraft.fileName} · ${formatDate(summary.oldestDraft.uploadedAt)}` : "None"}</span><span>Newest: {summary.newestDraft ? `${summary.newestDraft.fileName} · ${formatDate(summary.newestDraft.uploadedAt)}` : "None"}</span></>}
          highlight="drafts"
          icon="import"
          label="Drafts"
          note={`${draftPercent.toFixed(1)}% of all imports`}
          onHover={setHoverHighlight}
          onPin={pin}
          tone="amber"
        />
      </section>

      <section className={styles.historyPanel}>
        <form className={styles.filterToolbar} method="get">
          <label className={styles.searchField}>
            <span className="sr-only">Search imports</span>
            <DashboardIcon name="search" />
            <input defaultValue={filters.search} name="q" placeholder="Search imports..." />
          </label>
          <label><span>Status</span><select defaultValue={filters.status} name="status"><option value="">All statuses</option>{facets.statuses.map((status) => <option key={status} value={status}>{importStatusLabel(status)}</option>)}</select></label>
          <label><span>File type</span><select defaultValue={filters.importType} name="type"><option value="">All types</option>{facets.importTypes.map((type) => <option key={type} value={type}>{importTypeLabel(type)}</option>)}</select></label>
          <label><span>Uploaded by</span><select defaultValue={filters.uploadedById} name="uploader"><option value="">All users</option>{facets.uploaders.map((uploader) => <option key={uploader.id} value={uploader.id}>{uploader.name}</option>)}</select></label>
          <label><span>Date range</span><select defaultValue={filters.dateRange} name="range"><option value="all">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="year">This year</option></select></label>
          <input name="sort" type="hidden" value={filters.sort} />
          <input name="order" type="hidden" value={filters.order} />
          {pageSize !== 25 ? <input name="pageSize" type="hidden" value={pageSize} /> : null}
          <div className={styles.filterActions}>
            <button className={styles.primaryButton} type="submit">Apply filters</button>
            <Link className={styles.clearButton} href="/admin/imports">Clear filters</Link>
          </div>
        </form>

        <div aria-label="Import history. Scroll horizontally to view all columns." className={styles.tableScroll} role="region" tabIndex={0}>
          <table className={styles.historyTable}>
            <caption>Permanent administrator-only import history</caption>
            <thead><tr>
              <th scope="col"><SortHeading column="uploadedAt" filters={filters} pageSize={pageSize}>Import date</SortHeading></th>
              <th scope="col"><SortHeading column="fileName" filters={filters} pageSize={pageSize}>File name</SortHeading></th>
              <th scope="col"><SortHeading column="reportingPeriod" filters={filters} pageSize={pageSize}>Reporting period</SortHeading></th>
              <th scope="col">File type</th>
              <th scope="col"><SortHeading column="status" filters={filters} pageSize={pageSize}>Status</SortHeading></th>
              <th scope="col">Rows</th>
              <th scope="col">Uploaded by</th>
              <th scope="col">Actions</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className={styles.emptyState} colSpan={8}><DashboardIcon name="import" /><strong>{summary.total === 0 ? "No imports yet" : "No imports match these filters"}</strong><span>{summary.total === 0 ? "Upload a CSV to create the first permanent import record." : "Clear or adjust the filters to see more history."}</span>{summary.total === 0 ? <Link className={styles.primaryButton} href="/import">Upload CSV</Link> : <Link className={styles.secondaryButton} href="/admin/imports">Clear filters</Link>}</td></tr>
              ) : rows.map((row) => {
                const matches = rowMatchesHighlight(row, activeHighlight);
                const selectedRow = selected?.id === row.id;
                const excluded = excludedRows(row);
                return (
                  <tr className={`${!matches ? styles.rowMuted : ""} ${matches && activeHighlight ? styles.rowEmphasized : ""} ${selectedRow ? styles.rowSelected : ""}`} key={row.id} tabIndex={0}>
                    <td><strong>{formatDate(row.uploadedAt)}</strong><span>{relativeDate(row.uploadedAt)}</span></td>
                    <th scope="row"><strong>{row.fileName}</strong><span>Batch ID: {row.id}</span></th>
                    <td><strong>{reportingPeriod(row)}</strong><span>{row.granularity === "daily" ? "Daily" : "Hourly"}</span></td>
                    <td><strong>{importTypeLabel(row.importType)}</strong><span>{row.source}</span></td>
                    <td><StatusBadge row={row} /></td>
                    <td className={styles.numericCell}><strong>{row.rowCount.toLocaleString("en-US")}</strong><span>{row.mappedRowCount !== null || excluded !== null ? `+${(row.mappedRowCount ?? 0).toLocaleString("en-US")} / -${(excluded ?? 0).toLocaleString("en-US")}` : `${row.matchedAgentCount.toLocaleString("en-US")} mapped agents`}</span></td>
                    <td><strong>{row.uploadedBy}</strong></td>
                    <td><div className={styles.rowActions}>
                      <button className={styles.viewButton} onClick={(event) => openDrawer(row, "details", event.currentTarget)} type="button">View details</button>
                      <ActionMenu onIntent={(intent, trigger) => openDrawer(row, intent, trigger)} row={row} />
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className={styles.paginationBar}>
          <span>Showing {firstRow} to {lastRow} of {total.toLocaleString("en-US")} imports</span>
          <nav aria-label="Import history pages" className={styles.pageButtons}>
            <Link aria-disabled={page <= 1} className={page <= 1 ? styles.pageDisabled : ""} href={historyHref(filters, pageSize, { page: Math.max(1, page - 1) })}>‹<span className="sr-only">Previous page</span></Link>
            {pageNumbers.map((number, index) => <span className={styles.pageCluster} key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}<Link aria-current={number === page ? "page" : undefined} href={historyHref(filters, pageSize, { page: number === 1 ? null : number })}>{number}</Link></span>)}
            <Link aria-disabled={page >= totalPages} className={page >= totalPages ? styles.pageDisabled : ""} href={historyHref(filters, pageSize, { page: Math.min(totalPages, page + 1) })}>›<span className="sr-only">Next page</span></Link>
          </nav>
          <form className={styles.pageSizeForm} method="get">
            {filters.search ? <input name="q" type="hidden" value={filters.search} /> : null}
            {filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
            {filters.importType ? <input name="type" type="hidden" value={filters.importType} /> : null}
            {filters.uploadedById ? <input name="uploader" type="hidden" value={filters.uploadedById} /> : null}
            {filters.dateRange !== "all" ? <input name="range" type="hidden" value={filters.dateRange} /> : null}
            <input name="sort" type="hidden" value={filters.sort} />
            <input name="order" type="hidden" value={filters.order} />
            <label>Rows per page <select defaultValue={pageSize} name="pageSize" onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
          </form>
        </footer>
      </section>

      {selected && selectedRow ? (
        <DetailsDrawer
          intent={selected.intent}
          lifecycle={lifecycleById.get(selectedRow.id)}
          onClose={() => setSelected(null)}
          returnQuery={currentQuery}
          row={selectedRow}
          trigger={selected.trigger}
        />
      ) : null}
    </>
  );
}
