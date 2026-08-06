import Link from "next/link";

import { SubmitButton } from "@/components/dashboard/action-controls";
import { AdminOverview } from "@/components/dashboard/admin-overview/admin-overview";
import { CoachingRubricEntry } from "@/components/dashboard/coaching-rubric-entry";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { OverviewDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import type { OverviewDateRange } from "@/dashboard/date-range";
import type { RoleDashboardData } from "@/dashboard/role-data";
import {
  completeShadowingAction,
  createManualFlagAction,
  createShadowingAction,
  createTeamAgentAction,
  employmentAction,
  transitionCoachingReportAction,
  updateManualFlagAction,
} from "@/dashboard/actions";
import { formatCompactDuration } from "@/components/dashboard/performance-visuals";

type AgentData = Extract<RoleDashboardData, { role: "agent" }>["data"];
type ManagerData = Extract<RoleDashboardData, { role: "manager" }>["data"];
type AdminData = Extract<RoleDashboardData, { role: "admin" }>["data"];
type AgentCompetitionRow = AgentData["teamCompetition"][number];
type AdminCompetitionRow = AdminData["teamComparison"][number];

function isAdminCompetitionRow(row: AgentCompetitionRow | AdminCompetitionRow): row is AdminCompetitionRow {
  return "commission" in row;
}

function number(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function percentage(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : `${number(value)}%`;
}

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
}

function SourceMetric({ metric }: { metric: { status: "ready" | "unavailable"; value: number | null } }) {
  return <>{metric.status === "ready" ? number(metric.value) : "Unavailable"}</>;
}

function Metric({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <article className="role-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function Section({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="ui-card role-section">
      <div className="ui-card__header">
        <div><h2 className="ui-card__title" id={id}>{title}</h2>{description ? <p className="ui-card__subtitle">{description}</p> : null}</div>
        {actions ? <div className="ui-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SourceBanner({ source }: { source: { status: string; message?: string } }) {
  if (source.status === "ready") return null;
  return (
    <StatusBanner tone="warning">
      <strong>{source.status === "partial" ? "Closed-deal source unavailable" : "Outcome sources unavailable"}</strong>
      <p>{source.message ?? "The affected metrics remain unavailable; unaffected dialer sections are still shown."}</p>
    </StatusBanner>
  );
}

function TopPerformer({ wasTopPerformer }: { wasTopPerformer: boolean }) {
  return (
    <div className="role-top-performer">
      <DashboardIcon name="leaderboard" />
      {wasTopPerformer ? (
        <div>
          <p>Top performer last month</p>
          <strong>You led the company ranking</strong>
          <span>Your own monthly outcomes are shown above.</span>
        </div>
      ) : <div><p>Top performer last month</p><strong>Private</strong><span>Another employee&apos;s identity and outcomes are not exposed in your personal view.</span></div>}
    </div>
  );
}

function CompetitionTable({ rows, admin = false }: { rows: AgentData["teamCompetition"] | AdminData["teamComparison"]; admin?: boolean }) {
  return (
    <TableScroll label="Team competition">
      <table className="ui-table">
        <caption>Aggregate active-team comparison; no other-team private employee data is included.</caption>
        <thead><tr><th>Rank</th><th>Team</th><th>Active agents</th><th>Transfers</th><th>Closed deals</th><th>Conversion</th><th>Target</th><th>Coaching</th>{admin ? <><th>Commission</th><th>Rubric</th><th>QA pending</th><th>Shadowing</th><th>Active flags</th><th>Past-ramp low</th><th>Shift coverage</th><th>Drill-down</th></> : null}</tr></thead>
        <tbody>
          {rows.length === 0 ? <EmptyTableRow colSpan={admin ? 16 : 8} title="No active teams are available" /> : rows.map((row) => {
            return <tr key={row.teamId}>
              <td className="numeric">{row.rank}</td><th scope="row">{row.teamName}</th><td className="numeric">{row.activeAgents}</td>
              <td className="numeric"><SourceMetric metric={row.transfers} /></td><td className="numeric"><SourceMetric metric={row.closedDeals} /></td>
              <td className="numeric">{percentage(row.conversion)}</td>
              <td>{row.targetProgress.status === "not_configured" ? "Not configured" : percentage(row.targetProgress.percentage)}</td>
              <td>{percentage(row.coachingCompletion)}</td>
              {admin && isAdminCompetitionRow(row) ? <><td>{money(row.commission)}</td><td>{percentage(row.rubricCompletion)}</td><td>{row.qaPending}</td><td>{percentage(row.shadowingCompletion)}</td><td>{row.activeFlags}</td><td>{row.lowPastRamp}</td><td>{percentage(row.shiftCoverage)}</td><td><Link className="ui-link" href={`/teams/performance?teamId=${row.teamId}`}>Open team</Link></td></> : null}
            </tr>;
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

function PageActions({ range, performanceHref = "/performance", exportReport = false }: { range: OverviewDateRange; performanceHref?: string; exportReport?: boolean }) {
  const params = new URLSearchParams({ range: range.key });
  if (range.key === "custom" && range.from && range.to) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return <div className="role-page-actions"><OverviewDateFilter range={range} showAgentsWithNoData={false} />{exportReport ? <a className="ui-button ui-button--secondary" href={`/api/dashboard/export?${params.toString()}`}>Export report</a> : null}<Link className="ui-button ui-button--secondary" href={performanceHref}>Detailed performance</Link></div>;
}

export function AgentRoleDashboard({ data, userId }: { data: AgentData; userId: string }) {
  const commission = data.commission && "commissionAmount" in data.commission ? data.commission : null;
  const showTargets = Object.values(data.targets).some(
    (target) => target.status !== "not_configured",
  );
  return (
    <section className="dashboard-page role-dashboard">
      <PageHeader eyebrow="My performance" title="Your operating picture" description="Personal outcomes, target progress, coaching, and actions. Only your private records are loaded." actions={<PageActions range={data.period} performanceHref={`/agents/${userId}`} />} />
      <SourceBanner source={data.source} />
      <Section title="Last completed shift" description={`${data.lastShift.window.startDate} 16:00 through ${data.lastShift.window.endDate} 06:00 · application timezone`}>
        <div className="role-metric-grid">
          <Metric label="Transfers" value={<SourceMetric metric={data.lastShift.transfers} />} />
          <Metric label="Closed deals" value={<SourceMetric metric={data.lastShift.closedDeals} />} />
          <Metric label="Conversion" value={percentage(data.lastShift.conversion)} detail="Closed deals ÷ transfers" />
          <Metric label="Shift coverage" value={data.lastShift.coverage.status === "ready" ? percentage(data.lastShift.coverage.percentage) : "Incomplete source"} detail="Dialer-derived recorded login coverage" />
          <Metric label="Calls" value={number(data.lastShift.activity.calls)} />
          <Metric label="Logged-in time" value={formatCompactDuration(data.lastShift.activity.loggedInSeconds)} />
        </div>
        <div className="role-status-row"><StatusBadge tone={data.lastShift.automaticFlags.triggeredFlags.length ? "warning" : "success"}>{data.lastShift.automaticFlags.triggeredFlags.length ? data.lastShift.automaticFlags.triggeredFlags.join(" · ") : "No automatic dialer flags"}</StatusBadge><span>Previous shift: <SourceMetric metric={data.lastShift.comparison.transfers} /> transfers · <SourceMetric metric={data.lastShift.comparison.closedDeals} /> closed deals</span></div>
      </Section>
      <div className="role-two-column">
        <Section title="Where I stand" description="Company-wide rank without exposing other employees’ private records.">
          <div className="role-metric-grid role-metric-grid--compact">
            <Metric label="Weekly company rank" value={data.standing.weeklyRank ? `#${data.standing.weeklyRank}` : "Unavailable"} />
            <Metric label="Monthly company rank" value={data.standing.monthlyRank ? `#${data.standing.monthlyRank}` : "Unavailable"} detail={data.standing.totalRankedAgents ? `of ${data.standing.totalRankedAgents} active ranked agents` : undefined} />
            <Metric label="Team daily rank" value={data.standing.teamDailyRank ? `#${data.standing.teamDailyRank}` : "Unavailable"} />
            <Metric label="Month transfers" value={<SourceMetric metric={data.standing.monthly.transfers} />} />
            <Metric label="Month closed deals" value={<SourceMetric metric={data.standing.monthly.closedDeals} />} />
          </div>
          <TopPerformer wasTopPerformer={data.standing.wasTopPerformerLastMonth} />
        </Section>
        {showTargets ? <Section title="Month-to-date targets" description="Effective-dated team or company settings.">
          <div className="role-target-list">
            {(["transfers", "closedDeals"] as const).map((key) => {
              const target = data.targets[key];
              return <div key={key}><span>{key === "transfers" ? "Transfers" : "Closed deals"}</span><strong>{target.status === "not_configured" ? "Target not configured" : `${number(target.actual)} / ${number(target.target)}`}</strong>{target.status !== "not_configured" ? <><progress max={100} value={Math.min(100, target.percentage)} /><small>{percentage(target.percentage)} · {number(target.remaining)} remaining</small></> : null}</div>;
            })}
          </div>
        </Section> : null}
      </div>
      <Section title="My commission" description="Calculated by the existing Commission service; the current incomplete month is an estimate." actions={<Link className="ui-link" href="/commissions">Open Commissions</Link>}>
        {commission ? <div className="role-metric-grid"><Metric label="Closed deals" value={commission.closedDeals} /><Metric label="Tier" value={commission.tierLabel} /><Metric label="Rate per deal" value={money(commission.ratePerDeal)} /><Metric label="Estimated commission" value={money(commission.commissionAmount)} /><Metric label="Base salary" value={money(commission.baseSalary)} /><Metric label="Estimated total" value={money(commission.totalCompensation)} detail={commission.dealsUntilNextTier === null ? "Uncapped 25+ tier" : `${commission.dealsUntilNextTier} deals until next tier`} /></div> : <p className="role-empty">Commission is unavailable because authoritative closed-deal data is unavailable.</p>}
      </Section>
      <div className="role-two-column">
        <Section title="My coaching and QA" description="Only finalized reports published to you appear here.">
          {data.coachingReports.length === 0 ? <p className="role-empty">No published coaching reports.</p> : <div className="role-list">{data.coachingReports.slice(0, 5).map((report) => <article key={report.id}><div><strong>{percentage(report.overallScore)} rubric score</strong><span>{report.sessionDate} · coached by {report.coachName} · {report.status}</span></div><p>{report.strengths || "No published strengths summary."}</p><p>{report.improvementAreas || "No published improvement summary."}</p>{report.status === "published" ? <form action={transitionCoachingReportAction}><input name="reportId" type="hidden" value={report.id} /><input name="transition" type="hidden" value="acknowledge" /><SubmitButton variant="secondary">Acknowledge report</SubmitButton></form> : <StatusBadge tone="success">Acknowledged</StatusBadge>}</article>)}</div>}
          {data.shadowing.length ? <div className="role-list role-list--compact">{data.shadowing.map((session) => <article key={session.id}><strong>Shadowing · {session.displayStatus}</strong><span>{session.scheduledDate}</span><p>{session.publishedOutcome || session.objective}</p></article>)}</div> : null}
        </Section>
        <Section title="My flags and actions" description="Calculated flags and published manual cases remain separate.">
          <div className="role-status-row"><StatusBadge tone={data.lastShift.automaticFlags.triggeredFlags.length ? "warning" : "success"}>Performance flags: {data.lastShift.automaticFlags.triggeredFlags.length}</StatusBadge><StatusBadge tone={data.transferFlags.rows.length ? "warning" : "success"}>Transfer flags: {data.transferFlags.rows.length}</StatusBadge><StatusBadge tone={data.manualFlags.length ? "warning" : "success"}>Manual cases: {data.manualFlags.length}</StatusBadge></div>
          {data.manualFlags.length === 0 ? <p className="role-empty">No published manual actions.</p> : <div className="role-list">{data.manualFlags.map((flag) => <article key={flag.id}><div><strong>{flag.category}</strong><StatusBadge tone={flag.severity === "critical" || flag.severity === "high" ? "danger" : "warning"}>{flag.severity}</StatusBadge></div><p>{flag.reason}</p><span>{flag.requiredAction || "No action specified"} · {flag.status}</span>{flag.resolution ? <small>{flag.resolution}</small> : null}</article>)}</div>}
        </Section>
      </div>
      <Section title="Team competition" description="Aggregate results only; private employee records from other teams are never included."><CompetitionTable rows={data.teamCompetition} /></Section>
    </section>
  );
}

export function PersonalPerformanceSummary({ data }: { data: AgentData }) {
  const commission = data.commission && "commissionAmount" in data.commission ? data.commission : null;
  const showTargets = Object.values(data.targets).some(
    (target) => target.status !== "not_configured",
  );
  return (
    <>
      <SourceBanner source={data.source} />
      <Section title="Personal outcomes and progress" description="Authorized personal outcome, rank, target, commission, coaching, flag, and shift context for the selected experience.">
        <div className="role-metric-grid">
          <Metric label="Month transfers" value={<SourceMetric metric={data.standing.monthly.transfers} />} />
          <Metric label="Month closed deals" value={<SourceMetric metric={data.standing.monthly.closedDeals} />} />
          <Metric label="Month conversion" value={data.standing.monthly.transfers.value !== null && data.standing.monthly.closedDeals.value !== null ? percentage(data.standing.monthly.transfers.value ? (data.standing.monthly.closedDeals.value / data.standing.monthly.transfers.value) * 100 : null) : "Unavailable"} />
          <Metric label="Weekly company rank" value={data.standing.weeklyRank ? `#${data.standing.weeklyRank}` : "Unavailable"} />
          <Metric label="Monthly company rank" value={data.standing.monthlyRank ? `#${data.standing.monthlyRank}` : "Unavailable"} />
          <Metric label="Estimated commission" value={money(commission?.commissionAmount)} />
          {showTargets ? <Metric label="Transfer target" value={data.targets.transfers.status === "not_configured" ? "Not configured" : percentage(data.targets.transfers.percentage)} /> : null}
          {showTargets ? <Metric label="Closed-deal target" value={data.targets.closedDeals.status === "not_configured" ? "Not configured" : percentage(data.targets.closedDeals.percentage)} /> : null}
          <Metric label="Latest coaching score" value={data.coachingReports[0] ? percentage(data.coachingReports[0].overallScore) : "No published report"} />
          <Metric label="Published manual flags" value={data.manualFlags.length} />
          <Metric label="Transfer flags" value={data.transferFlags.rows.length} />
          <Metric label="Shift coverage" value={data.lastShift.coverage.status === "ready" ? percentage(data.lastShift.coverage.percentage) : "Incomplete source"} />
        </div>
      </Section>
    </>
  );
}

function ManagerActions({ data }: { data: ManagerData }) {
  const destinations = data.teamCompetition;
  return (
    <Section title="Operational actions" description="Every mutation rechecks your current assigned-team scope on the server.">
      <div className="role-action-grid">
        <details><summary>Add team agent</summary><form action={createTeamAgentAction} className="role-form"><label className="ui-label">Name<input className="ui-input" name="name" required /></label><label className="ui-label">Email<input className="ui-input" name="email" required type="email" /></label><label className="ui-label">Assigned team<select className="ui-select" name="teamId" required>{destinations.filter((team) => data.teamIds.includes(team.teamId)).map((team) => <option key={team.teamId} value={team.teamId}>{team.teamName}</option>)}</select></label><label className="ui-label">Dialer name<input className="ui-input" name="dialerName" required /></label><label className="ui-label">Employment start<input className="ui-input" name="employmentStartDate" type="date" /></label><SubmitButton>Create agent</SubmitButton></form></details>
        <details><summary>Schedule shadowing</summary><form action={createShadowingAction} className="role-form"><AgentSelect name="agentProfileId" rows={data.rows} /><label className="ui-label">Scheduled date<input className="ui-input" name="scheduledDate" required type="date" /></label><label className="ui-label">Objective<textarea className="ui-textarea" name="objective" required /></label><SubmitButton>Schedule</SubmitButton></form></details>
        <details><summary>Raise manual flag</summary><form action={createManualFlagAction} className="role-form"><AgentSelect name="agentProfileId" rows={data.rows} /><label className="ui-label">Category<input className="ui-input" name="category" required /></label><label className="ui-label">Severity<select className="ui-select" name="severity"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label><label className="ui-label">Reason<textarea className="ui-textarea" name="reason" required /></label><label className="ui-checkbox-label"><input name="publishToAgent" type="checkbox" />Publish agent-facing reason</label><SubmitButton>Raise case</SubmitButton></form></details>
        <details><summary>Deactivate or terminate agent</summary><form action={employmentAction} className="role-form"><AgentSelect name="profileId" rows={data.rows} /><label className="ui-label">Action<select className="ui-select" name="status"><option value="deactivated">Deactivate access</option><option value="terminated">Terminate employment</option></select></label><label className="ui-label">Reason<textarea className="ui-textarea" name="reason" required /></label><label className="ui-checkbox-label"><input name="confirmEmploymentAction" required type="checkbox" />I confirm this immediately changes employment state and revokes active sessions.</label><SubmitButton variant="danger">Confirm action</SubmitButton></form></details>
      </div>
    </Section>
  );
}

function AgentSelect({ name, rows }: { name: string; rows: ManagerData["rows"] }) {
  return <label className="ui-label">Agent<select className="ui-select" name={name} required>{rows.map((row) => <option key={row.agentId} value={row.agentId}>{row.agentName}</option>)}</select></label>;
}

function managerPageHref(data: ManagerData, page: number) {
  const params = new URLSearchParams({ range: data.period.key, page: String(page) });
  if (data.period.key === "custom" && data.period.from && data.period.to) {
    params.set("from", data.period.from);
    params.set("to", data.period.to);
  }
  return `/dashboard?${params.toString()}`;
}

export function ManagerRoleDashboard({ data }: { data: ManagerData }) {
  return (
    <section className="dashboard-page role-dashboard">
      <PageHeader eyebrow="Team operations" title={data.teamIds.length ? "Assigned-team command center" : "No active team assignment"} description="Today’s performance, attention queues, coaching operations, and permitted team actions." actions={<PageActions exportReport range={data.period} />} />
      <SourceBanner source={data.source} />
      {!data.teamIds.length ? <StatusBanner tone="info"><strong>Your operational scope is empty.</strong><p>An administrator must assign an active team before person-level data or actions become available.</p></StatusBanner> : null}
      <Section title="Team header" description="Today and month-to-date, limited to currently assigned active teams."><div className="role-metric-grid"><Metric label="Active agents" value={data.totals.activeAgents} /><Metric label="Transfers today" value={<SourceMetric metric={data.totals.transfers} />} /><Metric label="Closed deals today" value={<SourceMetric metric={data.totals.closedDeals} />} /><Metric label="Team conversion" value={data.totals.transfers.value !== null && data.totals.closedDeals.value !== null ? percentage(data.totals.transfers.value ? (data.totals.closedDeals.value / data.totals.transfers.value) * 100 : null) : "Unavailable"} /><Metric label="MTD transfers" value={<SourceMetric metric={data.totals.monthTransfers} />} /><Metric label="MTD closed deals" value={<SourceMetric metric={data.totals.monthClosedDeals} />} />{data.totals.targetConfigured ? <Metric label="Team target" value={data.totals.monthTargetProgress === null ? "Unavailable" : data.totals.monthTargetProgress.status === "not_configured" ? "Not configured" : percentage(data.totals.monthTargetProgress.percentage)} /> : null}<Metric label="Recorded shift coverage" value={percentage(data.totals.shiftCoverage)} detail="Activity-derived, not attendance" /><Metric label="Team commission" value={money(data.totals.commission)} /><Metric label="Requires attention" value={data.totals.attention} /></div></Section>
      <Section title="Daily agent operating table" description="Missing sources remain unavailable and never create a low-performance label.">
        <TableScroll label="Authorized team agents"><table className="ui-table role-wide-table"><caption>One row per active agent in assigned teams</caption><thead><tr><th>Agent</th><th>Team</th><th>Employment start</th><th>Tenure</th><th>Shift coverage</th><th>Transfers</th><th>Closed</th><th>Conversion</th><th>MTD transfers</th><th>MTD closed</th><th>MTD target</th><th>Weekly rank</th><th>Monthly rank</th><th>Coaching</th><th>Shadowing</th><th>Auto flags</th><th>Manual flags</th><th>Low-performance reason</th></tr></thead><tbody>{data.visibleRows.length === 0 ? <EmptyTableRow colSpan={18} title="No active agents in assigned teams" /> : data.visibleRows.map((row) => <tr key={row.agentId} data-warning={row.lowPerformance.isLowPerformer || undefined}><th scope="row"><Link className="table-primary-link" href={`/agents/${row.agentId}`}>{row.agentName}</Link></th><td>{row.team?.name ?? "—"}</td><td>{row.employmentStartDate ?? "Unknown"}</td><td>{row.tenureDays === null ? "Unknown" : `${row.tenureDays} days`}</td><td>{row.coverage.status === "ready" ? percentage(row.coverage.percentage) : "Incomplete source"}</td><td><SourceMetric metric={row.transfers} /></td><td><SourceMetric metric={row.closedDeals} /></td><td>{percentage(row.conversion)}</td><td><SourceMetric metric={row.monthTransfers} /></td><td><SourceMetric metric={row.monthClosedDeals} /></td><td>{row.monthTargetProgress === null ? "Unavailable" : row.monthTargetProgress.status === "not_configured" ? "Not configured" : percentage(row.monthTargetProgress.percentage)}</td><td>{row.weeklyRank ? `#${row.weeklyRank}` : "Unavailable"}</td><td>{row.monthlyRank ? `#${row.monthlyRank}` : "Unavailable"}</td><td>{row.coachingPending ? `${row.coachingPending} pending` : "Clear"}</td><td>{row.shadowingPending ? `${row.shadowingPending} due` : "Clear"}</td><td>{row.automaticFlags.triggeredFlags.length + row.transferFlagCount}</td><td>{row.manualFlagCount}</td><td>{row.lowPerformance.status === "unavailable" ? "Unavailable" : row.lowPerformance.status === "not_configured" ? "Not configured" : row.lowPerformance.reasons.length ? row.lowPerformance.reasons.map((reason) => `${reason.metric}: ${number(reason.actual)} < ${number(reason.threshold)}`).join("; ") : "On track"}</td></tr>)}</tbody></table></TableScroll>
        {data.pagination.pageCount > 1 ? <nav aria-label="Agent table pages" className="role-pagination">{data.pagination.page > 1 ? <Link className="ui-button ui-button--secondary" href={managerPageHref(data, data.pagination.page - 1)}>Previous</Link> : <span /> }<span>Page {data.pagination.page} of {data.pagination.pageCount} · {data.pagination.total} agents</span>{data.pagination.page < data.pagination.pageCount ? <Link className="ui-button ui-button--secondary" href={managerPageHref(data, data.pagination.page + 1)}>Next</Link> : <span />}</nav> : null}
      </Section>
      <Section title="Team competition" description="Other teams appear only as aggregates."><CompetitionTable rows={data.teamCompetition} /></Section>
      <div className="role-two-column">
        <Section title="Coaching, QA, and shadowing pipeline">
          <div className="role-metric-grid role-metric-grid--compact">
            <Metric label="Rubric/report queue" value={data.coachingReports.filter((report) => ["draft", "finalized"].includes(report.status)).length} />
            <Metric label="Published reports" value={data.coachingReports.filter((report) => ["published", "acknowledged"].includes(report.status)).length} />
            <Metric label="Shadowing due" value={data.shadowing.filter((item) => ["due", "overdue"].includes(item.displayStatus)).length} />
            <Metric label="Manual cases active" value={data.manualFlags.filter((flag) => !["resolved", "dismissed"].includes(flag.status)).length} />
          </div>
          <Link className="ui-link-action" href="/coaching/room">Open Coaching room</Link>
          <CoachingRubricEntry
            existingReports={data.coachingReports}
            sessions={data.coachingSessions}
            templates={data.rubricTemplates}
          />
          <div className="role-list role-list--compact">
            {data.shadowing.filter((item) => item.status === "scheduled").slice(0, 3).map((item) => (
              <article key={item.id}>
                <strong>Shadowing · {item.agentName}</strong>
                <span>{item.scheduledDate} · {item.displayStatus}</span>
                <form action={completeShadowingAction} className="role-form">
                  <input name="sessionId" type="hidden" value={item.id} />
                  <label className="ui-label">Published outcome<textarea className="ui-textarea" name="publishedOutcome" /></label>
                  <label className="ui-checkbox-label"><input name="publishToAgent" type="checkbox" />Publish outcome to agent</label>
                  <SubmitButton variant="secondary">Complete shadowing</SubmitButton>
                </form>
              </article>
            ))}
            {data.manualFlags.filter((flag) => !["resolved", "dismissed"].includes(flag.status)).slice(0, 3).map((flag) => (
              <article key={flag.id}>
                <strong>Manual case · {flag.agentName}</strong>
                <span>{flag.category} · {flag.status}</span>
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
        </Section>
      </div>
      <ManagerActions data={data} />
    </section>
  );
}

export function AdminRoleDashboard({ data }: { data: AdminData }) {
  return <AdminOverview data={data} />;
}
