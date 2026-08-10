import Link from "next/link";
import type { CSSProperties } from "react";

import { SubmitButton } from "@/components/dashboard/action-controls";
import { CoachingRubricEntry } from "@/components/dashboard/coaching-rubric-entry";
import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/dashboard-icons";
import { OverviewDateFilter } from "@/components/dashboard/overview-date-filter";
import { formatCompactDuration } from "@/components/dashboard/performance-visuals";
import {
  EmptyTableRow,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { ManagerActions } from "@/components/dashboard/role-dashboard";
import styles from "@/components/dashboard/role-dashboard.module.css";
import {
  completeShadowingAction,
  transitionCoachingReportAction,
  updateManualFlagAction,
} from "@/dashboard/actions";
import type { OverviewDateRange } from "@/dashboard/date-range";
import type { RoleDashboardData } from "@/dashboard/role-data";

type AgentData = Extract<RoleDashboardData, { role: "agent" }>["data"];
type ManagerData = Extract<RoleDashboardData, { role: "manager" }>["data"];

type VisualStyle = CSSProperties & {
  "--bar-tone"?: string;
  "--metric-tone"?: string;
  "--progress-tone"?: string;
};

const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("en-US", {
  currency: "EGP",
  maximumFractionDigits: 0,
  style: "currency",
});

function number(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : compact.format(value);
}

function percentage(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : `${compact.format(value)}%`;
}

function money(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : currency.format(value);
}

function conversion(closedDeals: number | null, transfers: number | null) {
  if (closedDeals === null || transfers === null || transfers <= 0) return null;
  return (closedDeals / transfers) * 100;
}

function SourceValue({ metric }: { metric: { status: "ready" | "unavailable"; value: number | null } }) {
  return <>{metric.status === "ready" ? number(metric.value) : "Unavailable"}</>;
}

function RoleHero({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.heroDescription}>{description}</p>
      </div>
      <div className={styles.heroActions}>{actions}</div>
    </header>
  );
}

function RolePageActions({
  exportReport = false,
  performanceHref = "/performance",
  range,
}: {
  exportReport?: boolean;
  performanceHref?: string;
  range: OverviewDateRange;
}) {
  const params = new URLSearchParams({ range: range.key });
  if (range.key === "custom" && range.from && range.to) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return (
    <div className="role-page-actions">
      <OverviewDateFilter range={range} showAgentsWithNoData={false} />
      {exportReport ? (
        <a className="ui-button ui-button--secondary" href={`/api/dashboard/export?${params.toString()}`}>
          Export report
        </a>
      ) : null}
      <Link className="ui-button ui-button--secondary" href={performanceHref}>
        Detailed performance
      </Link>
    </div>
  );
}

function RoleKpi({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: DashboardIconName;
  label: string;
  tone: string;
  value: React.ReactNode;
}) {
  return (
    <article className={styles.kpi} style={{ "--metric-tone": tone } as VisualStyle}>
      <span className={styles.kpiTop}>
        <span className={styles.kpiIcon}><DashboardIcon name={icon} /></span>
        <span className={styles.kpiLabel}>{label}</span>
      </span>
      <strong className={styles.kpiValue}>{value}</strong>
      <span className={styles.kpiDetail}>{detail}</span>
    </article>
  );
}

