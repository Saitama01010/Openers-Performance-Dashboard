import Link from "next/link";

import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { MetricPanel } from "@/components/dashboard/performance-visuals";
import type { OverviewDateRange } from "@/dashboard/date-range";
import { formatNumber } from "@/import/format";
import type { LeaderboardData } from "@/leaderboard/data";
import {
  nextLeaderboardSort,
  sortLeaderboardDisplayRows,
  type LeaderboardSortColumn,
  type LeaderboardSortState,
} from "@/leaderboard/sorting";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateRange(range: OverviewDateRange) {
  if (!range.from || !range.to) return "All available history";
  if (range.from === range.to) return formatDate(range.from);
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function sortHref(
  data: LeaderboardData,
  dateRange: OverviewDateRange,
  currentSort: LeaderboardSortState,
  column: LeaderboardSortColumn,
) {
  const nextSort = nextLeaderboardSort(currentSort, column);
  const params = new URLSearchParams({ range: dateRange.key });

  if (dateRange.key === "custom" && dateRange.from && dateRange.to) {
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
  }
  if (data.filters.query) params.set("q", data.filters.query);
  if (data.filters.teamId) params.set("teamId", data.filters.teamId);
  if (nextSort) {
    params.set("sort", nextSort.column);
    params.set("direction", nextSort.direction);
  }

  return `/leaderboard?${params.toString()}`;
}

function sortAriaLabel(
  label: string,
  sort: LeaderboardSortState,
  column: LeaderboardSortColumn,
) {
  if (!sort || sort.column !== column) {
    return `${label} not sorted. Sort descending.`;
  }
  if (sort.direction === "desc") {
    return `${label} sorted descending. Sort ascending.`;
  }
  return `${label} sorted ascending. Clear sorting.`;
}

function ariaSort(
  sort: LeaderboardSortState,
  column: LeaderboardSortColumn,
) {
  if (sort?.column !== column) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

function SortLink({
  column,
  compact = false,
  data,
  dateRange,
  label,
  sort,
}: {
  column: LeaderboardSortColumn;
  compact?: boolean;
  data: LeaderboardData;
  dateRange: OverviewDateRange;
  label: string;
  sort: LeaderboardSortState;
}) {
  const state = sort?.column === column ? sort.direction : "none";

  return (
    <Link
      aria-label={sortAriaLabel(label, sort, column)}
      className={`leaderboard-sort-link${
        compact ? " leaderboard-sort-link--compact" : ""
      }`}
      data-active={state === "none" ? undefined : ""}
      href={sortHref(data, dateRange, sort, column)}
      scroll={false}
    >
      <span>{label}</span>
      <svg
        aria-hidden="true"
        className="leaderboard-sort-link__indicator"
        data-state={state}
        viewBox="0 0 12 14"
      >
        <path className="leaderboard-sort-link__up" d="m3 5 3-3 3 3" />
        <path className="leaderboard-sort-link__down" d="m3 9 3 3 3-3" />
      </svg>
    </Link>
  );
}

export function LeaderboardView({
  data,
  dateRange,
  sort = null,
}: {
  data: LeaderboardData;
  dateRange: OverviewDateRange;
  sort?: LeaderboardSortState;
}) {
  const totalTransfers =
    data.status === "ready" ? data.totalTransfers : null;
  const totalClosedDeals =
    data.status === "ready" ? data.totalClosedDeals : null;
  const conversionRate =
    totalTransfers && totalClosedDeals !== null
      ? (totalClosedDeals / totalTransfers) * 100
      : null;
  const displayRows =
    data.status === "ready"
      ? sortLeaderboardDisplayRows(data.rows, sort)
      : [];

  return (
    <>
      <section aria-labelledby="leaderboard-kpis-heading">
        <div className="section-heading section-heading--inline">
          <div>
            <p className="section-heading__overline">Leaderboard signals</p>
            <h2 id="leaderboard-kpis-heading">Transfer and outcome snapshot</h2>
          </div>
          <p>
            {dateRange.label} <strong>{formatDateRange(dateRange)}</strong>
          </p>
        </div>
        <div className="metric-panel-grid leaderboard-kpi-grid">
          <MetricPanel
            animatedValue={
              totalTransfers === null
                ? undefined
                : { format: "count", value: totalTransfers }
            }
            detail={
              totalTransfers === null
                ? "The Xfers source is not available for this reporting window."
                : "Valid Xfers rows matched to active agents."
            }
            icon="import"
            label="Total transfers"
            value={
              totalTransfers === null
                ? "Unavailable"
                : formatNumber(totalTransfers)
            }
          />
          <MetricPanel
            animatedValue={
              totalClosedDeals === null
                ? undefined
                : { format: "count", value: totalClosedDeals }
            }
            detail="Valid Closed rows matched to active agents."
            icon="leaderboard"
            label="Closed Deals"
            tone="green"
            value={
              totalClosedDeals === null
                ? "Unavailable"
                : formatNumber(totalClosedDeals)
            }
          />
          <MetricPanel
            detail="Matched closed deals divided by matched transfers."
            icon="performance"
            label="Conversion Rate %"
            tone="violet"
            value={
              conversionRate === null
                ? "Unavailable"
                : `${conversionRate.toFixed(1)}%`
            }
          />
        </div>
      </section>

      <section aria-labelledby="leaderboard-filters-heading" className="leaderboard-filter-section">
        <h2 className="sr-only" id="leaderboard-filters-heading">
          Filter LeaderBoard
        </h2>
        <DashboardFilterToolbar
          ariaLabel="Leaderboard filters"
          filters={[
            {
              kind: "combobox",
              label: "Agent",
              name: "q",
              value: data.filters.query,
              options: [
                { label: "All agents", value: "" },
                ...data.rows.map((row) => ({
                  label: `${row.realName} — ${row.americanName}`,
                  value: row.realName,
                })),
              ],
            },
            {
              label: "Team",
              name: "teamId",
              value: data.filters.teamId,
              options: [
                { label: "All teams", value: "" },
                ...data.teams.map((team) => ({ label: team.name, value: team.id })),
              ],
            },
          ]}
        />
      </section>

      {data.status === "ready" && data.stale ? (
        <section
          className="ui-card ui-card--padded leaderboard-state-card"
          role="status"
        >
          <p className="text-sm text-muted">
            Showing the last successful ranking because the latest source
            refresh could not be completed.
          </p>
        </section>
      ) : null}

      {data.status === "ready" && data.closedSourceEmpty ? (
        <section
          className="ui-card ui-card--padded leaderboard-state-card"
          role="status"
        >
          <p className="text-sm text-muted">
            The Closed source is connected, but no closed-deal submissions
            were found.
          </p>
        </section>
      ) : null}

      {data.status === "unconfigured" ? (
        <section
          aria-labelledby="leaderboard-unconfigured"
          className="ui-card ui-card--padded leaderboard-state-card"
        >
          <div className="mx-auto max-w-2xl py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-background text-xl"
            >
              —
            </div>
            <h2
              className="mt-4 text-lg font-semibold"
              id="leaderboard-unconfigured"
            >
              LeaderBoard is awaiting transfer data
            </h2>
            <p className="mt-2 text-sm text-muted">{data.message}</p>
            <p className="mt-2 text-sm text-muted">
              Rankings will appear after the server-only Google Apps Script
              connection is configured.
            </p>
          </div>
        </section>
      ) : data.status === "source_error" ? (
        <section
          aria-labelledby="leaderboard-source-error"
          className="ui-card ui-card--padded leaderboard-state-card"
          role="alert"
        >
          <div className="mx-auto max-w-2xl py-10 text-center">
            <h2
              className="text-lg font-semibold"
              id="leaderboard-source-error"
            >
              Transfer source needs attention
            </h2>
            <p className="mt-2 text-sm text-muted">{data.message}</p>
            <p className="mt-2 text-sm text-muted">
              Verify the Xfers response format, then retry this page.
            </p>
          </div>
        </section>
      ) : data.status === "closed_error" ? (
        <section
          aria-labelledby="leaderboard-closed-error"
          className="ui-card ui-card--padded leaderboard-state-card"
          role="alert"
        >
          <div className="mx-auto max-w-2xl py-10 text-center">
            <h2
              className="text-lg font-semibold"
              id="leaderboard-closed-error"
            >
              Closed source needs attention
            </h2>
            <p className="mt-2 text-sm text-muted">{data.message}</p>
            <p className="mt-2 text-sm text-muted">
              Xfers remains connected, but rankings require a valid Closed
              worksheet response.
            </p>
          </div>
        </section>
      ) : data.rows.length === 0 ? (
        <section className="ui-card ui-card--padded leaderboard-state-card">
          <div className="py-10 text-center">
            <h2 className="text-lg font-semibold">No ranking data found</h2>
            <p className="mt-2 text-sm text-muted">
              No active agents matched the selected search and team filters.
            </p>
          </div>
        </section>
      ) : (
        <section className="ui-card leaderboard-table-card">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Closed-deal rankings</h2>
              <p className="ui-card__subtitle">
                Ranked by matched Closed rows, then American Name.
              </p>
            </div>
            <p className="leaderboard-table-card__count">
              {formatNumber(data.rows.length)}{" "}
              {data.rows.length === 1 ? "opener" : "openers"}
            </p>
          </div>
          <div
            aria-label="Closed-deal rankings. Scroll horizontally to view all columns."
            className="hidden overflow-x-auto md:block"
            role="region"
            tabIndex={0}
          >
            <table className="ui-table">
              <caption>Closed-deal ranking for all authenticated users</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Real Name</th>
                  <th scope="col">American Name</th>
                  <th scope="col">Team</th>
                  <th
                    aria-sort={ariaSort(sort, "transfers")}
                    className="numeric leaderboard-sort-heading"
                    scope="col"
                  >
                    <SortLink
                      column="transfers"
                      data={data}
                      dateRange={dateRange}
                      label="Transfers"
                      sort={sort}
                    />
                  </th>
                  <th
                    aria-sort={ariaSort(sort, "closed-deals")}
                    className="numeric leaderboard-sort-heading"
                    scope="col"
                  >
                    <SortLink
                      column="closed-deals"
                      data={data}
                      dateRange={dateRange}
                      label="Closed Deals"
                      sort={sort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.profileId}>
                    <td className="numeric">{row.rank}</td>
                    <th scope="row">{row.realName}</th>
                    <td>{row.americanName}</td>
                    <td>{row.teamName ?? "Unassigned"}</td>
                    <td className="numeric">{row.transferCount}</td>
                    <td className="numeric">{row.closedDeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            aria-label="Leaderboard sorting"
            className="leaderboard-mobile-sort md:hidden"
          >
            <p>Sort rows</p>
            <div>
              <SortLink
                column="transfers"
                compact
                data={data}
                dateRange={dateRange}
                label="Transfers"
                sort={sort}
              />
              <SortLink
                column="closed-deals"
                compact
                data={data}
                dateRange={dateRange}
                label="Closed Deals"
                sort={sort}
              />
            </div>
          </div>
          <ol className="leaderboard-mobile-list md:hidden">
            {displayRows.map((row) => (
              <li key={row.profileId}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Rank {row.rank}
                    </p>
                    <h2 className="mt-1 font-semibold">{row.realName}</h2>
                    <p className="text-sm text-muted">{row.americanName}</p>
                    <p className="mt-2 text-sm">
                      {row.teamName ?? "Unassigned"}
                    </p>
                  </div>
                  <dl className="leaderboard-mobile-metrics">
                    <div>
                      <dt>Transfers</dt>
                      <dd>{row.transferCount}</dd>
                    </div>
                    <div>
                      <dt>Closed Deals</dt>
                      <dd>{row.closedDeals}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {"closedDiagnostics" in data && data.closedDiagnostics ? (
        <section
          aria-labelledby="closed-diagnostics-heading"
          className="ui-card ui-card--padded"
        >
          <div className="section-heading">
            <p className="section-heading__overline">Administrator diagnostics</p>
            <h2 id="closed-diagnostics-heading">Closed source health</h2>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Connection</dt>
              <dd>{data.closedDiagnostics.connectionStatus}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Worksheet</dt>
              <dd>{data.closedDiagnostics.worksheet}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Headers</dt>
              <dd>{data.closedDiagnostics.headerValidationStatus}</dd>
            </div>
            {"totalNonEmptyRows" in data.closedDiagnostics ? (
              <>
                <div>
                  <dt className="text-xs text-muted">Non-empty rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.totalNonEmptyRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Valid rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.validRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Matched rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.matchedRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Unmatched rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.unmatchedRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Ambiguous rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.ambiguousRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Invalid rows</dt>
                  <dd>{formatNumber(data.closedDiagnostics.invalidRows)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Invalid timestamps</dt>
                  <dd>
                    {formatNumber(data.closedDiagnostics.invalidTimestampRows)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Last synchronization</dt>
                  <dd>{data.closedDiagnostics.lastSuccessfulSynchronization}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
    </>
  );
}
