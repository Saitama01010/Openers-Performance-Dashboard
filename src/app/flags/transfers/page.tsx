import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  StatusBanner,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { getTransferFlagsData } from "@/flags/data";
import {
  TRANSFER_FLAG_LABELS,
  type TransferFlagClassification,
} from "@/flags/domain";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function classification(value: string | undefined) {
  return ["strong", "improvement"].includes(value ?? "")
    ? (value as TransferFlagClassification)
    : undefined;
}

export default async function TransferFlagsPage({
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
  const data = await getTransferFlagsData(actor, {
    dateRange,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
    profileId: first(params.profile)?.trim() || undefined,
    classification: classification(first(params.flag)),
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div>
          <h2>Transfer Flags</h2>
          <p>
            Each Monday–Sunday bucket is evaluated independently: 0–1 closed deals is Strong, 2 is Improvement, and 3+ is not flagged.
          </p>
        </div>
        <DashboardDateFilter
          ariaLabel="Transfer flags date filter"
          pathname="/flags/transfers"
          range={dateRange}
        />
      </div>

      {data.source.status === "unavailable" ? (
        <StatusBanner tone="danger">
          <strong>Closed source unavailable.</strong> {data.source.message} Missing-source data was not classified as zero deals.
        </StatusBanner>
      ) : null}

      {actor.role !== "agent" ? (
        <DashboardFilterToolbar
          ariaLabel="Transfer flag filters"
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
                    ...data.managers.map((manager) => ({ label: manager.name, value: manager.id })),
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
              label: "Flag type",
              name: "flag",
              value: first(params.flag),
              options: [
                { label: "All", value: "" },
                { label: "Strong Flag", value: "strong" },
                { label: "Flag for Improvement", value: "improvement" },
              ],
            },
          ]}
        />
      ) : null}

      {data.summary ? (
        <dl className="feature-summary">
          <div><dt>Scoped agents</dt><dd>{data.summary.scopedAgents}</dd></div>
          <div><dt>Strong weekly flags</dt><dd>{data.summary.strongFlags}</dd></div>
          <div><dt>Improvement weekly flags</dt><dd>{data.summary.improvementFlags}</dd></div>
        </dl>
      ) : null}

      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Triggered transfer flags</h2>
            <p className="ui-card__subtitle">
              Agents can appear more than once when separate calendar weeks trigger a flag.
            </p>
          </div>
        </div>
        <TableScroll label="Transfer flag results">
          <table className="ui-table">
            <caption>Flagged weekly Closed-deal records</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Team</th>
                <th scope="col">Closed Deals This Week</th>
                <th scope="col">Flag Type</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  title={data.source.status === "unavailable" ? "Transfer flags unavailable" : "No active flags"}
                  description={data.source.status === "unavailable" ? "The Closed source must load successfully before transfer flags can be evaluated." : "No agent-week record in this period triggered a transfer flag."}
                />
              ) : data.rows.map((row) => (
                <tr key={`${row.agentId}:${row.week.start}`}>
                  <th scope="row">{row.agentName}</th>
                  <td>{row.teamNames.join(", ") || "Unassigned"}</td>
                  <td className="numeric">
                    {row.closedDeals}
                    <span className="feature-cell-detail">
                      {row.week.start} – {row.week.end}
                    </span>
                  </td>
                  <td>
                    <StatusBadge tone={row.classification === "strong" ? "danger" : "warning"}>
                      {TRANSFER_FLAG_LABELS[row.classification]}
                    </StatusBadge>
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
