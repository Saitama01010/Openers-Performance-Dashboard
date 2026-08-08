"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useFormStatus } from "react-dom";

import styles from "@/app/import/import-page.module.css";
import {
  filterPreviewAgents,
  getPreviewTeams,
  mappingStatusLabels,
  paginatePreviewAgents,
  previewPageSizes,
  sortPreviewAgents,
  type PreviewIncludeFilter,
  type PreviewPageSize,
  type PreviewSortKey,
  type PreviewStatusFilter,
} from "@/app/import/import-preview-table";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  confirmImportAction,
  rejectImportAction,
} from "@/import/actions";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";
import type {
  AgentMappingStatus,
  AgentPreviewSummary,
  DurationTotals,
  ImportPreview,
} from "@/import/dialer";
import type { ImportValidationResult } from "@/import/validation";

type ReviewTab = "preview" | "summary" | "file" | "mapping";
type HighlightStatus =
  | "mapped"
  | "unmapped"
  | "out_of_scope"
  | "invalid_mapping"
  | "invalid_rows"
  | "excluded";

const tabs: { id: ReviewTab; label: string }[] = [
  { id: "preview", label: "Preview data" },
  { id: "summary", label: "Summary" },
  { id: "file", label: "File details" },
  { id: "mapping", label: "Mapping" },
];

const sortLabels: { value: PreviewSortKey; label: string }[] = [
  { value: "agent", label: "Agent name" },
  { value: "calls", label: "Calls" },
  { value: "loggedIn", label: "Login time" },
  { value: "talk", label: "Talk time" },
  { value: "idle", label: "Idle time" },
  { value: "callsPerHour", label: "Calls per login hour" },
  { value: "mappingStatus", label: "Mapping status" },
  { value: "rowCount", label: "Included row count" },
];

const hourlyDurationColumns: {
  key: keyof DurationTotals;
  label: string;
}[] = [
  { key: "loggedInSeconds", label: "Login time" },
  { key: "readySeconds", label: "Ready time" },
  { key: "talkSeconds", label: "Talk time" },
  { key: "ringingSeconds", label: "Ringing time" },
  { key: "wrapSeconds", label: "Wrap time" },
  { key: "pausedSeconds", label: "Paused time" },
  { key: "idleSeconds", label: "Idle time" },
  { key: "untrackedSeconds", label: "Untracked time" },
];

const dailyDurationColumns: {
  key: keyof DurationTotals;
  label: string;
}[] = [
  { key: "loggedInSeconds", label: "Logged In" },
  { key: "readySeconds", label: "Ready" },
  { key: "talkSeconds", label: "Talk" },
  { key: "wrapSeconds", label: "Wrap" },
  { key: "pausedSeconds", label: "Paused" },
  { key: "systemPauseSeconds", label: "System Pause" },
  { key: "netSeconds", label: "Net" },
];

function percentage(count: number, total: number) {
  if (total === 0) {
    return "0%";
  }

  const value = Math.round((count / total) * 1000) / 10;
  return `${value}%`;
}

function formatCreatedAt(value: string) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function reportingPeriod(preview: ImportPreview) {
  if (preview.selectedReportingDate) {
    return preview.selectedReportingDate;
  }

  const dates = preview.agents
    .flatMap((agent) => [agent.dateRange.earliest, agent.dateRange.latest])
    .filter((date): date is string => Boolean(date))
    .sort();

  if (dates.length === 0) {
    return "Not detected";
  }

  return dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
}

function statusLabel(status: "draft" | "ready_to_publish" | "validation_failed") {
  switch (status) {
    case "ready_to_publish":
      return "Ready to publish";
    case "validation_failed":
      return "Validation failed";
    default:
      return "Draft";
  }
}

function importStatusLabel(status: string) {
  switch (status) {
    case "Blocked: invalid mapping":
      return "Invalid mapping";
    case "Blocked: unmapped":
      return "Excluded: unmatched";
    case "Blocked: out of scope":
      return "Excluded: unauthorized";
    case "Blocked: invalid rows":
      return "Invalid rows";
    case "No changes":
      return "Excluded: no changes";
    default:
      return status;
  }
}

function statusTone(status: AgentMappingStatus) {
  switch (status) {
    case "mapped":
      return styles.statusMapped;
    case "unmapped":
      return styles.statusUnmatched;
    case "out_of_scope":
      return styles.statusUnauthorized;
    case "invalid_mapping":
      return styles.statusInvalid;
  }
}

