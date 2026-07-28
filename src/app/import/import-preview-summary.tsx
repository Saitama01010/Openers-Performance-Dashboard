"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  filterPreviewAgents,
  getPreviewTeams,
  mappingStatusLabels,
  paginatePreviewAgents,
  previewPageSizes,
  sortPreviewAgents,
  type PreviewPageSize,
  type PreviewSortKey,
  type PreviewStatusFilter,
} from "@/app/import/import-preview-table";
import { confirmImportAction } from "@/import/actions";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";
import type {
  AgentMappingStatus,
  DurationTotals,
  ImportPreview,
} from "@/import/dialer";

const tableColumnCount = 26;

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

const durationColumns: {
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

const summaryCards = [
  ["totalCsvRows", "Total CSV Rows"],
  ["eligibleMappedRows", "Eligible Mapped Rows"],
  ["mappedRowsToImport", "Mapped Rows To Import"],
  ["unmappedRowsToSkip", "Unmatched Rows To Skip"],
  ["outOfScopeRowsToSkip", "Unauthorized Rows To Skip"],
  ["unchangedRowsToSkip", "Unchanged Rows To Skip"],
  ["invalidRows", "Invalid Rows"],
  ["uniqueMappedAgents", "Mapped Agents"],
  ["uniqueUnmappedAgents", "Unmatched Agents"],
  ["uniqueOutOfScopeAgents", "Unauthorized Agents"],
] as const;

function mappingStatusClass(status: AgentMappingStatus) {
  if (status === "mapped") {
    return "border-primary/40 bg-primary/10 text-primary";
  }

  if (status === "unmapped" || status === "invalid_mapping") {
    return "border-danger/40 bg-danger/10 text-danger";
  }

  return "border-border bg-background text-foreground";
}

function importStatusClass(status: string) {
  if (status === "Ready") {
    return "border-primary/40 bg-primary/10 text-primary";
  }

  if (status.startsWith("Blocked")) {
    return "border-danger/40 bg-danger/10 text-danger";
  }

  return "border-border bg-background text-muted";
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

function DurationCell({ seconds }: { seconds: number }) {
  const formatted = formatDurationSeconds(seconds);

  return (
    <span title={formatted.decimalHoursLabel}>
      <span className="block font-mono tabular-nums">{formatted.hms}</span>
      <span className="block text-[11px] text-muted">
        {formatted.decimalHoursLabel}
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
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "Publishing…" : "Confirm and publish"}
      </button>
      <span aria-live="polite" className="sr-only" role="status">
        {pending
          ? "Publishing import. Please wait."
          : `${formatNumber(rowCount)} mapped rows are ready to publish.`}
      </span>
    </>
  );
}

export function ImportPreviewSummary({
  batchId,
  disabledReasons,
  fileName,
  preview,
}: {
  batchId: string;
  disabledReasons: string[];
  fileName: string;
  preview: ImportPreview;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PreviewStatusFilter>("all");
  const [team, setTeam] = useState("all");
  const [sort, setSort] = useState<PreviewSortKey>("agent");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<PreviewPageSize>(25);
  const [requestedPage, setRequestedPage] = useState(1);
  const mappedRowsToImport = preview.fileSummary.mappedRowsToImport;
  const unresolvedRowsToSkip =
    preview.fileSummary.unmappedRowsToSkip +
    preview.fileSummary.outOfScopeRowsToSkip;
  const skippedRows =
    unresolvedRowsToSkip +
    preview.fileSummary.unchangedRowsToSkip +
    preview.fileSummary.invalidRows;
  const partialAcknowledgementRequired =
    mappedRowsToImport > 0 &&
    unresolvedRowsToSkip + preview.fileSummary.invalidRows > 0;
  const teams = useMemo(() => getPreviewTeams(preview.agents), [preview.agents]);
  const warningGroups = useMemo(() => {
    const groups = new Map<string, string[]>();

    for (const agent of preview.agents) {
      if (!agent.warningMessage) {
        continue;
      }

      groups.set(agent.warningMessage, [
        ...(groups.get(agent.warningMessage) ?? []),
        agent.dialerAgentName,
      ]);
    }

    return Array.from(groups, ([message, agentNames]) => ({
      message,
      agentNames,
    }));
  }, [preview.agents]);
  const filteredAgents = useMemo(
    () => filterPreviewAgents(preview.agents, { query, status, team }),
    [preview.agents, query, status, team],
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
    query.trim().length > 0 || status !== "all" || team !== "all";

  function resetToFirstPage() {
    setRequestedPage(1);
  }

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setTeam("all");
    resetToFirstPage();
  }

  return (
    <section
      aria-labelledby="preview-summary-heading"
      className="mt-6 rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">CSV import preview</p>
            <h2 className="text-xl font-semibold" id="preview-summary-heading">
              Review and publish
            </h2>
            <p className="mt-2 text-sm">
              File: <span className="font-medium">{fileName}</span>
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted">
              SHA-256: {preview.fileHash}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.duplicateFile ? (
              <span className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                Duplicate file blocked
              </span>
            ) : (
              <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-muted">
                Unique file
              </span>
            )}
            <span
              className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                disabledReasons.length > 0
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              {disabledReasons.length > 0
                ? "Publish blocked"
                : "Ready to publish"}
            </span>
          </div>
        </div>

        {preview.missingHeaders.length > 0 ? (
          <div
            className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            Missing required headers: {preview.missingHeaders.join(", ")}
          </div>
        ) : null}

        {disabledReasons.length > 0 ? (
          <div
            className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            <p className="font-semibold">Resolve these blocking issues:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {disabledReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warningGroups.length > 0 || partialAcknowledgementRequired ? (
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-semibold">Warnings</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {partialAcknowledgementRequired ? (
                <li>
                  {formatNumber(
                    unresolvedRowsToSkip + preview.fileSummary.invalidRows,
                  )}{" "}
                  unmatched, unauthorized, or invalid rows will be excluded.
                </li>
              ) : null}
              {warningGroups.map((warning) => (
                <li key={warning.message}>
                  {warning.message} Affected agents:{" "}
                  {warning.agentNames.slice(0, 5).join(", ")}
                  {warning.agentNames.length > 5
                    ? `, and ${formatNumber(warning.agentNames.length - 5)} more`
                    : ""}
                  .
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <p className="font-semibold">
              {formatNumber(mappedRowsToImport)} mapped rows are ready to
              publish.
            </p>
            <p className="mt-1">
              {formatNumber(unresolvedRowsToSkip)} unresolved or unauthorized,{" "}
              {formatNumber(preview.fileSummary.unchangedRowsToSkip)} unchanged,
              and {formatNumber(preview.fileSummary.invalidRows)} invalid rows
              will not be published.
            </p>
          </div>

          <form action={confirmImportAction}>
            <input name="batchId" type="hidden" value={batchId} />
            {partialAcknowledgementRequired ? (
              <label className="mb-3 flex max-w-xl items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  name="allowPartialImport"
                  required
                  type="checkbox"
                  value="true"
                />
                <span>
                  I understand that the listed excluded rows will not be
                  published.
                </span>
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <PublishButton
                disabled={disabledReasons.length > 0}
                rowCount={mappedRowsToImport}
              />
              <Link
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
                href="/import"
              >
                Cancel preview
              </Link>
            </div>
          </form>
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-semibold">Preview summary</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map(([key, label]) => (
            <div className="rounded-md border border-border p-3" key={key}>
              <p className="text-xs uppercase text-muted">{label}</p>
              <p className="mt-1 font-mono text-2xl tabular-nums">
                {formatNumber(preview.fileSummary[key])}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Detected headers</p>
            <p className="mt-2 text-sm">
              {preview.headers.length > 0 ? preview.headers.join(", ") : "None"}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Import status</p>
            <p
              className={`mt-2 text-sm ${
                disabledReasons.length > 0 ? "text-danger" : "text-primary"
              }`}
            >
              {disabledReasons.length > 0
                ? "Publishing is blocked."
                : "Ready to publish."}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border p-3">
          <p className="text-xs uppercase text-muted">Company/File Totals</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Calls
                  </th>
                  {durationColumns.map(({ key, label }) => (
                    <th
                      className="whitespace-nowrap px-2 py-2"
                      key={key}
                      scope="col"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Included Valid Rows
                  </th>
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Excluded Invalid Rows
                  </th>
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Mapped Valid Rows
                  </th>
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Unmatched Valid Rows
                  </th>
                  <th className="whitespace-nowrap px-2 py-2" scope="col">
                    Unauthorized Valid Rows
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.totalCalls)}
                  </td>
                  {durationColumns.map(({ key }) => (
                    <td className="whitespace-nowrap px-2 py-2" key={key}>
                      <DurationCell
                        seconds={preview.fileSummary.durationTotals[key]}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.includedValidRows)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.excludedInvalidRows)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.mappedValidRows)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.unmappedValidRows)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums">
                    {formatNumber(preview.fileSummary.outOfScopeValidRows)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-border">
          <div className="grid gap-3 border-b border-border bg-background/50 p-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(4,auto)] xl:items-end">
            <label className="text-sm font-medium" htmlFor="agent-search">
              Search agents
              <input
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
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
            <label className="text-sm font-medium" htmlFor="status-filter">
              Status
              <select
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
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
                <option value="excluded">Excluded / not published</option>
                <option value="invalid_rows">Invalid rows</option>
              </select>
            </label>
            {teams.length > 0 ? (
              <label className="text-sm font-medium" htmlFor="team-filter">
                Team
                <select
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  id="team-filter"
                  onChange={(event) => {
                    setTeam(event.target.value);
                    resetToFirstPage();
                  }}
                  value={team}
                >
                  <option value="all">All teams</option>
                  {teams.map((teamName) => (
                    <option key={teamName} value={teamName}>
                      {teamName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm font-medium" htmlFor="sort-agents">
              Sort by
              <select
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                id="sort-agents"
                onChange={(event) => {
                  setSort(event.target.value as PreviewSortKey);
                  resetToFirstPage();
                }}
                value={sort}
              >
                {sortLabels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold"
              onClick={() => {
                setDirection((current) =>
                  current === "asc" ? "desc" : "asc",
                );
                resetToFirstPage();
              }}
              type="button"
            >
              {direction === "asc" ? "Ascending" : "Descending"}
            </button>
            {hasActiveFilters ? (
              <button
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold"
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm text-muted">
            <p aria-live="polite">
              Showing {formatNumber(pagination.from)}–
              {formatNumber(pagination.to)} of{" "}
              {formatNumber(filteredAgents.length)} matching agents ·{" "}
              {formatNumber(pagination.rows.length)} visible ·{" "}
              {formatNumber(preview.agents.length)} total agents
            </p>
            <label
              className="flex items-center gap-2 font-medium text-foreground"
              htmlFor="page-size"
            >
              Rows per page
              <select
                className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
                id="page-size"
                onChange={(event) => {
                  setPageSize(Number(event.target.value) as PreviewPageSize);
                  resetToFirstPage();
                }}
                value={pageSize}
              >
                {previewPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table
              aria-label="Agent import preview"
              className="min-w-max border-collapse text-left text-xs"
            >
              <thead className="sticky top-0 z-10 border-b border-border bg-surface text-muted shadow-sm">
                <tr>
                  <th className="min-w-44 px-3 py-2" scope="col">
                    Agent name
                  </th>
                  <th className="whitespace-nowrap px-3 py-2" scope="col">
                    Mapping status
                  </th>
                  <th className="min-w-36 px-3 py-2" scope="col">
                    Matched user
                  </th>
                  <th className="min-w-36 px-3 py-2" scope="col">
                    Team
                  </th>
                  <th className="whitespace-nowrap px-3 py-2" scope="col">
                    Reporting date range
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Included rows
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Calls
                  </th>
                  {durationColumns.map(({ key, label }) => (
                    <th
                      className="whitespace-nowrap px-3 py-2"
                      key={key}
                      scope="col"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Talk %
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Ready %
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Wrap %
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Paused %
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Idle %
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Calls / login hour
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    New rows
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Changed rows
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Unchanged rows
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right" scope="col">
                    Invalid rows
                  </th>
                  <th className="min-w-44 px-3 py-2" scope="col">
                    Import status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map((agent) => (
                  <tr
                    className="border-b border-border/70 align-top last:border-b-0"
                    key={agent.agentKey}
                  >
                    <th className="px-3 py-2.5 font-medium" scope="row">
                      {agent.dialerAgentName}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${mappingStatusClass(agent.mappingStatus)}`}
                      >
                        {mappingStatusLabels[agent.mappingStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {agent.dashboardUserName ?? "N/A"}
                    </td>
                    <td className="px-3 py-2.5">
                      {agent.teamNames.length > 0
                        ? agent.teamNames.join(", ")
                        : "N/A"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {agent.dateRange.earliest ?? "N/A"} to{" "}
                      {agent.dateRange.latest ?? "N/A"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.validRowCount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.calls)}
                    </td>
                    {durationColumns.map(({ key }) => (
                      <td className="whitespace-nowrap px-3 py-2.5" key={key}>
                        <DurationCell seconds={agent.durations[key]} />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercentage(agent.performance.talkPercentage)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercentage(agent.performance.readyPercentage)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercentage(agent.performance.wrapPercentage)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercentage(agent.performance.pausedPercentage)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercentage(agent.performance.idlePercentage)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatOptionalNumber(
                        agent.performance.callsPerLoggedInHour,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.rowCounts.new)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.rowCounts.changed)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.rowCounts.unchanged)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(agent.rowCounts.invalid)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${importStatusClass(agent.importStatus)}`}
                      >
                        {importStatusLabel(agent.importStatus)}
                      </span>
                      {agent.warningMessage ? (
                        <span className="mt-1 block text-xs text-amber-800">
                          Warning: {agent.warningMessage}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {preview.agents.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-muted"
                      colSpan={tableColumnCount}
                    >
                      No agents were found in this preview.
                    </td>
                  </tr>
                ) : null}
                {preview.agents.length > 0 && filteredAgents.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-muted"
                      colSpan={tableColumnCount}
                    >
                      <p>No agents match your search and filters.</p>
                      <button
                        className="mt-3 rounded-md border border-border px-3 py-2 font-semibold text-foreground"
                        onClick={clearFilters}
                        type="button"
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Agent preview pagination"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3"
          >
            <p className="text-sm text-muted">
              Page {formatNumber(pagination.page)} of{" "}
              {formatNumber(pagination.totalPages)}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pagination.page === 1}
                onClick={() =>
                  setRequestedPage((current) => Math.max(1, current - 1))
                }
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-md border border-border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pagination.page === pagination.totalPages}
                onClick={() =>
                  setRequestedPage((current) =>
                    Math.min(pagination.totalPages, current + 1),
                  )
                }
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
        </div>

        <p className="mt-3 text-sm text-muted">
          {formatNumber(skippedRows)} rows will be skipped in total. Final
          values use the backend preview output without recalculation.
        </p>
      </div>
    </section>
  );
}
