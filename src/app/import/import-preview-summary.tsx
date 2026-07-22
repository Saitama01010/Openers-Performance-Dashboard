"use client";

import { Fragment, useMemo, useState } from "react";

import { confirmImportAction } from "@/import/actions";
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

type SortKey =
  | "agent"
  | "calls"
  | "loggedIn"
  | "talk"
  | "idle"
  | "callsPerHour"
  | "mappingStatus"
  | "rowCount";

type FilterKey =
  | "all"
  | "mapped"
  | "unmapped"
  | "out_of_scope"
  | "invalid_rows";

const mappingStatusLabels: Record<AgentMappingStatus, string> = {
  mapped: "Mapped",
  unmapped: "Unmapped",
  out_of_scope: "Out of Scope",
  invalid_mapping: "Invalid Mapping",
};

const sortLabels: { value: SortKey; label: string }[] = [
  { value: "agent", label: "Agent name" },
  { value: "calls", label: "Calls" },
  { value: "loggedIn", label: "Logged-in time" },
  { value: "talk", label: "Talk time" },
  { value: "idle", label: "Idle time" },
  { value: "callsPerHour", label: "Calls per logged-in hour" },
  { value: "mappingStatus", label: "Mapping status" },
  { value: "rowCount", label: "Row count" },
];

const durationLabels: { key: keyof DurationTotals; label: string }[] = [
  { key: "loggedInSeconds", label: "Logged In" },
  { key: "readySeconds", label: "Ready" },
  { key: "talkSeconds", label: "Talk" },
  { key: "ringingSeconds", label: "Ringing" },
  { key: "wrapSeconds", label: "Wrap" },
  { key: "pausedSeconds", label: "Paused" },
  { key: "idleSeconds", label: "Idle" },
  { key: "untrackedSeconds", label: "Untracked" },
];

const summaryCards = [
  ["totalCsvRows", "Total CSV Rows"],
  ["uniqueAgentsDetected", "Unique Agents Detected"],
  ["uniqueMappedAgents", "Unique Mapped Agents"],
  ["uniqueUnmappedAgents", "Unique Unmapped Agents"],
  ["unknownRows", "Unknown Rows"],
  ["newRows", "New Rows"],
  ["changedRows", "Changed Rows"],
  ["unchangedRows", "Unchanged Rows"],
  ["invalidRows", "Invalid Rows"],
  ["outOfScopeRows", "Out-of-Scope Rows"],
] as const;

function mappingStatusClass(status: AgentMappingStatus) {
  if (status === "mapped") {
    return "border-primary/40 text-primary";
  }

  if (status === "unmapped") {
    return "border-danger/40 text-danger";
  }

  return "border-border text-muted";
}

function sortValue(agent: AgentPreviewSummary, key: SortKey) {
  switch (key) {
    case "agent":
      return agent.dialerAgentName.toLowerCase();
    case "calls":
      return agent.calls;
    case "loggedIn":
      return agent.durations.loggedInSeconds;
    case "talk":
      return agent.durations.talkSeconds;
    case "idle":
      return agent.durations.idleSeconds;
    case "callsPerHour":
      return agent.performance.callsPerLoggedInHour ?? -1;
    case "mappingStatus":
      return mappingStatusLabels[agent.mappingStatus];
    case "rowCount":
      return agent.csvRowCount;
  }
}

function DurationCell({ seconds }: { seconds: number }) {
  const formatted = formatDurationSeconds(seconds);

  return (
    <span title={formatted.decimalHoursLabel}>
      <span className="block font-mono">{formatted.hms}</span>
      <span className="block text-xs text-muted">
        {formatted.decimalHoursLabel}
      </span>
    </span>
  );
}

function DurationDetails({ label, seconds }: { label: string; seconds: number }) {
  const formatted = formatDurationSeconds(seconds);

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-1 font-mono">{formatNumber(seconds)} total seconds</p>
      <p className="text-sm text-muted">
        {formatNumber(seconds)} / 3,600 = {formatted.decimalHoursLabel}
      </p>
      <p className="text-sm text-muted">Displayed as {formatted.hms}</p>
    </div>
  );
}

