"use client";

import { useMemo, useState } from "react";

import {
  EmptyState,
  StatusBadge,
} from "@/components/dashboard/dashboard-primitives";
import { Icon } from "@/components/dashboard/icon";
import type { AgentPerformanceRow } from "@/dashboard/data";
import { secondsToDuration } from "@/dashboard/format";

type OptionalColumn =
  | "ready"
  | "ringing"
  | "wrap"
  | "paused"
  | "idle"
  | "untracked";

const optionalColumns: { key: OptionalColumn; label: string }[] = [
  { key: "ready", label: "Ready" },
  { key: "ringing", label: "Ringing" },
  { key: "wrap", label: "Wrap" },
  { key: "paused", label: "Paused" },
  { key: "idle", label: "Idle" },
  { key: "untracked", label: "Untracked" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusTone(status: AgentPerformanceRow["status"]) {
  if (status === "active") return "success" as const;
  if (status === "invited") return "info" as const;
  if (status === "deactivated") return "warning" as const;
  return "danger" as const;
}

export function AgentPerformanceTable({
  rows,
}: {
  rows: AgentPerformanceRow[];
}) {
  const [query, setQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalColumn>>(
    new Set(),
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;

    return rows.filter((row) =>
      [row.name, row.email, row.team, row.status].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [query, rows]);

  function toggleColumn(column: OptionalColumn) {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }

  return (
    <article className="dashboard-card min-w-0 overflow-hidden" id="agents">
      <div className="flex flex-col gap-4 border-b border-white/[0.055] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Performance by agent
          </h3>
          <p className="mt-1 text-xs text-muted">
            {rows.length} reporting {rows.length === 1 ? "agent" : "agents"} in
            this view
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 sm:w-64">
            <span className="sr-only">Search agents</span>
            <Icon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              name="search"
            />
            <input
              className="h-10 w-full rounded-xl border border-border bg-background/65 pr-3 pl-9 text-xs text-white placeholder:text-muted transition hover:border-border-strong focus:border-cyan"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agent or team"
              type="search"
              value={query}
            />
          </label>
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-border bg-background/65 px-3.5 text-xs font-semibold text-muted-strong transition hover:border-border-strong hover:text-white">
              <Icon className="size-4" name="filter" />
              Columns
              {visibleColumns.size > 0 ? (
                <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] text-white">
                  {visibleColumns.size}
                </span>
              ) : null}
            </summary>
            <div className="absolute top-12 right-0 z-20 w-48 rounded-xl border border-border bg-surface-raised p-2 shadow-2xl">
              <p className="px-2 py-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                Additional metrics
              </p>
              {optionalColumns.map((column) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-strong hover:bg-white/[0.045] hover:text-white"
                  key={column.key}
                >
                  <input
                    checked={visibleColumns.has(column.key)}
                    className="size-3.5 accent-[#168BFF]"
                    onChange={() => toggleColumn(column.key)}
                    type="checkbox"
                  />
                  {column.label}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          description="Agent rows will populate from role-scoped dialer metrics in the selected reporting window."
          icon="agents"
          title="No agent performance yet"
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          description={`No agent or team matches “${query}”. Try a different search.`}
          icon="search"
          title="No matching agents"
        />
      ) : (
        <div className="max-h-[33rem] overflow-auto">
          <table className="w-full min-w-[62rem] border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0d1928]/95 text-[10px] tracking-[0.08em] text-muted uppercase backdrop-blur">
              <tr>
                <th className="border-b border-border px-5 py-3.5 font-semibold sm:px-6">
                  Agent
                </th>
                <th className="border-b border-border px-3 py-3.5 font-semibold">
                  Team
                </th>
                <th className="border-b border-border px-3 py-3.5 text-right font-semibold">
                  Calls
                </th>
                <th className="border-b border-border px-3 py-3.5 text-right font-semibold">
                  Logged in
                </th>
                <th className="border-b border-border px-3 py-3.5 text-right font-semibold">
                  Talk time
                </th>
                <th className="border-b border-border px-3 py-3.5 text-right font-semibold">
                  Calls/hr
                </th>
                <th className="border-b border-border px-3 py-3.5 text-right font-semibold">
                  Talk %
                </th>
                {optionalColumns.map((column) =>
                  visibleColumns.has(column.key) ? (
                    <th
                      className="border-b border-border px-3 py-3.5 text-right font-semibold"
                      key={column.key}
                    >
                      {column.label}
                    </th>
                  ) : null,
                )}
                <th className="border-b border-border px-5 py-3.5 text-right font-semibold sm:px-6">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  className="group transition hover:bg-primary/[0.035]"
                  key={row.id}
                >
                  <td className="border-b border-border/60 px-5 py-3.5 sm:px-6">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/15 to-teal/10 text-[10px] font-bold text-cyan">
                        {initials(row.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {row.name}
                        </p>
                        <p className="mt-0.5 max-w-44 truncate text-[10px] text-muted">
                          {row.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-muted-strong">
                    {row.team}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-right font-mono font-semibold text-white">
                    {row.calls.toLocaleString()}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-right font-mono text-muted-strong">
                    {secondsToDuration(row.loginSeconds)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-right font-mono text-muted-strong">
                    {secondsToDuration(row.talkSeconds)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-right font-mono font-semibold text-cyan">
                    {row.callsPerHour.toFixed(1)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3.5 text-right font-mono text-muted-strong">
                    {row.talkPercentage.toFixed(1)}%
                  </td>
                  {optionalColumns.map((column) =>
                    visibleColumns.has(column.key) ? (
                      <td
                        className="border-b border-border/60 px-3 py-3.5 text-right font-mono text-muted-strong"
                        key={column.key}
                      >
                        {secondsToDuration(
                          column.key === "ready"
                            ? row.readySeconds
                            : column.key === "ringing"
                              ? row.ringingSeconds
                              : column.key === "wrap"
                                ? row.wrapSeconds
                                : column.key === "paused"
                                  ? row.pausedSeconds
                                  : column.key === "idle"
                                    ? row.idleSeconds
                                    : row.untrackedSeconds,
                        )}
                      </td>
                    ) : null,
                  )}
                  <td className="border-b border-border/60 px-5 py-3.5 text-right sm:px-6">
                    <StatusBadge
                      label={row.status}
                      tone={statusTone(row.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
