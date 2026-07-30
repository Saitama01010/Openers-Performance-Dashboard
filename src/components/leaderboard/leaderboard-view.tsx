import Link from "next/link";

import { MetricPanel } from "@/components/dashboard/performance-visuals";
import type { OverviewDateRange } from "@/dashboard/date-range";
import { formatNumber } from "@/import/format";
import type { LeaderboardData } from "@/leaderboard/data";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateRange(range: OverviewDateRange) {
  if (range.from === range.to) return formatDate(range.from);
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function clearFiltersHref(range: OverviewDateRange) {
  const params = new URLSearchParams({ range: range.key });
  if (range.key === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return `/leaderboard?${params.toString()}`;
}

export function LeaderboardView({
  data,
  dateRange,
}: {
  data: LeaderboardData;
  dateRange: OverviewDateRange;
}) {
  const totalTransfers =
    data.status === "ready"
      ? data.rows.reduce((total, row) => total + row.transferCount, 0)
      : null;

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
                : "Valid transfers matched to the filtered ranking."
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
            detail="No real closed-deals provider or attribution rules are configured."
            icon="leaderboard"
            label="Closed Deals"
            tone="green"
            value="Unavailable"
          />
          <MetricPanel
            detail="Requires real closed deals divided by valid matched transfers."
            icon="performance"
            label="Conversion Rate %"
            tone="violet"
            value="Unavailable"
          />
        </div>
      </section>

      <section className="ui-card ui-card--padded leaderboard-filter-card">
        <form
          aria-label="Leaderboard filters"
          className="leaderboard-toolbar"
          method="get"
        >
          <input defaultValue={dateRange.key} name="range" type="hidden" />
          {dateRange.key === "custom" ? (
            <>
              <input defaultValue={dateRange.from} name="from" type="hidden" />
              <input defaultValue={dateRange.to} name="to" type="hidden" />
            </>
          ) : null}
          <label className="leaderboard-toolbar__search">
            Search
            <input
              defaultValue={data.filters.query ?? ""}
              name="q"
              placeholder="Real Name or American Name"
              type="search"
            />
          </label>
          <label>
            Team
            <select
              defaultValue={data.filters.teamId ?? ""}
              name="teamId"
            >
              <option value="">All teams</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <div className="leaderboard-toolbar__actions">
            <button className="ui-button ui-button--primary" type="submit">
              Apply filters
            </button>
            <Link
              className="ui-button ui-button--secondary"
              href={clearFiltersHref(dateRange)}
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

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
      ) : data.rows.length === 0 ? (
        <section className="ui-card ui-card--padded leaderboard-state-card">
          <div className="py-10 text-center">
            <h2 className="text-lg font-semibold">No ranking data found</h2>
            <p className="mt-2 text-sm text-muted">
              No valid transfers matched an active user and the selected
              filters.
            </p>
          </div>
        </section>
      ) : (
        <section className="ui-card leaderboard-table-card">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Transfer rankings</h2>
              <p className="ui-card__subtitle">
                Ranked by valid matched transfers, then American Name.
              </p>
            </div>
            <p className="leaderboard-table-card__count">
              {formatNumber(data.rows.length)}{" "}
              {data.rows.length === 1 ? "opener" : "openers"}
            </p>
          </div>
          <div
            aria-label="Transfer rankings. Scroll horizontally to view all columns."
            className="hidden overflow-x-auto md:block"
            role="region"
            tabIndex={0}
          >
            <table className="ui-table">
              <caption>Transfer ranking for all authenticated users</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Real Name</th>
                  <th scope="col">American Name</th>
                  <th scope="col">Team</th>
                  <th scope="col">Transfers</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.profileId}>
                    <td className="numeric">{row.rank}</td>
                    <th scope="row">{row.realName}</th>
                    <td>{row.americanName}</td>
                    <td>{row.teamName ?? "Unassigned"}</td>
                    <td className="numeric">{row.transferCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="leaderboard-mobile-list md:hidden">
            {data.rows.map((row) => (
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
                  <div className="text-right">
                    <p className="text-2xl font-semibold">
                      {row.transferCount}
                    </p>
                    <p className="text-xs text-muted">Transfers</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