function Panel({
  actions,
  children,
  className = "",
  description,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  const id = `role-panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`${styles.panel} ${className}`}>
      <header className={styles.panelHeader}>
        <div>
          <h2 id={id}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className={styles.panelActions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

function SourceHealthNotice({
  href,
  source,
}: {
  href: string;
  source: { status: string; message?: string };
}) {
  if (source.status === "ready") return null;
  return (
    <aside className={styles.sourceNotice} role="status">
      <span className={styles.sourceIcon}><DashboardIcon name="info" /></span>
      <div>
        <strong>{source.status === "partial" ? "Some outcome sources need attention" : "Outcome sources are unavailable"}</strong>
        <span>{source.message ?? "Unavailable metrics remain clearly marked and are never replaced with estimates."}</span>
      </div>
      <Link href={href}>View detailed performance</Link>
    </aside>
  );
}

function ProgressRow({
  detail,
  label,
  tone = "#1767f2",
  value,
}: {
  detail: string;
  label: string;
  tone?: string;
  value: number | null;
}) {
  const bounded = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={styles.progressRow}>
      <div className={styles.progressMeta}>
        <span>{label}</span>
        <strong>{value === null ? "Unavailable" : percentage(value)}</strong>
      </div>
      <span
        aria-label={`${label}: ${value === null ? "Unavailable" : percentage(value)}`}
        className={styles.progressTrack}
        role="img"
        style={{ "--progress-tone": tone } as VisualStyle}
      >
        <span style={{ width: `${bounded}%` }} />
      </span>
      <small className={styles.progressDetail}>{detail}</small>
    </div>
  );
}

function TeamStanding({ rows }: { rows: AgentData["teamCompetition"] }) {
  const maximum = Math.max(
    1,
    ...rows.map((team) => Math.max(team.transfers.value ?? 0, team.closedDeals.value ?? 0)),
  );
  if (rows.length === 0) return <p className={styles.empty}>No active teams are available.</p>;
  return (
    <div className={styles.teamRows}>
      {rows.map((team) => (
        <div className={styles.teamRow} key={team.teamId}>
          <span className={styles.teamName}>{team.teamName}<small>{team.activeAgents} active agents</small></span>
          <span className={styles.teamBars}>
            <span className={styles.teamBar} style={{ "--bar-tone": "#1767f2" } as VisualStyle}>
              <i style={{ width: `${((team.transfers.value ?? 0) / maximum) * 100}%` }} />
              <b>{team.transfers.status === "ready" ? number(team.transfers.value) : "Unavailable"}</b>
            </span>
            <span className={styles.teamBar} style={{ "--bar-tone": "#16a66a" } as VisualStyle}>
              <i style={{ width: `${((team.closedDeals.value ?? 0) / maximum) * 100}%` }} />
              <b>{team.closedDeals.status === "ready" ? number(team.closedDeals.value) : "Unavailable"}</b>
            </span>
          </span>
          <span className={styles.teamRank}>#{team.rank}</span>
        </div>
      ))}
    </div>
  );
}

export function AgentRoleDashboard({ data, userId }: { data: AgentData; userId: string }) {
  const commission = data.commission && "commissionAmount" in data.commission ? data.commission : null;
  const showTargets = Object.values(data.targets).some((target) => target.status !== "not_configured");
  const monthlyConversion = conversion(
    data.standing.monthly.closedDeals.value,
    data.standing.monthly.transfers.value,
  );
  const activeFlagCount =
    data.lastShift.automaticFlags.triggeredFlags.length +
    data.transferFlags.rows.length +
    data.manualFlags.length;
  return (
    <section className={`${styles.page} dashboard-page`}>
      <RoleHero
        actions={<RolePageActions range={data.period} performanceHref={`/agents/${userId}`} />}
        description="Your shift results, monthly progress, coaching, and action items. This view contains only your private performance records."
        eyebrow="My performance"
        title="My performance dashboard"
      />
      <SourceHealthNotice href="/performance" source={data.source} />

      <div className={styles.kpiGrid}>
        <RoleKpi detail={`Previous shift: ${number(data.lastShift.comparison.transfers.value)}`} icon="performance" label="Transfers" tone="#1767f2" value={<SourceValue metric={data.lastShift.transfers} />} />
        <RoleKpi detail={`Previous shift: ${number(data.lastShift.comparison.closedDeals.value)}`} icon="leaderboard" label="Closed deals" tone="#16a66a" value={<SourceValue metric={data.lastShift.closedDeals} />} />
        <RoleKpi detail="Closed deals divided by transfers" icon="activity" label="Conversion" tone="#8b5cf6" value={percentage(data.lastShift.conversion)} />
        <RoleKpi detail="Dialer-recorded login duration" icon="freshness" label="Logged-in time" tone="#f28705" value={formatCompactDuration(data.lastShift.activity.loggedInSeconds)} />
        <RoleKpi detail="Calls during the completed shift" icon="calls" label="Calls" tone="#06a6b7" value={number(data.lastShift.activity.calls)} />
        <RoleKpi detail="Activity-derived, not attendance" icon="calendar" label="Shift coverage" tone="#e54879" value={data.lastShift.coverage.status === "ready" ? percentage(data.lastShift.coverage.percentage) : "Incomplete source"} />
      </div>

      <div className={styles.agentOverviewGrid}>
        <Panel description="Month-to-date results and effective targets for your assigned team." title="Monthly progress">
          <div className={styles.progressList}>
            {showTargets ? (["transfers", "closedDeals"] as const).map((key) => {
              const target = data.targets[key];
              return (
                <ProgressRow
                  detail={target.status === "not_configured" ? "Target not configured" : `${number(target.actual)} of ${number(target.target)} · ${number(target.remaining)} remaining`}
                  key={key}
                  label={key === "transfers" ? "Transfer target" : "Closed-deal target"}
                  tone={key === "transfers" ? "#1767f2" : "#16a66a"}
                  value={target.status === "not_configured" ? null : target.percentage}
                />
              );
            }) : <p className={styles.empty}>Monthly targets are not configured for your current scope.</p>}
            <ProgressRow detail={`${number(data.standing.monthly.closedDeals.value)} closed from ${number(data.standing.monthly.transfers.value)} transfers`} label="Monthly conversion" tone="#8b5cf6" value={monthlyConversion} />
          </div>
        </Panel>

        <Panel description="Company ranking without exposing another employee's private records." title="Where I stand">
          <div className={styles.rankGrid}>
            <div className={styles.rankItem}><span>Weekly company</span><strong>{data.standing.weeklyRank ? `#${data.standing.weeklyRank}` : "—"}</strong><small>Current week</small></div>
            <div className={styles.rankItem}><span>Monthly company</span><strong>{data.standing.monthlyRank ? `#${data.standing.monthlyRank}` : "—"}</strong><small>{data.standing.totalRankedAgents ? `of ${data.standing.totalRankedAgents}` : "Not ranked"}</small></div>
            <div className={styles.rankItem}><span>Team today</span><strong>{data.standing.teamDailyRank ? `#${data.standing.teamDailyRank}` : "—"}</strong><small>Aggregate rank</small></div>
          </div>
          <div className={styles.statusStrip}>
            <StatusBadge tone={data.standing.wasTopPerformerLastMonth ? "success" : "info"}>
              {data.standing.wasTopPerformerLastMonth ? "Top performer last month" : "Top performer identity remains private"}
            </StatusBadge>
          </div>
        </Panel>

        <Panel actions={<Link className="ui-link" href="/commissions">View details</Link>} description="Current incomplete-month values are estimates from the Commission service." title="Commission snapshot">
          {commission ? (
            <div className={styles.commissionBody}>
              <div className={styles.commissionTotal}><span>Estimated total compensation</span><strong>{money(commission.totalCompensation)}</strong><small>{commission.tierLabel}</small></div>
              <div className={styles.commissionMeta}>
                <div><span>Commission</span><strong>{money(commission.commissionAmount)}</strong></div>
                <div><span>Closed deals</span><strong>{commission.closedDeals}</strong></div>
                <div><span>Rate per deal</span><strong>{money(commission.ratePerDeal)}</strong></div>
                <div><span>Next tier</span><strong>{commission.dealsUntilNextTier === null ? "Top tier" : `${commission.dealsUntilNextTier} deals`}</strong></div>
              </div>
            </div>
          ) : <p className={styles.empty}>Commission is unavailable because authoritative closed-deal data is unavailable.</p>}
        </Panel>
      </div>

      <div className={styles.detailsGrid}>
        <Panel description="Only finalized reports published to you appear here." title="My coaching and QA">
          {data.coachingReports.length === 0 ? <p className={styles.empty}>No published coaching reports.</p> : (
            <div className={styles.list}>
              {data.coachingReports.slice(0, 4).map((report) => (
                <article className={styles.listItem} key={report.id}>
                  <header><strong>{percentage(report.overallScore)} rubric score</strong><StatusBadge tone={report.status === "acknowledged" ? "success" : "info"}>{report.status}</StatusBadge></header>
                  <span>{report.sessionDate} · coached by {report.coachName}</span>
                  <p>{report.improvementAreas || report.strengths || "No published summary."}</p>
                  {report.status === "published" ? (
                    <form action={transitionCoachingReportAction}>
                      <input name="reportId" type="hidden" value={report.id} />
                      <input name="transition" type="hidden" value="acknowledge" />
                      <SubmitButton variant="secondary">Acknowledge report</SubmitButton>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel description="Calculated signals and published manual cases remain separate." title="Flags and action items">
          <div className={styles.queueGrid}>
            <div className={styles.queueItem}><span>Performance flags</span><strong>{data.lastShift.automaticFlags.triggeredFlags.length}</strong><small>Latest completed shift</small></div>
            <div className={styles.queueItem}><span>Transfer flags</span><strong>{data.transferFlags.rows.length}</strong><small>Current visible period</small></div>
            <div className={styles.queueItem}><span>Manual cases</span><strong>{data.manualFlags.length}</strong><small>Published to you</small></div>
            <div className={styles.queueItem}><span>Total attention</span><strong>{activeFlagCount}</strong><small>Across all signal types</small></div>
          </div>
          <div className={styles.statusStrip}>
            <StatusBadge tone={activeFlagCount ? "warning" : "success"}>{activeFlagCount ? "Review action items" : "No active action items"}</StatusBadge>
            {data.lastShift.automaticFlags.triggeredFlags.map((flag) => <StatusBadge key={flag} tone="warning">{flag}</StatusBadge>)}
          </div>
          {data.manualFlags.length ? (
            <div className={styles.list}>
              {data.manualFlags.slice(0, 3).map((flag) => (
                <article className={styles.listItem} key={flag.id}>
                  <header><strong>{flag.category}</strong><StatusBadge tone={flag.severity === "critical" || flag.severity === "high" ? "danger" : "warning"}>{flag.severity}</StatusBadge></header>
                  <p>{flag.reason}</p>
                  <span>{flag.requiredAction || "No action specified"} · {flag.status}</span>
                </article>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel description="Aggregate team results only; other employees' private records are never included." title="Team standing">
        <TeamStanding rows={data.teamCompetition} />
      </Panel>
    </section>
  );
}

function managerPageHref(data: ManagerData, page: number) {
  const params = new URLSearchParams({ range: data.period.key, page: String(page) });
  if (data.period.key === "custom" && data.period.from && data.period.to) {
    params.set("from", data.period.from);
    params.set("to", data.period.to);
  }
  return `/dashboard?${params.toString()}`;
}

function ManagerAgentTable({ data }: { data: ManagerData }) {
  return (
    <>
      <div className={styles.tableWrap}>
        <TableScroll label="Authorized team agents">
          <table className="ui-table">
            <caption>One row per active agent in assigned teams</caption>
            <thead><tr><th>Agent</th><th>Team</th><th>Shift coverage</th><th>Today</th><th>Month to date</th><th>Target</th><th>Rank</th><th>Coaching</th><th>Flags</th><th>Status</th></tr></thead>
            <tbody>
              {data.visibleRows.length === 0 ? <EmptyTableRow colSpan={10} title="No active agents in assigned teams" /> : data.visibleRows.map((row) => {
                const flagCount = row.automaticFlags.triggeredFlags.length + row.transferFlagCount + row.manualFlagCount;
                return (
                  <tr data-warning={row.lowPerformance.isLowPerformer || undefined} key={row.agentId}>
                    <th scope="row"><span className={styles.agentIdentity}><Link className="table-primary-link" href={`/agents/${row.agentId}`}>{row.agentName}</Link><small>{row.employmentStartDate ?? "Start date unavailable"} · {row.tenureDays === null ? "Tenure unavailable" : `${row.tenureDays} days`}</small></span></th>
                    <td>{row.team?.name ?? "—"}</td>
                    <td>{row.coverage.status === "ready" ? percentage(row.coverage.percentage) : "Incomplete source"}</td>
                    <td><span className={styles.metricPair}><strong><SourceValue metric={row.transfers} /> transfers</strong><small><SourceValue metric={row.closedDeals} /> closed</small></span></td>
                    <td><span className={styles.metricPair}><strong><SourceValue metric={row.monthTransfers} /> transfers</strong><small><SourceValue metric={row.monthClosedDeals} /> closed</small></span></td>
                    <td>{row.monthTargetProgress === null ? "Unavailable" : row.monthTargetProgress.status === "not_configured" ? "Not configured" : percentage(row.monthTargetProgress.percentage)}</td>
                    <td><span className={styles.metricPair}><strong>{row.weeklyRank ? `#${row.weeklyRank}` : "—"} weekly</strong><small>{row.monthlyRank ? `#${row.monthlyRank}` : "—"} monthly</small></span></td>
                    <td>{row.coachingPending ? `${row.coachingPending} pending` : "Clear"}</td>
                    <td>{flagCount}</td>
                    <td><StatusBadge tone={row.lowPerformance.isLowPerformer || flagCount ? "warning" : "success"}>{row.lowPerformance.isLowPerformer ? "Needs attention" : flagCount ? "Review signals" : "On track"}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </div>
      {data.pagination.pageCount > 1 ? (
        <nav aria-label="Agent table pages" className="role-pagination">
          {data.pagination.page > 1 ? <Link className="ui-button ui-button--secondary" href={managerPageHref(data, data.pagination.page - 1)}>Previous</Link> : <span />}
          <span>Page {data.pagination.page} of {data.pagination.pageCount} · {data.pagination.total} agents</span>
          {data.pagination.page < data.pagination.pageCount ? <Link className="ui-button ui-button--secondary" href={managerPageHref(data, data.pagination.page + 1)}>Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}

export function ManagerRoleDashboard({ data }: { data: ManagerData }) {
  const conversionValue = conversion(data.totals.closedDeals.value, data.totals.transfers.value);
  const coachingQueue = data.coachingReports.filter((report) => ["draft", "finalized"].includes(report.status)).length;
  const publishedReports = data.coachingReports.filter((report) => ["published", "acknowledged"].includes(report.status)).length;
  const shadowingDue = data.shadowing.filter((item) => ["due", "overdue"].includes(item.displayStatus)).length;
  const activeManualCases = data.manualFlags.filter((flag) => !["resolved", "dismissed"].includes(flag.status)).length;
  return (
    <section className={`${styles.page} dashboard-page`}>
      <RoleHero
        actions={<RolePageActions exportReport range={data.period} />}
        description="Team outcomes, coaching coverage, attention queues, and permitted actions for your currently assigned teams."
        eyebrow="Team operations"
        title={data.teamIds.length ? "Team performance dashboard" : "No active team assignment"}
      />
      <SourceHealthNotice href="/teams/performance" source={data.source} />
      {!data.teamIds.length ? <StatusBanner tone="info"><strong>Your operational scope is empty.</strong><p>An administrator must assign an active team before person-level data or actions become available.</p></StatusBanner> : null}

      <div className={styles.kpiGrid}>
        <RoleKpi detail="Currently assigned active agents" icon="users" label="Active agents" tone="#1767f2" value={data.totals.activeAgents} />
        <RoleKpi detail="Today's authorized team scope" icon="performance" label="Transfers today" tone="#1767f2" value={<SourceValue metric={data.totals.transfers} />} />
        <RoleKpi detail="Today's authoritative outcomes" icon="leaderboard" label="Closed deals today" tone="#16a66a" value={<SourceValue metric={data.totals.closedDeals} />} />
        <RoleKpi detail="Closed deals divided by transfers" icon="activity" label="Team conversion" tone="#8b5cf6" value={percentage(conversionValue)} />
        <RoleKpi detail="Estimated team commission" icon="commissions" label="Team commission" tone="#f28705" value={money(data.totals.commission)} />
        <RoleKpi detail="Agents with operational signals" icon="flag" label="Requires attention" tone="#e54879" value={data.totals.attention} />
      </div>

      <div className={styles.overviewGrid}>
        <Panel description="Month-to-date outcomes, target attainment, and recorded shift coverage." title="Team pulse">
          <div className={styles.progressList}>
            <ProgressRow detail={`${number(data.totals.monthClosedDeals.value)} closed from ${number(data.totals.monthTransfers.value)} transfers`} label="Month-to-date conversion" tone="#8b5cf6" value={conversion(data.totals.monthClosedDeals.value, data.totals.monthTransfers.value)} />
            <ProgressRow detail="Effective closed-deal target for your current team scope" label="Team target" tone="#16a66a" value={data.totals.monthTargetProgress && data.totals.monthTargetProgress.status !== "not_configured" ? data.totals.monthTargetProgress.percentage : null} />
            <ProgressRow detail="Activity-derived coverage, not attendance" label="Recorded shift coverage" tone="#f28705" value={data.totals.shiftCoverage} />
          </div>
        </Panel>

        <Panel actions={<Link className="ui-link" href="/coaching/room">Open coaching</Link>} description="Work that needs a manager decision or follow-up." title="Attention queue">
          <div className={styles.queueGrid}>
            <div className={styles.queueItem}><span>Rubric/report queue</span><strong>{coachingQueue}</strong><small>Draft or finalized</small></div>
            <div className={styles.queueItem}><span>Shadowing due</span><strong>{shadowingDue}</strong><small>Due or overdue</small></div>
            <div className={styles.queueItem}><span>Active manual cases</span><strong>{activeManualCases}</strong><small>Not resolved or dismissed</small></div>
            <div className={styles.queueItem}><span>Published reports</span><strong>{publishedReports}</strong><small>Published or acknowledged</small></div>
          </div>
        </Panel>

        <Panel description="Other teams appear only as aggregate results." title="Team comparison">
          <TeamStanding rows={data.teamCompetition} />
        </Panel>
      </div>

      <Panel actions={<Link className="ui-link" href="/agents">Open agent directory</Link>} description="A concise operational view of active agents in your assigned teams." title="Agent performance">
        <ManagerAgentTable data={data} />
      </Panel>

      <div className={styles.detailsGrid}>
        <Panel actions={<Link className="ui-link" href="/coaching/room">Open Coaching room</Link>} description="Create and finalize scoped coaching reports, shadowing, and follow-up actions." title="Coaching and QA pipeline">
          <div className={styles.statusStrip}>
            <StatusBadge tone={coachingQueue ? "warning" : "success"}>{coachingQueue} reports pending</StatusBadge>
            <StatusBadge tone={shadowingDue ? "warning" : "success"}>{shadowingDue} shadowing due</StatusBadge>
            <StatusBadge tone={activeManualCases ? "warning" : "success"}>{activeManualCases} active cases</StatusBadge>
          </div>
          <CoachingRubricEntry existingReports={data.coachingReports} sessions={data.coachingSessions} templates={data.rubricTemplates} />
        </Panel>

        <Panel description="The most recent scoped shadowing and manual-case workflows." title="Follow-up actions">
          {data.shadowing.filter((item) => item.status === "scheduled").length === 0 && activeManualCases === 0 ? <p className={styles.empty}>No active follow-up actions.</p> : (
            <div className={styles.list}>
              {data.shadowing.filter((item) => item.status === "scheduled").slice(0, 3).map((item) => (
                <article className={styles.listItem} key={item.id}>
                  <header><strong>Shadowing · {item.agentName}</strong><StatusBadge tone={item.displayStatus === "overdue" ? "danger" : "warning"}>{item.displayStatus}</StatusBadge></header>
                  <span>{item.scheduledDate}</span>
                  <form action={completeShadowingAction} className="role-form">
                    <input name="sessionId" type="hidden" value={item.id} />
                    <label className="ui-label">Published outcome<textarea className="ui-textarea" name="publishedOutcome" /></label>
                    <label className="ui-checkbox-label"><input name="publishToAgent" type="checkbox" />Publish outcome to agent</label>
                    <SubmitButton variant="secondary">Complete shadowing</SubmitButton>
                  </form>
                </article>
              ))}
              {data.manualFlags.filter((flag) => !["resolved", "dismissed"].includes(flag.status)).slice(0, 3).map((flag) => (
                <article className={styles.listItem} key={flag.id}>
                  <header><strong>Manual case · {flag.agentName}</strong><StatusBadge tone="warning">{flag.status}</StatusBadge></header>
                  <span>{flag.category}</span>
                  <form action={updateManualFlagAction} className="role-form">
                    <input name="caseId" type="hidden" value={flag.id} />
                    <label className="ui-label">Next status<select className="ui-select" name="status"><option value="under_review">Under review</option><option value="action_required">Action required</option><option value="coaching_scheduled">Coaching scheduled</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>
                    <label className="ui-label">Resolution<textarea className="ui-textarea" name="resolution" /></label>
                    <label className="ui-checkbox-label"><input name="publishToAgent" type="checkbox" />Publish agent-facing status</label>
                    <SubmitButton variant="secondary">Update case</SubmitButton>
                  </form>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {data.teamIds.length ? <div className={styles.managerActions}><ManagerActions data={data} /></div> : null}
    </section>
  );
}