function importStatusTone(status: string) {
  if (status === "Ready") {
    return styles.statusMapped;
  }

  if (status.includes("unmapped")) {
    return styles.statusUnmatched;
  }

  if (status.includes("out of scope")) {
    return styles.statusUnauthorized;
  }

  return styles.statusInvalid;
}

function rowMatchesHighlight(
  agent: AgentPreviewSummary,
  highlight: HighlightStatus | null,
) {
  if (!highlight) {
    return true;
  }

  if (highlight === "invalid_rows") {
    return agent.invalidRowCount > 0;
  }

  if (highlight === "excluded") {
    return agent.importStatus !== "Ready";
  }

  return agent.mappingStatus === highlight;
}

function mappingDescription(agent: AgentPreviewSummary, reportingDate: string) {
  switch (agent.mappingStatus) {
    case "mapped":
      return `Dialer agent: ${agent.dialerAgentName}. Matched user: ${agent.dashboardUserName ?? "Unavailable"}. Team: ${agent.teamNames.join(", ") || "Unavailable"}. Reporting date: ${reportingDate}. Included in publish: Yes.`;
    case "unmapped":
      return `Dialer agent: ${agent.dialerAgentName}. No authorized application user match was found. Included in publish: No.`;
    case "out_of_scope":
      return `Dialer agent: ${agent.dialerAgentName}. This record is outside the uploader's authorized team scope. Personal details are withheld. Included in publish: No.`;
    case "invalid_mapping":
      return `Dialer agent: ${agent.dialerAgentName}. The authorized mapping is ambiguous or invalid. Included in publish: No.`;
  }
}

function DurationCell({ seconds }: { seconds: number | null }) {
  if (seconds === null) {
    return <span className={styles.durationValue}>N/A</span>;
  }

  const formatted = formatDurationSeconds(seconds);

  return (
    <span className={styles.durationValue} tabIndex={0}>
      <strong>{formatted.hms}</strong>
      <small>{formatted.decimalHoursLabel}</small>
      <span className={styles.durationTooltip} role="tooltip">
        Exact duration: {formatted.hms}. Decimal time: {formatted.decimalHoursLabel}.
      </span>
    </span>
  );
}

function MappingBadge({
  agent,
  date,
}: {
  agent: AgentPreviewSummary;
  date: string;
}) {
  return (
    <span
      aria-label={mappingDescription(agent, date)}
      className={`${styles.mappingBadge} ${statusTone(agent.mappingStatus)}`}
      tabIndex={0}
    >
      {mappingStatusLabels[agent.mappingStatus]}
      <span className={styles.mappingTooltip} role="tooltip">
        {mappingDescription(agent, date)}
      </span>
    </span>
  );
}

function PublishButton({
  disabled,
  rowCount,
}: {
  disabled: boolean;
  rowCount: number;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        aria-busy={pending || undefined}
        className={styles.primaryButton}
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? (
          <>
            <span aria-hidden="true" className={styles.spinner} />
            Publishing…
          </>
        ) : (
          "Confirm and publish"
        )}
      </button>
      <span aria-live="polite" className="sr-only" role="status">
        {pending
          ? "Publishing import. Please wait."
          : `${formatNumber(rowCount)} mapped rows are ready to publish.`}
      </span>
    </>
  );
}

function KpiCard({
  active,
  count,
  detail,
  denominatorLabel,
  highlight,
  icon,
  label,
  muted,
  onActivate,
  onHover,
  publishes,
  total,
}: {
  active: boolean;
  count: number;
  detail: string;
  denominatorLabel: string;
  highlight: HighlightStatus | null;
  icon: string;
  label: string;
  muted: boolean;
  onActivate: (highlight: HighlightStatus | null) => void;
  onHover: (highlight: HighlightStatus | null) => void;
  publishes: string;
  total: number;
}) {
  return (
    <button
      aria-pressed={active}
      className={`${styles.kpiCard}${active ? ` ${styles.kpiActive}` : ""}${muted ? ` ${styles.kpiMuted}` : ""}`}
      onBlur={() => onHover(null)}
      onClick={() => onActivate(highlight)}
      onFocus={() => onHover(highlight)}
      onMouseEnter={() => onHover(highlight)}
      onMouseLeave={() => onHover(null)}
      type="button"
    >
      <span className={styles.kpiIcon} aria-hidden="true">{icon}</span>
      <span className={styles.kpiCopy}>
        <span>{label}</span>
        <span className={styles.kpiValueLine}>
          <strong>{formatNumber(count)}</strong>
          <small>{percentage(count, total)}</small>
        </span>
      </span>
      <span className={styles.kpiPopover} role="tooltip">
        <strong>{formatNumber(count)} · {percentage(count, total)} of {denominatorLabel}</strong>
        <br />Publishes: {publishes}
        <br />{detail}
      </span>
    </button>
  );
}