function AgentDetails({ agent }: { agent: AgentPreviewSummary }) {
  return (
    <div className="space-y-4 py-4">
      <details className="rounded-md border border-border p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">
          Calculation details
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-muted">Hourly rows included</p>
            <p className="font-mono text-lg">
              {formatNumber(agent.calculationDetails.hourlyRowsIncluded)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Invalid rows excluded</p>
            <p className="font-mono text-lg">
              {formatNumber(agent.calculationDetails.invalidRowsExcluded)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Date-hour range</p>
            <p className="text-sm">
              {agent.dateRange.earliest ?? "N/A"} to{" "}
              {agent.dateRange.latest ?? "N/A"}
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {durationLabels.map(({ key, label }) => (
            <DurationDetails
              key={key}
              label={label}
              seconds={agent.calculationDetails.rawTotalsSeconds[key]}
            />
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Talk Percentage</p>
            <p className="font-mono">
              {formatPercentage(agent.performance.talkPercentage)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Ready Percentage</p>
            <p className="font-mono">
              {formatPercentage(agent.performance.readyPercentage)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Wrap Percentage</p>
            <p className="font-mono">
              {formatPercentage(agent.performance.wrapPercentage)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Paused Percentage</p>
            <p className="font-mono">
              {formatPercentage(agent.performance.pausedPercentage)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">Idle Percentage</p>
            <p className="font-mono">
              {formatPercentage(agent.performance.idlePercentage)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted">
              Calls Per Logged-In Hour
            </p>
            <p className="font-mono">
              {formatOptionalNumber(agent.performance.callsPerLoggedInHour)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {agent.calculationDetails.callsPerLoggedInHourFormula}
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-border p-3">
          <p className="text-xs uppercase text-muted">Formulas Used</p>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            {agent.calculationDetails.formulas.map((formula) => (
              <li key={formula}>{formula}</li>
            ))}
          </ul>
        </div>
      </details>

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Hourly drill-down
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="whitespace-nowrap px-2 py-2">Date</th>
                <th className="whitespace-nowrap px-2 py-2">Hour</th>
                <th className="whitespace-nowrap px-2 py-2">Calls</th>
                {durationLabels.map(({ key, label }) => (
                  <th className="whitespace-nowrap px-2 py-2" key={key}>
                    {label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2">
                  Row Classification
                </th>
                <th className="whitespace-nowrap px-2 py-2">
                  Validation Message
                </th>
              </tr>
            </thead>
            <tbody>
              {agent.hourlyRows.map((row) => (
                <tr className="border-b border-border/70" key={row.rowNumber}>
                  <td className="whitespace-nowrap px-2 py-2">
                    {row.date ?? "N/A"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {row.hour ?? "N/A"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono">
                    {row.calls === null ? "N/A" : formatNumber(row.calls)}
                  </td>
                  {durationLabels.map(({ key }) => (
                    <td className="whitespace-nowrap px-2 py-2" key={key}>
                      {row.durations ? (
                        <DurationCell seconds={row.durations[key]} />
                      ) : (
                        "N/A"
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2">
                    {row.status.replaceAll("_", " ")}
                  </td>
                  <td className="min-w-48 px-2 py-2">
                    {row.validationMessage ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("agent");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const filteredAgents = useMemo(() => {
    const agents = preview.agents.filter((agent) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "invalid_rows") {
        return agent.invalidRowCount > 0;
      }

      return agent.mappingStatus === filter;
    });

    return [...agents].sort((left, right) => {
      const leftValue = sortValue(left, sort);
      const rightValue = sortValue(right, sort);
      const multiplier = direction === "asc" ? 1 : -1;

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }

      return String(leftValue).localeCompare(String(rightValue)) * multiplier;
    });
  }, [direction, filter, preview.agents, sort]);

  return (
    <section className="mt-6 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Preview summary</h2>
          <p className="mt-1 text-sm text-muted">
            File: <span className="font-medium text-foreground">{fileName}</span>
          </p>
          <p className="mt-1 break-all font-mono text-xs text-muted">
            SHA-256: {preview.fileHash}
          </p>
        </div>
        {preview.duplicateFile ? (
          <span className="rounded-md border border-danger/40 px-2 py-1 text-xs font-semibold text-danger">
            Duplicate file blocked
          </span>
        ) : (
          <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted">
            Not a duplicate
          </span>
        )}
      </div>

      {preview.missingHeaders.length > 0 ? (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Missing required headers: {preview.missingHeaders.join(", ")}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map(([key, label]) => (
          <div className="rounded-md border border-border p-3" key={key}>
            <p className="text-xs uppercase text-muted">{label}</p>
            <p className="mt-1 font-mono text-2xl">
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
          {disabledReasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-danger">
              {disabledReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-primary">Ready to confirm.</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border p-3">
        <p className="text-xs uppercase text-muted">Company/File Totals</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="whitespace-nowrap px-2 py-2">Calls</th>
                {durationLabels.map(({ key, label }) => (
                  <th className="whitespace-nowrap px-2 py-2" key={key}>
                    {label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2">
                  Included Valid Rows
                </th>
                <th className="whitespace-nowrap px-2 py-2">
                  Excluded Invalid Rows
                </th>
                <th className="whitespace-nowrap px-2 py-2">
                  Mapped Valid Rows
                </th>
                <th className="whitespace-nowrap px-2 py-2">
                  Unmapped Valid Rows
                </th>
                <th className="whitespace-nowrap px-2 py-2">
                  Out-of-Scope Valid Rows
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.totalCalls)}
                </td>
                {durationLabels.map(({ key }) => (
                  <td className="whitespace-nowrap px-2 py-2" key={key}>
                    <DurationCell
                      seconds={preview.fileSummary.durationTotals[key]}
                    />
                  </td>
                ))}
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.includedValidRows)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.excludedInvalidRows)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.mappedValidRows)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.unmappedValidRows)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono">
                  {formatNumber(preview.fileSummary.outOfScopeValidRows)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Filter
          <select
            className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
            onChange={(event) => setFilter(event.target.value as FilterKey)}
            value={filter}
          >
            <option value="all">All agents</option>
            <option value="mapped">Mapped</option>
            <option value="unmapped">Unmapped</option>
            <option value="out_of_scope">Out of scope</option>
            <option value="invalid_rows">Agents with invalid rows</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Sort by
          <select
            className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
            onChange={(event) => setSort(event.target.value as SortKey)}
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
          className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
          onClick={() =>
            setDirection((current) => (current === "asc" ? "desc" : "asc"))
          }
          type="button"
        >
          {direction === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="min-w-44 px-2 py-2">Dialer Agent Name</th>
              <th className="whitespace-nowrap px-2 py-2">Mapping Status</th>
              <th className="min-w-36 px-2 py-2">Dashboard User</th>
              <th className="min-w-36 px-2 py-2">Team</th>
              <th className="whitespace-nowrap px-2 py-2">CSV Row Count</th>
              <th className="min-w-44 px-2 py-2">Date Range</th>
              <th className="whitespace-nowrap px-2 py-2">Calls</th>
              {durationLabels.map(({ key, label }) => (
                <th className="whitespace-nowrap px-2 py-2" key={key}>
                  {label}
                </th>
              ))}
              <th className="whitespace-nowrap px-2 py-2">New Rows</th>
              <th className="whitespace-nowrap px-2 py-2">Changed Rows</th>
              <th className="whitespace-nowrap px-2 py-2">Unchanged Rows</th>
              <th className="whitespace-nowrap px-2 py-2">Invalid Rows</th>
              <th className="min-w-40 px-2 py-2">Import Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAgents.map((agent) => (
              <Fragment key={agent.agentKey}>
                <tr className="border-b border-border/70 align-top">
                  <td className="px-2 py-3 font-medium">
                    {agent.dialerAgentName}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <span
                      className={`rounded-md border px-2 py-1 text-xs font-semibold ${mappingStatusClass(agent.mappingStatus)}`}
                    >
                      {mappingStatusLabels[agent.mappingStatus]}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    {agent.dashboardUserName ?? "N/A"}
                  </td>
                  <td className="px-2 py-3">
                    {agent.teamNames.length > 0
                      ? agent.teamNames.join(", ")
                      : "N/A"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.csvRowCount)}
                  </td>
                  <td className="px-2 py-3">
                    {agent.dateRange.earliest ?? "N/A"} to{" "}
                    {agent.dateRange.latest ?? "N/A"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.calls)}
                  </td>
                  {durationLabels.map(({ key }) => (
                    <td className="whitespace-nowrap px-2 py-3" key={key}>
                      <DurationCell seconds={agent.durations[key]} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.rowCounts.new)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.rowCounts.changed)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.rowCounts.unchanged)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-mono">
                    {formatNumber(agent.rowCounts.invalid)}
                  </td>
                  <td className="px-2 py-3">{agent.importStatus}</td>
                </tr>
                <tr className="border-b border-border bg-background/50">
                  <td className="px-2 py-2" colSpan={22}>
                    <AgentDetails agent={agent} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <form action={confirmImportAction} className="mt-5">
        <input name="batchId" type="hidden" value={batchId} />
        <button
          className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabledReasons.length > 0}
        >
          Confirm import
        </button>
      </form>
    </section>
  );
}
