import Link from "next/link";

import type { LeaderboardData } from "@/leaderboard/data";

export function LeaderboardView({ data }: { data: LeaderboardData }) {
  return (
    <>
      <section className="ui-card ui-card--padded">
        <form
          aria-label="Leaderboard filters"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          method="get"
        >
          <label className="text-sm font-medium xl:col-span-2">
            Search
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={data.filters.query ?? ""}
              name="q"
              placeholder="Real Name or American Name"
              type="search"
            />
          </label>
          <label className="text-sm font-medium">
            Team
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
          <label className="text-sm font-medium">
            From
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={data.filters.from ?? ""}
              name="from"
              type="date"
            />
          </label>
          <label className="text-sm font-medium">
            To
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={data.filters.to ?? ""}
              name="to"
              type="date"
            />
          </label>
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-5">
            <button className="ui-button ui-button--primary" type="submit">
              Apply filters
            </button>
            <Link className="ui-button ui-button--secondary" href="/leaderboard">
              Clear
            </Link>
          </div>
        </form>
      </section>

      {data.status === "unconfigured" ? (
        <section
          aria-labelledby="leaderboard-unconfigured"
          className="ui-card ui-card--padded mt-4"
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
              LeaderBoard is awaiting closed-deals data
            </h2>
            <p className="mt-2 text-sm text-muted">{data.message}</p>
            <p className="mt-2 text-sm text-muted">
              Rankings will appear only after the real closed-deals source and
              attribution rules are connected. Transfer volume is not being
              shown as closed deals.
            </p>
          </div>
        </section>
      ) : data.rows.length === 0 ? (
        <section className="ui-card ui-card--padded mt-4">
          <div className="py-10 text-center">
            <h2 className="text-lg font-semibold">No ranking data found</h2>
            <p className="mt-2 text-sm text-muted">
              No attributed closed deals match the selected filters.
            </p>
          </div>
        </section>
      ) : (
        <section className="ui-card mt-4">
          <div className="hidden overflow-x-auto md:block">
            <table className="ui-table">
              <caption>Closed-deal ranking for all authenticated users</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Real Name</th>
                  <th scope="col">American Name</th>
                  <th scope="col">Team</th>
                  <th scope="col">Closed Deals</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.profileId}>
                    <td className="numeric">{row.rank}</td>
                    <th scope="row">{row.realName}</th>
                    <td>{row.americanName}</td>
                    <td>{row.teamName ?? "Unassigned"}</td>
                    <td className="numeric">{row.closedDeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="divide-y divide-border md:hidden">
            {data.rows.map((row) => (
              <li className="p-4" key={row.profileId}>
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
                    <p className="text-2xl font-semibold">{row.closedDeals}</p>
                    <p className="text-xs text-muted">Closed Deals</p>
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