function PreviewDataPanel({
  highlight,
  preview,
}: {
  highlight: HighlightStatus | null;
  preview: ImportPreview;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PreviewStatusFilter>("all");
  const [team, setTeam] = useState("all");
  const [include, setInclude] = useState<PreviewIncludeFilter>("all");
  const [sort, setSort] = useState<PreviewSortKey>("agent");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<PreviewPageSize>(25);
  const [requestedPage, setRequestedPage] = useState(1);
  const isDaily = preview.granularity === "daily";
  const durationColumns = isDaily ? dailyDurationColumns : hourlyDurationColumns;
  const tableColumnCount = isDaily ? 14 : 26;
  const teams = useMemo(() => getPreviewTeams(preview.agents), [preview.agents]);
  const availableSortLabels = isDaily
    ? sortLabels.filter((option) => option.value !== "idle" && option.value !== "rowCount")
    : sortLabels;
  const filteredAgents = useMemo(
    () => filterPreviewAgents(preview.agents, { include, query, status, team }),
    [include, preview.agents, query, status, team],
  );
  const sortedAgents = useMemo(
    () => sortPreviewAgents(filteredAgents, sort, direction),
    [direction, filteredAgents, sort],
  );
  const pagination = useMemo(
    () => paginatePreviewAgents(sortedAgents, requestedPage, pageSize),
    [pageSize, requestedPage, sortedAgents],
  );
  const hasActiveFilters =
    query.trim().length > 0 || status !== "all" || team !== "all" || include !== "all";
  const highlightFilter =
    highlight && highlight !== "excluded" ? highlight : null;

  function resetToFirstPage() {
    setRequestedPage(1);
  }

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setTeam("all");
    setInclude("all");
    resetToFirstPage();
  }

  return (
    <div>
      <div className={styles.filterToolbar}>
        <label className={styles.filterControl} htmlFor="agent-search">
          Search agents
          <input
            id="agent-search"
            onChange={(event) => {
              setQuery(event.target.value);
              resetToFirstPage();
            }}
            placeholder="Search by agent name"
            type="search"
            value={query}
          />
        </label>
        <label
          className={`${styles.filterControl}${highlightFilter ? ` ${styles.highlightedControl}` : ""}`}
          htmlFor="status-filter"
        >
          Mapping status
          <select
            id="status-filter"
            onChange={(event) => {
              setStatus(event.target.value as PreviewStatusFilter);
              resetToFirstPage();
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="mapped">Mapped</option>
            <option value="unmapped">Unmatched</option>
            <option value="out_of_scope">Unauthorized</option>
            <option value="invalid_mapping">Invalid mapping</option>
            <option value="invalid_rows">Invalid rows</option>
          </select>
        </label>
        <label className={styles.filterControl} htmlFor="team-filter">
          Team
          <select
            disabled={teams.length === 0}
            id="team-filter"
            onChange={(event) => {
              setTeam(event.target.value);
              resetToFirstPage();
            }}
            value={team}
          >
            <option value="all">All teams</option>
            {teams.map((teamName) => (
              <option key={teamName} value={teamName}>{teamName}</option>
            ))}
          </select>
        </label>
        <label
          className={`${styles.filterControl}${highlight === "excluded" ? ` ${styles.highlightedControl}` : ""}`}
          htmlFor="include-filter"
        >
          Include
          <select
            id="include-filter"
            onChange={(event) => {
              setInclude(event.target.value as PreviewIncludeFilter);
              resetToFirstPage();
            }}
            value={include}
          >
            <option value="all">All rows</option>
            <option value="included">Included</option>
            <option value="excluded">Excluded</option>
          </select>
        </label>
        <label className={styles.filterControl} htmlFor="sort-agents">
          Sort by
          <select
            id="sort-agents"
            onChange={(event) => {
              setSort(event.target.value as PreviewSortKey);
              resetToFirstPage();
            }}
            value={sort}
          >
            {availableSortLabels.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div>
          <button
            className={styles.filterButton}
            onClick={() => {
              setDirection((current) => current === "asc" ? "desc" : "asc");
              resetToFirstPage();
            }}
            type="button"
          >
            {direction === "asc" ? "Ascending" : "Descending"}
          </button>
          {hasActiveFilters ? (
            <button className={styles.filterButton} onClick={clearFilters} type="button">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.tableSummary}>
        <p aria-live="polite">
          Showing {formatNumber(pagination.from)}–{formatNumber(pagination.to)} of {formatNumber(filteredAgents.length)} matching agents · {formatNumber(preview.agents.length)} total agents
        </p>
        <label className={styles.pageSize} htmlFor="page-size">
          Rows per page
          <select
            id="page-size"
            onChange={(event) => {
              setPageSize(Number(event.target.value) as PreviewPageSize);
              resetToFirstPage();
            }}
            value={pageSize}
          >
            {previewPageSizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>

      <div
        aria-label="Agent import preview. Scroll horizontally to view all columns."
        className={styles.tableScroll}
        role="region"
        tabIndex={0}
      >
        <table aria-label="Agent import preview" className={styles.previewTable}>
          <thead>
            <tr>
              <th scope="col">Agent name</th>
              <th scope="col">Mapping status</th>
              <th scope="col">Matched user</th>
              <th scope="col">Team</th>
              <th scope="col">{isDaily ? "Reporting date" : "Reporting date range"}</th>
              {!isDaily ? <th scope="col">Included rows</th> : null}
              <th scope="col">Calls</th>
              {durationColumns.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
              {!isDaily ? (
                <>
                  <th scope="col">Talk %</th>
                  <th scope="col">Ready %</th>
                  <th scope="col">Wrap %</th>
                  <th scope="col">Paused %</th>
                  <th scope="col">Idle %</th>
                  <th scope="col">Calls / login hour</th>
                  <th scope="col">New rows</th>
                  <th scope="col">Changed rows</th>
                  <th scope="col">Unchanged rows</th>
                  <th scope="col">Invalid rows</th>
                </>
              ) : null}
              <th scope="col">Import status</th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((agent) => {
              const matches = rowMatchesHighlight(agent, highlight);
              const date = isDaily
                ? agent.dateRange.earliest ?? "N/A"
                : `${agent.dateRange.earliest ?? "N/A"} to ${agent.dateRange.latest ?? "N/A"}`;

              return (
                <tr
                  className={`${styles.previewRow}${highlight && matches ? ` ${styles.previewRowMatched}` : ""}${highlight && !matches ? ` ${styles.previewRowMuted}` : ""}`}
                  key={agent.agentKey}
                  tabIndex={0}
                >
                  <th className={styles.agentName} scope="row">{agent.dialerAgentName}</th>
                  <td><MappingBadge agent={agent} date={date} /></td>
                  <td>{agent.mappingStatus === "mapped" ? agent.dashboardUserName ?? "N/A" : "N/A"}</td>
                  <td>{agent.mappingStatus === "mapped" && agent.teamNames.length > 0 ? agent.teamNames.join(", ") : "N/A"}</td>
                  <td>{date}</td>
                  {!isDaily ? <td className={styles.numeric}>{formatNumber(agent.validRowCount)}</td> : null}
                  <td className={styles.numeric}>{formatNumber(agent.calls)}</td>
                  {durationColumns.map(({ key }) => (
                    <td key={key}><DurationCell seconds={agent.durations[key]} /></td>
                  ))}
                  {!isDaily ? (
                    <>
                      <td className={styles.numeric}>{formatPercentage(agent.performance.talkPercentage)}</td>
                      <td className={styles.numeric}>{formatPercentage(agent.performance.readyPercentage)}</td>
                      <td className={styles.numeric}>{formatPercentage(agent.performance.wrapPercentage)}</td>
                      <td className={styles.numeric}>{formatPercentage(agent.performance.pausedPercentage)}</td>
                      <td className={styles.numeric}>{formatPercentage(agent.performance.idlePercentage)}</td>
                      <td className={styles.numeric}>{formatOptionalNumber(agent.performance.callsPerLoggedInHour)}</td>
                      <td className={styles.numeric}>{formatNumber(agent.rowCounts.new)}</td>
                      <td className={styles.numeric}>{formatNumber(agent.rowCounts.changed)}</td>
                      <td className={styles.numeric}>{formatNumber(agent.rowCounts.unchanged)}</td>
                      <td className={styles.numeric}>{formatNumber(agent.rowCounts.invalid)}</td>
                    </>
                  ) : null}
                  <td>
                    <span className={`${styles.statusPill} ${importStatusTone(agent.importStatus)}`}>
                      {importStatusLabel(agent.importStatus)}
                    </span>
                    {agent.warningMessage ? <small>{agent.warningMessage}</small> : null}
                  </td>
                </tr>
              );
            })}
            {preview.agents.length === 0 ? (
              <tr><td className={styles.emptyCell} colSpan={tableColumnCount}>No agents were found in this preview.</td></tr>
            ) : null}
            {preview.agents.length > 0 && filteredAgents.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={tableColumnCount}>
                  <p>No agents match your search and filters.</p>
                  <button className={styles.filterButton} onClick={clearFilters} type="button">Clear filters</button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav aria-label="Agent preview pagination" className={styles.pagination}>
        <p>Page {formatNumber(pagination.page)} of {formatNumber(pagination.totalPages)}</p>
        <div className={styles.pageButtons}>
          <button
            className={styles.pageButton}
            disabled={pagination.page === 1}
            onClick={() => setRequestedPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className={styles.pageButton}
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setRequestedPage((current) => Math.min(pagination.totalPages, current + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}

function SummaryPanel({
  disabledReasons,
  preview,
  skippedRows,
}: {
  disabledReasons: string[];
  preview: ImportPreview;
  skippedRows: number;
}) {
  const durationColumns = preview.granularity === "daily" ? dailyDurationColumns : hourlyDurationColumns;

  return (
    <div className={styles.summaryGrid}>
      <section className={`${styles.summaryPanel} ${styles.summaryPanelWide}`}>
        <h2>Current preview totals</h2>
        <div className={styles.summaryMetrics}>
          {[
            ["Total CSV rows", preview.fileSummary.totalCsvRows],
            ["Rows to publish", preview.fileSummary.mappedRowsToImport],
            ["Rows skipped", skippedRows],
            ["Agents detected", preview.fileSummary.uniqueAgentsDetected],
          ].map(([label, value]) => (
            <div className={styles.summaryMetric} key={label}>
              <span>{label}</span>
              <strong>{formatNumber(value as number)}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.summaryPanel}>
        <h2>Detected headers</h2>
        {preview.headers.length > 0 ? (
          <ul className={styles.headerChips}>
            {preview.headers.map((header) => <li key={header}>{header}</li>)}
          </ul>
        ) : <p>None detected.</p>}
      </section>
      <section className={styles.summaryPanel}>
        <h2>Included and skipped</h2>
        <p>
          {formatNumber(preview.fileSummary.mappedRowsToImport)} mapped rows will publish. {formatNumber(preview.fileSummary.unmappedRowsToSkip)} unmatched, {formatNumber(preview.fileSummary.outOfScopeRowsToSkip)} unauthorized, {formatNumber(preview.fileSummary.unchangedRowsToSkip)} unchanged, and {formatNumber(preview.fileSummary.invalidRows)} invalid rows will not publish.
        </p>
      </section>
      <section className={styles.summaryPanel}>
        <h2>Publish readiness</h2>
        <p>{disabledReasons.length > 0 ? "Publishing is blocked until the listed validation errors are resolved." : "The stored preview is ready for the current actor to publish, subject to warning authorization and acknowledgement."}</p>
      </section>
      <section className={`${styles.summaryPanel} ${styles.summaryPanelWide}`}>
        <h2>Company / file totals</h2>
        <div className={styles.tableScroll}>
          <table className={styles.summaryTable}>
            <thead>
              <tr>
                <th scope="col">Calls</th>
                {durationColumns.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
                <th scope="col">Included valid rows</th>
                <th scope="col">Excluded invalid rows</th>
                <th scope="col">Mapped valid rows</th>
                <th scope="col">Unmatched valid rows</th>
                <th scope="col">Unauthorized valid rows</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatNumber(preview.fileSummary.totalCalls)}</td>
                {durationColumns.map(({ key }) => <td key={key}><DurationCell seconds={preview.fileSummary.durationTotals[key]} /></td>)}
                <td>{formatNumber(preview.fileSummary.includedValidRows)}</td>
                <td>{formatNumber(preview.fileSummary.excludedInvalidRows)}</td>
                <td>{formatNumber(preview.fileSummary.mappedValidRows)}</td>
                <td>{formatNumber(preview.fileSummary.unmappedValidRows)}</td>
                <td>{formatNumber(preview.fileSummary.outOfScopeValidRows)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FileDetailsPanel({
  batchId,
  createdAt,
  fileName,
  preview,
  status,
}: {
  batchId: string;
  createdAt: string;
  fileName: string;
  preview: ImportPreview;
  status: "draft" | "ready_to_publish" | "validation_failed";
}) {
  const details = [
    ["Filename", fileName],
    ["Batch ID", batchId],
    ["SHA-256", preview.fileHash],
    ["Uploaded", formatCreatedAt(createdAt)],
    ["File type", "CSV"],
    ["Granularity", preview.granularity ?? "Not detected"],
    ["Reporting date / period", reportingPeriod(preview)],
    ["Duplicate state", preview.duplicateFile ? "Duplicate file warning" : "Unique file"],
    ["Import status", statusLabel(status)],
  ];

  return (
    <div className={styles.detailGrid}>
      <section className={styles.detailPanel}>
        <h2>Stored file details</h2>
        <dl className={styles.detailsList}>
          {details.map(([label, value]) => (
            <div className={styles.detailItem} key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.detailPanel}>
        <h2>Header inspection</h2>
        <p>Detected headers</p>
        <ul className={styles.headerChips}>
          {preview.headers.length > 0 ? preview.headers.map((header) => <li key={header}>{header}</li>) : <li>None</li>}
        </ul>
        <p>Missing required headers</p>
        <ul className={styles.headerChips}>
          {preview.missingHeaders.length > 0 ? preview.missingHeaders.map((header) => <li key={header}>{header}</li>) : <li>None</li>}
        </ul>
      </section>
      <form action={rejectImportAction} className={styles.rejectionForm}>
        <h2>Reject this draft</h2>
        <p>Rejecting preserves the file and validation history but prevents this draft from being published.</p>
        <input name="batchId" type="hidden" value={batchId} />
        <label>
          Rejection reason
          <textarea minLength={5} name="reason" required />
        </label>
        <div className={styles.rejectionActions}>
          <SubmitButton pendingLabel="Rejecting draft" variant="secondary">Reject draft</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function MappingPanel({ preview }: { preview: ImportPreview }) {
  return (
    <section className={styles.mappingPanel}>
      <div className={styles.mappingPanelHeader}>
        <h2>Actual preview mapping</h2>
        <p>Application user and team details appear only for mappings available inside the current actor&apos;s authorized preview.</p>
      </div>
      <div className={styles.mappingScroll}>
        <table className={styles.mappingTable}>
          <thead>
            <tr>
              <th scope="col">Dialer agent</th>
              <th scope="col">Mapping status</th>
              <th scope="col">Matched user</th>
              <th scope="col">Team</th>
              <th scope="col">Included in publish</th>
              <th scope="col">Reason / classification</th>
            </tr>
          </thead>
          <tbody>
            {preview.agents.map((agent) => {
              const mapped = agent.mappingStatus === "mapped";
              return (
                <tr key={agent.agentKey}>
                  <th scope="row">{agent.dialerAgentName}</th>
                  <td><MappingBadge agent={agent} date={reportingPeriod(preview)} /></td>
                  <td>{mapped ? agent.dashboardUserName ?? "N/A" : "N/A"}</td>
                  <td>{mapped ? agent.teamNames.join(", ") || "N/A" : "N/A"}</td>
                  <td>{agent.importStatus === "Ready" ? "Yes" : "No"}</td>
                  <td>{agent.warningMessage ?? importStatusLabel(agent.importStatus)}</td>
                </tr>
              );
            })}
            {preview.agents.length === 0 ? (
              <tr><td className={styles.emptyCell} colSpan={6}>No mapping records are available in this preview.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ImportPreviewSummary({
  batchId,
  createdAt,
  disabledReasons,
  fileName,
  isAdmin,
  preview,
  status,
  validation,
}: {
  batchId: string;
  createdAt: string;
  disabledReasons: string[];
  fileName: string;
  isAdmin: boolean;
  preview: ImportPreview;
  status: "draft" | "ready_to_publish" | "validation_failed";
  validation: ImportValidationResult;
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("preview");
  const [hoverHighlight, setHoverHighlight] = useState<HighlightStatus | null>(null);
  const [pinnedHighlight, setPinnedHighlight] = useState<HighlightStatus | null>(null);
  const highlight = hoverHighlight ?? pinnedHighlight;
  const mappedRowsToImport = preview.fileSummary.mappedRowsToImport;
  const unresolvedRowsToSkip = preview.fileSummary.unmappedRowsToSkip + preview.fileSummary.outOfScopeRowsToSkip;
  const skippedRows = unresolvedRowsToSkip + preview.fileSummary.unchangedRowsToSkip + preview.fileSummary.invalidRows;
  const partialAcknowledgementRequired = mappedRowsToImport > 0 && unresolvedRowsToSkip + preview.fileSummary.invalidRows > 0;
  const warningPublicationBlocked = validation.warnings.length > 0 && !isAdmin;
  const publishBlocked = disabledReasons.length > 0 || warningPublicationBlocked || mappedRowsToImport === 0;
  const warningGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const agent of preview.agents) {
      if (agent.warningMessage) {
        groups.set(agent.warningMessage, [...(groups.get(agent.warningMessage) ?? []), agent.dialerAgentName]);
      }
    }
    return Array.from(groups, ([message, agentNames]) => ({ message, agentNames }));
  }, [preview.agents]);
  const warningItems = [
    ...validation.warnings,
    ...(partialAcknowledgementRequired
      ? [`${formatNumber(unresolvedRowsToSkip + preview.fileSummary.invalidRows)} unmatched, unauthorized, or invalid rows will be excluded.`]
      : []),
    ...warningGroups.map(({ message, agentNames }) => `${message} Affected agents: ${agentNames.slice(0, 5).join(", ")}${agentNames.length > 5 ? `, and ${formatNumber(agentNames.length - 5)} more` : ""}.`),
  ];
  const kpis = [
    {
      label: "Total CSV rows",
      count: preview.fileSummary.totalCsvRows,
      icon: "≡",
      highlight: null,
      publishes: "Depends on row classification",
      detail: "Every parsed CSV data row before publish eligibility is applied.",
      denominatorLabel: "total CSV rows",
      total: preview.fileSummary.totalCsvRows,
    },
    {
      label: "Mapped rows / eligible",
      count: preview.fileSummary.mappedRowsToImport,
      icon: "✓",
      highlight: "mapped" as const,
      publishes: "Yes",
      detail: "Mapped rows with valid data and a current authorized target.",
      denominatorLabel: "total CSV rows",
      total: preview.fileSummary.totalCsvRows,
    },
    {
      label: "Unmatched rows",
      count: preview.fileSummary.unmappedRowsToSkip,
      icon: "?",
      highlight: "unmapped" as const,
      publishes: "No",
      detail: "No authorized application user mapping was found.",
      denominatorLabel: "total CSV rows",
      total: preview.fileSummary.totalCsvRows,
    },
    {
      label: "Invalid rows",
      count: preview.fileSummary.invalidRows,
      icon: "!",
      highlight: "invalid_rows" as const,
      publishes: "No",
      detail: "Row values failed the current import validation rules.",
      denominatorLabel: "total CSV rows",
      total: preview.fileSummary.totalCsvRows,
    },
    {
      label: "Unauthorized rows",
      count: preview.fileSummary.outOfScopeRowsToSkip,
      icon: "⊘",
      highlight: "out_of_scope" as const,
      publishes: "No",
      detail: "Rows fall outside the uploader's server-authorized team scope.",
      denominatorLabel: "total CSV rows",
      total: preview.fileSummary.totalCsvRows,
    },
    {
      label: "Mapped agents",
      count: preview.fileSummary.uniqueMappedAgents,
      icon: "◎",
      highlight: "mapped" as const,
      publishes: "When their mapped rows are eligible",
      detail: "Unique dialer agents matched to authorized dashboard users.",
      denominatorLabel: "detected agents",
      total: preview.fileSummary.uniqueAgentsDetected,
    },
  ];

  function activateHighlight(next: HighlightStatus | null) {
    setPinnedHighlight((current) => current === next ? null : next);
    if (next) {
      setActiveTab("preview");
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      setActiveTab(tabs[nextIndex].id);
      const tabList = event.currentTarget.parentElement;
      requestAnimationFrame(() => tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus());
    }
  }

  return (
    <section aria-labelledby="preview-summary-heading" className={styles.reviewWorkspace}>
      <header className={styles.reviewTop}>
        <div className={styles.reviewHeadingRow}>
          <div className={styles.reviewIdentity}>
            <span className={styles.reviewIcon} aria-hidden="true"><DashboardIcon name="import" /></span>
            <div>
              <h1 id="preview-summary-heading">Review and publish</h1>
              <p>Review the import results and publish the mapped rows to make them part of your data.</p>
            </div>
          </div>
          <div className={styles.reviewMetaTop}>
            <div className={styles.metaItem}><span>Batch ID</span><strong title={batchId}>{batchId}</strong></div>
            <div className={styles.metaItem}><span>Uploaded</span><strong>{formatCreatedAt(createdAt)}</strong></div>
            <div className={styles.metaItem}><span>File type</span><strong>CSV</strong></div>
            <div className={styles.metaItem}>
              <span>Import status</span>
              <strong className={`${styles.statusPill} ${publishBlocked ? styles.statusBlocked : styles.statusReady}`}>{publishBlocked ? "Publish blocked" : statusLabel(status)}</strong>
            </div>
          </div>
        </div>

        <dl className={styles.fileMetaGrid}>
          <div className={styles.fileMetaItem}>
            <dt>File</dt><dd title={fileName}>{fileName}</dd><small title={preview.fileHash}>SHA-256: {preview.fileHash}</small>
          </div>
          <div className={styles.fileMetaItem}>
            <dt>Reporting period</dt><dd>{reportingPeriod(preview)}</dd><small>{preview.granularity === "daily" ? "Daily Agent Hours" : "Hourly agent activity"}</small>
          </div>
          <div className={styles.fileMetaItem}>
            <dt>Granularity</dt><dd>{preview.granularity ?? "Not detected"}</dd><small>{formatNumber(preview.headers.length)} detected headers</small>
          </div>
          <div className={styles.fileMetaItem}>
            <dt>File identity</dt>
            <dd><span className={`${styles.duplicatePill} ${preview.duplicateFile ? "" : styles.uniquePill}`}>{preview.duplicateFile ? "Duplicate warning" : "Unique file"}</span></dd>
          </div>
        </dl>
      </header>

      {disabledReasons.length > 0 || warningItems.length > 0 || validation.notices.length > 0 ? (
        <div className={styles.alertGrid}>
          {disabledReasons.length > 0 ? (
            <section className={`${styles.alertPanel} ${styles.alertDanger}`} role="alert">
              <DashboardIcon name="info" />
              <div><h2>Blocking errors ({disabledReasons.length})</h2><ul>{disabledReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
            </section>
          ) : null}
          {warningItems.length > 0 ? (
            <section
              className={`${styles.alertPanel} ${styles.alertWarning}`}
              onBlur={() => setHoverHighlight(null)}
              onFocus={() => setHoverHighlight("excluded")}
              onMouseEnter={() => setHoverHighlight("excluded")}
              onMouseLeave={() => setHoverHighlight(null)}
              role="alert"
              tabIndex={0}
            >
              <DashboardIcon name="info" />
              <div>
                <h2>Warnings ({warningItems.length})</h2>
                <ul>{warningItems.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                {warningPublicationBlocked ? <strong>An administrator must review these warnings before the draft can be published.</strong> : null}
              </div>
            </section>
          ) : null}
          {validation.notices.length > 0 ? (
            <section className={`${styles.alertPanel} ${styles.alertInfo}`} role="status">
              <DashboardIcon name="info" />
              <div><h2>Notices ({validation.notices.length})</h2><ul>{validation.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></div>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className={styles.kpiRow}>
        {kpis.map((kpi) => (
          <KpiCard
            active={Boolean(kpi.highlight && pinnedHighlight === kpi.highlight)}
            count={kpi.count}
            detail={kpi.detail}
            denominatorLabel={kpi.denominatorLabel}
            highlight={kpi.highlight}
            icon={kpi.icon}
            key={kpi.label}
            label={kpi.label}
            muted={Boolean(highlight && kpi.highlight && highlight !== kpi.highlight)}
            onActivate={activateHighlight}
            onHover={setHoverHighlight}
            publishes={kpi.publishes}
            total={kpi.total}
          />
        ))}
      </div>

      <form action={confirmImportAction} className={styles.publishBar}>
        <input name="batchId" type="hidden" value={batchId} />
        {partialAcknowledgementRequired ? (
          <label className={styles.acknowledgement}>
            <input name="allowPartialImport" required type="checkbox" value="true" />
            <span>I understand that the {formatNumber(unresolvedRowsToSkip + preview.fileSummary.invalidRows)} excluded rows will not be published.</span>
          </label>
        ) : (
          <p className={styles.acknowledgement}>{formatNumber(mappedRowsToImport)} mapped rows are ready to publish.</p>
        )}
        <div className={styles.publishActions}>
          <Link className={styles.secondaryButton} href="/import">Cancel preview</Link>
          <PublishButton disabled={publishBlocked} rowCount={mappedRowsToImport} />
        </div>
      </form>

      <div aria-label="Import preview views" className={styles.tabs} role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={styles.tab}
            id={`tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleTabKeyDown}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`tab-${activeTab}`}
        className={styles.tabPanel}
        id={`panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "preview" ? <PreviewDataPanel highlight={highlight} preview={preview} /> : null}
        {activeTab === "summary" ? <SummaryPanel disabledReasons={disabledReasons} preview={preview} skippedRows={skippedRows} /> : null}
        {activeTab === "file" ? <FileDetailsPanel batchId={batchId} createdAt={createdAt} fileName={fileName} preview={preview} status={status} /> : null}
        {activeTab === "mapping" ? <MappingPanel preview={preview} /> : null}
      </div>
    </section>
  );
}
