import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  COACHING_CATEGORY_LABELS,
  OVERALL_IMPROVEMENT_LABELS,
  type ImprovementComponent,
  type OverallImprovementStatus,
} from "@/coaching/domain";
import { getCoachingImprovementData } from "@/coaching/improvement-data";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  StatusBanner,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { resolveOverviewDateRange, type OverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function componentText(component: ImprovementComponent, kind: "count" | "rate") {
  if (!component.available || component.score === null) return "Unavailable";
  const before = kind === "count" ? component.before : component.before?.toFixed(2);
  const after = kind === "count" ? component.after : component.after?.toFixed(2);
  return `${before} → ${after} (${component.label ?? `${component.score.toFixed(1)}%`})`;
}

function statusTone(status: OverallImprovementStatus) {
  if (status === "improved") return "success" as const;
  if (status === "declined" || status === "source_unavailable") return "danger" as const;
  if (status === "pending") return "info" as const;
  return "warning" as const;
}

function rangeText(range: OverviewDateRange) {
  if (!range.from || !range.to) return "all time";
  return range.from === range.to ? range.from : `${range.from} – ${range.to}`;
}

export default async function CoachingImprovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role === "agent") redirect("/flags");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const data = await getCoachingImprovementData(actor, {
    dateRange,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
  });

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div>
          <h2>Improvement</h2>
          <p>Compare equal-weight outcomes around coaching sessions in the selected period.</p>
        </div>
        <DashboardDateFilter ariaLabel="Coaching improvement date filter" pathname="/coaching/improvement" range={dateRange} />
      </div>

      <DashboardFilterToolbar
        ariaLabel="Coaching improvement filters"
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
          ...(actor.role === "admin" ? [{
            kind: "combobox" as const,
            label: "Manager",
            name: "manager",
            value: first(params.manager),
            options: [
              { label: "All managers", value: "" },
              ...data.managers.map((manager) => ({ label: manager.name, value: manager.id })),
            ],
          }] : []),
        ]}
      />

      {data.closedSource.status === "unavailable" ? (
        <StatusBanner tone="danger">
          <strong>Closed source unavailable.</strong> {data.closedSource.message} Overall improvement is not fabricated from a zero-deal assumption.
        </StatusBanner>
      ) : null}

      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Overdue coaching</h2>
            <p className="ui-card__subtitle">Active agents with no coaching participant record during {rangeText(dateRange)}.</p>
          </div>
        </div>
        <TableScroll label="Overdue coaching agents">
          <table className="ui-table">
            <caption>Agents overdue for coaching in the selected period</caption>
            <thead><tr><th scope="col">Agent</th><th scope="col">Team</th><th scope="col">Manager</th><th scope="col">Last coaching date</th><th scope="col">Days since last coaching</th><th scope="col">Current status</th><th scope="col">Last category</th></tr></thead>
            <tbody>
              {data.overdue.length === 0 ? (
                <EmptyTableRow colSpan={7} title="No overdue agents" description="Every active agent in this scope received coaching in the selected period." />
              ) : data.overdue.map((row) => (
                <tr key={row.agentId}><th scope="row">{row.agentName}</th><td>{row.teamNames.join(", ") || "Unassigned"}</td><td>{row.managerNames.join(", ") || "Unassigned"}</td><td>{row.lastCoachingDate ?? "Never"}</td><td className="numeric">{row.daysSinceLastCoaching ?? "—"}</td><td><StatusBadge tone="danger">{row.currentWeekStatus}</StatusBadge></td><td>{row.lastCategory ? COACHING_CATEGORY_LABELS[row.lastCategory] : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section className="ui-card">
        <div className="ui-card__header"><div><h2 className="ui-card__title">Improvement after coaching</h2><p className="ui-card__subtitle">Seven complete days before versus seven complete days after; the coaching date is excluded.</p></div></div>
        <TableScroll label="Coaching improvement results">
          <table className="ui-table feature-table">
            <caption>Equal-weight coaching improvement results</caption>
            <thead><tr><th scope="col">Agent</th><th scope="col">Coaching</th><th scope="col">Closed-deal change</th><th scope="col">Wrap-efficiency change</th><th scope="col">Pause-efficiency change</th><th scope="col">Overall rate</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {data.improvement.length === 0 ? (
                <EmptyTableRow colSpan={7} title="No coached agents" description="No coaching session in the selected period has an improvement record." />
              ) : data.improvement.map((row) => (
                <tr key={`${row.agentId}:${row.sessionDate}`}><th scope="row">{row.agentName}<span className="feature-cell-detail">{row.teamNames.join(", ") || "Unassigned"}</span></th><td>{row.sessionDate}<span className="feature-cell-detail">{COACHING_CATEGORY_LABELS[row.category]} · {row.coachName}</span></td><td>{componentText(row.components.closedDeals, "count")}</td><td>{componentText(row.components.wrapEfficiency, "rate")}</td><td>{componentText(row.components.pauseEfficiency, "rate")}</td><td className="numeric">{row.overall.rate === null ? "—" : `${row.overall.rate.toFixed(1)}%`}</td><td><StatusBadge tone={statusTone(row.overall.status)}>{OVERALL_IMPROVEMENT_LABELS[row.overall.status]}</StatusBadge></td></tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
