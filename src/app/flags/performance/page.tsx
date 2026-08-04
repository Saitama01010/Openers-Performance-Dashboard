import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { getPerformanceFlagsData } from "@/flags/data";
import { formatDurationSeconds } from "@/import/format";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PerformanceFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const data = await getPerformanceFlagsData(actor, {
    dateRange,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
    profileId: first(params.profile)?.trim() || undefined,
    wrap: first(params.wrap) === "flagged" ? "flagged" : "all",
    pause: first(params.pause) === "flagged" ? "flagged" : "all",
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div>
          <h2>Performance Flags</h2>
          <p>
            Only agents above the strict wrap or pause thresholds are shown.
          </p>
        </div>
        <DashboardDateFilter
          ariaLabel="Performance flags date filter"
          pathname="/flags/performance"
          range={dateRange}
        />
      </div>

      {actor.role !== "agent" ? (
        <DashboardFilterToolbar
          ariaLabel="Performance flag filters"
          filters={[
            {
              label: "Team",
              name: "team",
              value: first(params.team),
              options: [
                { label: "All teams", value: "" },
                ...data.teams.map((team) => ({ label: team.name, value: team.id })),
              ],
            },
            ...(actor.role === "admin"
              ? [{
                  kind: "combobox" as const,
                  label: "Manager",
                  name: "manager",
                  value: first(params.manager),
                  options: [
                    { label: "All managers", value: "" },
                    ...data.managers.map((manager) => ({
                      label: manager.name,
                      value: manager.id,
                    })),
                  ],
                }]
              : []),
            {
              kind: "combobox",
              label: "Agent",
              name: "profile",
              value: first(params.profile),
              options: [
                { label: "All agents", value: "" },
                ...data.agents.map((agent) => ({
                  label: `${agent.name} — ${agent.teams.map((team) => team.name).join(", ") || "Unassigned"}`,
                  value: agent.id,
                })),
              ],
            },
            {
              label: "Wrap flag type",
              name: "wrap",
              value: first(params.wrap) ?? "all",
              options: [
                { label: "All", value: "all" },
                { label: "Wrap flagged", value: "flagged" },
              ],
            },
            {
              label: "Pause flag type",
              name: "pause",
              value: first(params.pause) ?? "all",
              options: [
                { label: "All", value: "all" },
                { label: "Pause flagged", value: "flagged" },
              ],
            },
          ]}
        />
      ) : null}

      {data.summary ? (
        <dl className="feature-summary">
          <div><dt>Scoped agents</dt><dd>{data.summary.scopedAgents}</dd></div>
          <div><dt>Flagged agents</dt><dd>{data.summary.flaggedAgents}</dd></div>
          <div><dt>Wrap flags</dt><dd>{data.summary.wrapFlags}</dd></div>
          <div><dt>Pause flags</dt><dd>{data.summary.pauseFlags}</dd></div>
        </dl>
      ) : null}

      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Triggered performance flags</h2>
            <p className="ui-card__subtitle">
              Net counted time is talk + wrap + ready from active dataset versions only.
            </p>
          </div>
        </div>
        <TableScroll label="Performance flag results">
          <table className="ui-table feature-table">
            <caption>Agents with triggered performance flags</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Team</th>
                <th scope="col">Talk Time</th>
                <th scope="col">Wrap Time</th>
                <th scope="col">Pause Time</th>
                <th scope="col">Triggered Flag</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={6}
                  title="No active flags"
                  description="No agent in the authorized scope triggered a flag in this period."
                />
              ) : data.rows.map((row) => (
                <tr key={row.agentId}>
                  <th scope="row">{row.agentName}</th>
                  <td>{row.teamNames.join(", ") || "Unassigned"}</td>
                  <td>{formatDurationSeconds(row.talkSeconds).hms}</td>
                  <td>{formatDurationSeconds(row.wrapSeconds).hms}</td>
                  <td>{formatDurationSeconds(row.pausedSeconds).hms}</td>
                  <td>
                    <div className="feature-flag-reasons">
                      {row.wrapFlag && row.wrapRate !== null ? (
                        <StatusBadge tone="danger">
                          Wrap Time — {row.wrapRate.toFixed(1)} min per talk hour, above the {row.wrapThreshold.toFixed(1)} limit
                        </StatusBadge>
                      ) : null}
                      {row.pauseFlag && row.pauseRate !== null ? (
                        <StatusBadge tone="warning">
                          Pause Time — {row.pauseRate.toFixed(1)} min per net counted hour, above the {row.pauseThreshold.toFixed(1)} limit
                        </StatusBadge>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
