"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import styles from "@/components/dashboard/admin-overview/admin-overview.module.css";
import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import { OverviewDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  createRubricTemplateDialogAction,
  createTargetDialogAction,
  createThresholdDialogAction,
  updateEmploymentStartDialogAction,
  type DashboardActionState,
} from "@/dashboard/actions";
import {
  aggregateTalentByTenure,
  calculateMetricDelta,
  overallDataHealthStatus,
  type OverviewSourceStatus,
} from "@/dashboard/admin-overview";
import type { AdminDashboardData } from "@/dashboard/role-data";

type Team = AdminDashboardData["teamComparison"][number];
type Leader = AdminDashboardData["leaderPerformance"][number];
type ActionKey = "target" | "tenure" | "rubric" | "employment";

const initialDashboardActionState: DashboardActionState = {
  ok: false,
  message: "",
};

const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("en-US", {
  currency: "EGP",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : compact.format(value);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : `${compact.format(value)}%`;
}

function formatMoney(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : currency.format(value);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function metricValue(metric: { status: "ready" | "unavailable"; value: number | null }) {
  return metric.status === "ready" ? metric.value : null;
}

function statusLabel(status: OverviewSourceStatus) {
  return status[0].toUpperCase() + status.slice(1);
}

function statusTone(status: OverviewSourceStatus) {
  return `${styles.status} ${styles[`status_${status}`]}`;
}

function Panel({
  actions,
  children,
  className = "",
  description,
  id,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  id?: string;
  title: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`${styles.panel} ${className}`} id={id} tabIndex={id ? -1 : undefined}>
      <header className={styles.panelHeader}>
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className={styles.panelActions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

function Sparkline({ values, tone }: { values: Array<number | null>; tone: string }) {
  const ready = values.flatMap((value) => value === null ? [] : [value]);
  if (ready.length < 2) return <span aria-hidden="true" className={styles.sparklineEmpty} />;
  const max = Math.max(...ready);
  const min = Math.min(...ready);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = value === null ? 28 : 28 - ((value - min) / range) * 22;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg aria-hidden="true" className={styles.sparkline} viewBox="0 0 100 32">
      <polyline points={points} style={{ stroke: tone }} />
    </svg>
  );
}

function KpiCard({
  attention,
  comparisonLabel,
  current,
  format = formatNumber,
  history,
  icon,
  id,
  label,
  previous,
  sourceStatus,
  tone,
}: {
  attention?: { count: number; href: string; title: string };
  comparisonLabel: string | null;
  current: number | null;
  format?: (value: number | null) => string;
  history: Array<number | null>;
  icon: DashboardIconName;
  id: string;
  label: string;
  previous: number | null;
  sourceStatus: string;
  tone: string;
}) {
  const [open, setOpen] = useState(false);
  const delta = calculateMetricDelta(current, previous);
  const deltaTone = !delta || delta.absolute === 0 ? "neutral" : delta.absolute > 0 ? "positive" : "negative";
  return (
    <article
      className={styles.kpi}
      data-attention-count={attention?.count || undefined}
      data-attention-href={attention?.href}
      data-attention-title={attention?.title}
      data-overview-search-label={`${label} metric`}
      id={id}
    >
      <button aria-expanded={open} className={styles.kpiButton} onClick={() => setOpen((value) => !value)} type="button">
        <span className={styles.kpiTop}>
          <span className={styles.kpiIcon} style={{ backgroundColor: `${tone}18`, color: tone }}><DashboardIcon name={icon} /></span>
          <span className={styles.kpiLabel}>{label}</span>
        </span>
        <strong>{format(current)}</strong>
        <span className={`${styles.delta} ${styles[`delta_${deltaTone}`]}`}>
          {delta ? `${delta.absolute > 0 ? "↑" : delta.absolute < 0 ? "↓" : "—"} ${formatNumber(Math.abs(delta.absolute))}${delta.percentage === null ? "" : ` (${formatPercent(Math.abs(delta.percentage))})`}` : "—"}
        </span>
        <span className={styles.comparison}>{comparisonLabel ? `vs ${comparisonLabel}` : "No comparable period"}</span>
        <Sparkline tone={tone} values={history} />
      </button>
      {open ? (
        <div className={styles.kpiPopover} role="status">
          <strong>{label}</strong>
          <dl>
            <div><dt>Current</dt><dd>{format(current)}</dd></div>
            <div><dt>Previous</dt><dd>{format(previous)}</dd></div>
            <div><dt>Source</dt><dd>{sourceStatus}</dd></div>
          </dl>
        </div>
      ) : null}
    </article>
  );
}

function TeamComparison({ onPreview, rows }: { onPreview: (team: Team, trigger: HTMLElement) => void; rows: Team[] }) {
  const [visible, setVisible] = useState({ transfers: true, closed: true, commission: true });
  const maxCount = Math.max(1, ...rows.map((row) => Math.max(row.transfers.value ?? 0, row.closedDeals.value ?? 0)));
  const maxCommission = Math.max(1, ...rows.map((row) => row.commission ?? 0));
  return (
    <>
      <div aria-label="Chart series" className={styles.legend}>
        {([
          ["transfers", "Transfers", "#1767f2"],
          ["closed", "Closed deals", "#16a66a"],
          ["commission", "Commission (separate scale)", "#f28705"],
        ] as const).map(([key, label, color]) => (
          <button aria-pressed={visible[key]} key={key} onClick={() => setVisible((state) => ({ ...state, [key]: !state[key] }))} type="button">
            <span style={{ background: color }} />{label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className={styles.empty}>No active teams are available.</p> : (
        <div className={styles.teamChart}>
          {rows.map((row) => (
            <button
              aria-label={`Preview ${row.teamName}. ${formatNumber(row.transfers.value)} transfers, ${formatNumber(row.closedDeals.value)} closed deals, ${formatMoney(row.commission)} commission.`}
              className={styles.teamRow}
              data-overview-search-label={`${row.teamName} team`}
              id={`overview-team-${row.teamId}`}
              key={row.teamId}
              onClick={(event) => onPreview(row, event.currentTarget)}
              type="button"
            >
              <span className={styles.teamName}>{row.teamName}<small>{row.activeAgents} active agents</small></span>
              <span className={styles.teamBars}>
                {visible.transfers ? <span className={styles.barLine}><i style={{ background: "#1767f2", width: `${((row.transfers.value ?? 0) / maxCount) * 100}%` }} /><b>{formatNumber(row.transfers.value)}</b></span> : null}
                {visible.closed ? <span className={styles.barLine}><i style={{ background: "#16a66a", width: `${((row.closedDeals.value ?? 0) / maxCount) * 100}%` }} /><b>{formatNumber(row.closedDeals.value)}</b></span> : null}
                {visible.commission ? <span className={`${styles.barLine} ${styles.commissionLine}`}><i style={{ background: "#f28705", width: `${((row.commission ?? 0) / maxCommission) * 100}%` }} /><b>{formatMoney(row.commission)}</b></span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className={styles.chartNote}>Commission length uses its own EGP scale and is never compared directly with outcome counts.</p>
      <div className="sr-only"><table><caption>Accessible team comparison summary</caption><thead><tr><th>Team</th><th>Active agents</th><th>Transfers</th><th>Closed deals</th><th>Conversion</th><th>Commission</th></tr></thead><tbody>{rows.map((row) => <tr key={row.teamId}><th>{row.teamName}</th><td>{row.activeAgents}</td><td>{formatNumber(row.transfers.value)}</td><td>{formatNumber(row.closedDeals.value)}</td><td>{formatPercent(row.conversion)}</td><td>{formatMoney(row.commission)}</td></tr>)}</tbody></table></div>
    </>
  );
}

type TrendKey = "transfers" | "closedDeals" | "conversion";

function MonthlyTrends({ months }: { months: AdminDashboardData["trends"]["months"] }) {
  const [visible, setVisible] = useState<Record<TrendKey, boolean>>({ transfers: true, closedDeals: true, conversion: true });
  const [active, setActive] = useState<number | null>(null);
  const width = 560;
  const height = 230;
  const left = 42;
  const top = 16;
  const plotWidth = 482;
  const plotHeight = 164;
  const countMax = Math.max(1, ...months.flatMap((month) => [month.transfers.value ?? 0, month.closedDeals.value ?? 0]));
  const x = (index: number) => left + (months.length <= 1 ? plotWidth / 2 : (index / (months.length - 1)) * plotWidth);
  const countY = (value: number) => top + plotHeight - (value / countMax) * plotHeight;
  const percentY = (value: number) => top + plotHeight - (Math.min(100, value) / 100) * plotHeight;
  const series = [
    { key: "transfers" as const, label: "Transfers", color: "#1767f2", values: months.map((month) => month.transfers.value), y: countY },
    { key: "closedDeals" as const, label: "Closed deals", color: "#16a66a", values: months.map((month) => month.closedDeals.value), y: countY },
    { key: "conversion" as const, label: "Conversion", color: "#f28705", values: months.map((month) => month.conversion), y: percentY },
  ];
  function path(values: Array<number | null>, y: (value: number) => number) {
    return values.map((value, index) => value === null ? null : `${index === 0 || values[index - 1] === null ? "M" : "L"}${x(index)} ${y(value)}`).filter(Boolean).join(" ");
  }
  const hasHistory = months.some((month) => month.transfers.value !== null || month.closedDeals.value !== null);
  return (
    <>
      <div className={styles.legend}>{series.map((item) => <button aria-pressed={visible[item.key]} key={item.key} onClick={() => setVisible((state) => ({ ...state, [item.key]: !state[item.key] }))} type="button"><span style={{ background: item.color }} />{item.label}</button>)}</div>
      {!hasHistory ? <p className={styles.empty}>Not enough historical data.</p> : (
        <div className={styles.trendWrap}>
          <svg aria-label="Six-month transfers, closed deals, and conversion trend" className={styles.trendChart} role="img" viewBox={`0 0 ${width} ${height}`}>
            {[0, 0.5, 1].map((position) => <line className={styles.gridLine} key={position} x1={left} x2={left + plotWidth} y1={top + plotHeight * position} y2={top + plotHeight * position} />)}
            <text className={styles.axisLabel} x="2" y="14">Count</text><text className={styles.axisLabel} textAnchor="end" x={width - 2} y="14">%</text>
            {active !== null ? <line className={styles.crosshair} x1={x(active)} x2={x(active)} y1={top} y2={top + plotHeight} /> : null}
            {series.map((item) => visible[item.key] ? <g key={item.key}><path d={path(item.values, item.y)} fill="none" stroke={item.color} strokeWidth="2.5" />{item.values.map((value, index) => value === null ? null : <circle aria-label={`${months[index].label} ${item.label}: ${item.key === "conversion" ? formatPercent(value) : formatNumber(value)}`} cx={x(index)} cy={item.y(value)} fill="white" key={months[index].key} onBlur={() => setActive(null)} onFocus={() => setActive(index)} onMouseEnter={() => setActive(index)} r="4" role="button" stroke={item.color} strokeWidth="2" tabIndex={0} />)}</g> : null)}
            {months.map((month, index) => <text className={styles.monthLabel} key={month.key} textAnchor="middle" x={x(index)} y={210}>{month.label}</text>)}
          </svg>
          {active !== null ? <div className={styles.trendTooltip}><strong>{months[active].label}</strong><span>Transfers {formatNumber(months[active].transfers.value)}</span><span>Closed {formatNumber(months[active].closedDeals.value)}</span><span>Conversion {formatPercent(months[active].conversion)}</span></div> : null}
        </div>
      )}
    </>
  );
}

function DataHealth({ data, overall }: { data: AdminDashboardData["dataHealth"]; overall: OverviewSourceStatus }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = [
    {
      id: "import",
      title: "Latest Import",
      icon: "freshness" as const,
      status: (!data.latestImportStatus ? "unavailable" : data.invalidRowCount || data.unmappedRowCount ? "warning" : "healthy") as OverviewSourceStatus,
      summary: data.latestImportStatus ? `${data.importedRowCount} rows · ${data.unmappedRowCount} unmapped · ${data.invalidRowCount} invalid` : "No import is available",
      detail: `${data.mappedRowCount} mapped rows. Last sync: ${data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : "Unavailable"}.`,
      href: "/admin/imports",
    },
    {
      id: "outcomes", title: "Transfers / Closed", icon: "performance" as const,
      status: (data.outcomeStatus === "ready" ? "healthy" : data.outcomeStatus) as OverviewSourceStatus,
      summary: data.outcomeStatus === "ready" ? "Authoritative sources available" : "One or more outcome sources are affected",
      detail: `${data.transferDiagnostics ?? "Unavailable"} transfer diagnostics · ${data.closedDiagnostics ?? "Unavailable"} closed-deal diagnostics.`,
    },
    {
      id: "reconciliation", title: "Reconciliation & Delivery", icon: "permissions" as const,
      status: (data.reconciliation.callsMatch && data.reconciliation.loggedInSecondsMatch && data.failedDeliveryAttempts === 0 ? "healthy" : "warning") as OverviewSourceStatus,
      summary: data.reconciliation.callsMatch && data.reconciliation.loggedInSecondsMatch ? "Reconciled" : "Review source mismatch",
      detail: `${data.failedDeliveryAttempts} failed email delivery attempts. Missing hourly coverage remains incomplete, never absence.`,
    },
    {
      id: "version", title: "Dialer Active Version", icon: "calls" as const,
      status: (data.activeVersionCount > 0 && data.dialerStatus === "ACTIVE_IMPORT" ? "healthy" : "unavailable") as OverviewSourceStatus,
      summary: `${data.activeVersionCount} active scope${data.activeVersionCount === 1 ? "" : "s"} · ${data.activeVersionRows} rows`,
      detail: `Version: ${data.activeVersionId ?? "Unavailable"}. Latest metric: ${data.latestMetricDate ?? "Unavailable"}.`,
      href: "/admin/imports",
    },
  ];
  return (
    <Panel actions={<span className={statusTone(overall)}>{statusLabel(overall)}</span>} className={styles.healthPanel} id="overview-data-health" title="Data Health">
      <div className={styles.healthRows}>
        {rows.map((row) => <div className={styles.healthRow} key={row.id}><button aria-expanded={expanded === row.id} onClick={() => setExpanded((value) => value === row.id ? null : row.id)} type="button"><span className={styles.healthIcon}><DashboardIcon name={row.icon} /></span><span><strong>{row.title}</strong><small>{row.summary}</small></span><span className={statusTone(row.status)}>{statusLabel(row.status)}</span><span aria-hidden="true">›</span></button>{expanded === row.id ? <div className={styles.healthDetail}><p>{row.detail}</p>{row.href ? <Link href={row.href}>Open related administration page</Link> : null}</div> : null}</div>)}
      </div>
    </Panel>
  );
}

function TalentDistribution({ agents }: { agents: AdminDashboardData["talentDistributionAgents"] }) {
  const buckets = useMemo(() => aggregateTalentByTenure(agents), [agents]);
  const [active, setActive] = useState(() => buckets.reduce(
    (largestIndex, bucket, index) => bucket.count > buckets[largestIndex].count ? index : largestIndex,
    0,
  ));
  const colors = ["#22b879", "#1767f2", "#f28705", "#8055e8", "#8b98aa"];
  const gradient = buckets.map((bucket, index) => {
    const start = buckets.slice(0, index).reduce((total, item) => total + item.percentage, 0);
    return `${colors[index]} ${start}% ${start + bucket.percentage}%`;
  }).join(", ");
  const selected = buckets[active] ?? buckets[0];
  return (
    <Panel className={styles.talentPanel} description="Active agents grouped by authoritative employment tenure" title="Talent distribution">
      {agents.length === 0 ? <p className={styles.empty}>No active talent data is available.</p> : <div className={styles.talentBody}><div aria-label={`Talent distribution. ${selected?.label}: ${selected?.count} agents.`} className={styles.donut} role="img" style={{ background: `conic-gradient(${gradient})` }}><div><strong>{selected ? formatPercent(selected.percentage) : "0%"}</strong><span>{selected?.label}</span></div></div><div className={styles.talentLegend}>{buckets.map((bucket, index) => <button aria-pressed={active === index} key={bucket.key} onClick={() => setActive(index)} onFocus={() => setActive(index)} type="button"><span style={{ background: colors[index] }} /><b>{bucket.label}</b><small>{bucket.count} agents · {formatPercent(bucket.percentage)}</small></button>)}</div></div>}
      {selected ? <p className={styles.chartNote}>{selected.description}</p> : null}
    </Panel>
  );
}

function Progress({ label, value }: { label: string; value: number | null }) {
  return <span aria-label={`${label}: ${formatPercent(value)}`} className={styles.progress} tabIndex={0}><span><i style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} /></span><b>{formatPercent(value)}</b></span>;
}

function LeaderTable({ leaders, onPreview }: { leaders: Leader[]; onPreview: (leader: Leader, trigger: HTMLElement) => void }) {
  return (
    <Panel className={styles.leaderPanel} description="Performance summary by active team leaders" title="Team leader performance">
      <div className={styles.tableWrap} role="region" aria-label="Team leader performance table" tabIndex={0}>
        <table><thead><tr><th>Leader</th><th>Team</th><th>Active agents</th><th>Transfers</th><th>Closed deals</th><th>Conversion</th><th>Commissions</th><th>Coaching</th><th>QA pending</th><th>Shadowing</th></tr></thead><tbody>{leaders.length === 0 ? <tr><td colSpan={10}>No active managers are available.</td></tr> : leaders.map((leader) => <tr data-overview-search-label={`${leader.managerName} team leader`} id={`overview-leader-${leader.managerId}`} key={leader.managerId} onClick={(event) => onPreview(leader, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPreview(leader, event.currentTarget); } }} tabIndex={0}><th scope="row"><span className={styles.leaderIdentity}><span>{initials(leader.managerName)}</span><strong>{leader.managerName}</strong></span></th><td>{leader.teams.join(", ") || "Unassigned"}</td><td>{leader.activeAgents}</td><td>{formatNumber(leader.transfers)}</td><td>{formatNumber(leader.closedDeals)}</td><td>{formatPercent(leader.conversion)}</td><td>{formatMoney(leader.commission)}</td><td><Progress label="Coaching completion" value={leader.coachingCoverage} /></td><td>{leader.qaPending}</td><td><Progress label="Shadowing completion" value={leader.shadowingCompletion} /></td></tr>)}</tbody></table>
      </div>
    </Panel>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="ui-button ui-button--primary" disabled={pending} type="submit">{pending ? "Saving…" : children}</button>;
}

function DialogFrame({ children, description, onClose, open, title }: { children: React.ReactNode; description: string; onClose: () => void; open: boolean; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog className={styles.dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} ref={ref}><div className={styles.dialogCard}><header><div><h2>{title}</h2><p>{description}</p></div><button aria-label="Close dialog" className={styles.closeButton} onClick={onClose} type="button">×</button></header>{children}</div></dialog>;
}

function ActionFeedback({ state }: { state: DashboardActionState }) {
  if (!state.message) return null;
  return <p className={state.ok ? styles.formSuccess : styles.formError} role={state.ok ? "status" : "alert"}>{state.message}</p>;
}

function ManagementDialog({ action, data, onClose, onSuccess }: { action: ActionKey | null; data: AdminDashboardData; onClose: () => void; onSuccess: (message: string) => void }) {
  const [targetState, targetAction] = useActionState(createTargetDialogAction, initialDashboardActionState);
  const [tenureState, tenureAction] = useActionState(createThresholdDialogAction, initialDashboardActionState);
  const [rubricState, rubricAction] = useActionState(createRubricTemplateDialogAction, initialDashboardActionState);
  const [employmentState, employmentAction] = useActionState(updateEmploymentStartDialogAction, initialDashboardActionState);
  const states = useMemo(() => ({ target: targetState, tenure: tenureState, rubric: rubricState, employment: employmentState }), [targetState, tenureState, rubricState, employmentState]);
  const handled = useRef("");
  useEffect(() => {
    if (!action) return;
    const state = states[action];
    if (!state.ok || !state.message || handled.current === state.message) return;
    handled.current = state.message;
    onSuccess(state.message);
  }, [action, onSuccess, states]);
  const latestTarget = data.configuration.targets[0];
  const defaultDate = data.trends.months.at(-1)?.to ?? "";
  const teams = data.teamComparison;
  const definitions = {
    target: ["Set Performance Target", "Create an effective-dated target. Previous target records remain immutable."],
    tenure: ["Set Tenure Threshold", "Define a real tenure band and its applicable outcome thresholds."],
    rubric: ["Create Rubric Template", "Create a new versioned coaching rubric template."],
    employment: ["Set Employment Start", "Update an agent’s authoritative employment start date."],
  } as const;
  if (!action) return null;
  const [title, description] = definitions[action];
  return <DialogFrame description={description} onClose={onClose} open title={title}>
    {action === "target" ? <form action={targetAction} className={styles.form}><label>Scope<select defaultValue={latestTarget?.teamId ?? ""} name="teamId"><option value="">Company</option>{teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.teamName}</option>)}</select></label><label>Metric<select defaultValue={latestTarget?.metric ?? "closed_deals"} name="metric"><option value="transfers">Transfers</option><option value="closed_deals">Closed deals</option><option value="conversion">Conversion %</option></select></label><label>Target<input defaultValue={latestTarget?.targetValue ?? ""} min="0.01" name="targetValue" required step="0.01" type="number" /></label><div className={styles.formColumns}><label>Effective from<input defaultValue={latestTarget?.effectiveFrom ?? defaultDate} name="effectiveFrom" required type="date" /></label><label>Effective to<input defaultValue={latestTarget?.effectiveTo ?? ""} name="effectiveTo" type="date" /></label></div><label className={styles.checkbox}><input defaultChecked={latestTarget?.visibleToNonAdmins ?? true} name="visibleToNonAdmins" type="checkbox" />Show target progress to managers and agents</label><ActionFeedback state={targetState} /><footer><button className="ui-button ui-button--secondary" onClick={onClose} type="button">Cancel</button><Submit>Save target</Submit></footer></form> : null}
    {action === "tenure" ? <form action={tenureAction} className={styles.form}><label>Scope<select name="teamId"><option value="">Company</option>{teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.teamName}</option>)}</select></label><label>Band label<input name="bandLabel" required /></label><div className={styles.formColumns}><label>Minimum days<input min="0" name="minimumDays" required type="number" /></label><label>Maximum days<input min="0" name="maximumDays" type="number" /></label></div><div className={styles.formColumns}><label>Minimum transfers<input min="0" name="minimumTransfers" type="number" /></label><label>Minimum closed deals<input min="0" name="minimumClosedDeals" type="number" /></label></div><label>Minimum conversion %<input min="0" name="minimumConversion" step="0.01" type="number" /></label><label className={styles.checkbox}><input name="isRamp" type="checkbox" />Ramp band</label><label>Effective from<input defaultValue={defaultDate} name="effectiveFrom" required type="date" /></label><ActionFeedback state={tenureState} /><footer><button className="ui-button ui-button--secondary" onClick={onClose} type="button">Cancel</button><Submit>Save threshold</Submit></footer></form> : null}
    {action === "rubric" ? <form action={rubricAction} className={styles.form}><label>Template name<input name="name" required /></label><label>Description<textarea name="description" rows={2} /></label><label>Section label<input name="sectionLabel" required /></label><label>Criterion label<input name="criterionLabel" required /></label><label>Maximum score<input min="1" name="maximumScore" required type="number" /></label><ActionFeedback state={rubricState} /><footer><button className="ui-button ui-button--secondary" onClick={onClose} type="button">Cancel</button><Submit>Save template</Submit></footer></form> : null}
    {action === "employment" ? <form action={employmentAction} className={styles.form}><label>Agent<select name="profileId" required><option value="">Select an agent</option>{data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.employmentStartDate ? ` · ${agent.employmentStartDate}` : ""}</option>)}</select></label><label>Employment start date<input name="employmentStartDate" required type="date" /></label><ActionFeedback state={employmentState} /><footer><button className="ui-button ui-button--secondary" onClick={onClose} type="button">Cancel</button><Submit>Save start date</Submit></footer></form> : null}
  </DialogFrame>;
}

function PreviewDialog({ leader, onClose, team }: { leader: Leader | null; onClose: () => void; team: Team | null }) {
  const [teamId, setTeamId] = useState(leader?.teamIds[0] ?? "");
  const open = Boolean(team || leader);
  const title = team?.teamName ?? leader?.managerName ?? "Preview";
  return <DialogFrame description={team ? "Current team performance in the selected overview period." : "Current leader operations across managed teams."} onClose={onClose} open={open} title={title}>
    {team ? <div className={styles.previewGrid}><span>Active agents<strong>{team.activeAgents}</strong></span><span>Transfers<strong>{formatNumber(team.transfers.value)}</strong></span><span>Closed deals<strong>{formatNumber(team.closedDeals.value)}</strong></span><span>Conversion<strong>{formatPercent(team.conversion)}</strong></span><span>Commission<strong>{formatMoney(team.commission)}</strong></span><span>Coaching<strong>{formatPercent(team.coachingCompletion)}</strong></span><span>QA pending<strong>{team.qaPending}</strong></span><span>Shadowing<strong>{formatPercent(team.shadowingCompletion)}</strong></span><span>Active flags<strong>{team.activeFlags}</strong></span><span>Data status<strong>{team.transfers.status === "ready" && team.closedDeals.status === "ready" ? "Available" : "Partial"}</strong></span></div> : null}
    {leader ? <><div className={styles.previewGrid}><span>Managed teams<strong>{leader.teams.join(", ") || "Unassigned"}</strong></span><span>Active agents<strong>{leader.activeAgents}</strong></span><span>Transfers<strong>{formatNumber(leader.transfers)}</strong></span><span>Closed deals<strong>{formatNumber(leader.closedDeals)}</strong></span><span>Conversion<strong>{formatPercent(leader.conversion)}</strong></span><span>Commission<strong>{formatMoney(leader.commission)}</strong></span><span>Coaching<strong>{formatPercent(leader.coachingCoverage)}</strong></span><span>QA pending<strong>{leader.qaPending}</strong></span><span>Shadowing<strong>{formatPercent(leader.shadowingCompletion)}</strong></span><span>Active flags<strong>{leader.activeFlags}</strong></span></div>{leader.teamIds.length > 1 ? <label className={styles.previewSelect}>Team to open<select onChange={(event) => setTeamId(event.target.value)} value={teamId}>{leader.teamIds.map((id, index) => <option key={id} value={id}>{leader.teams[index] ?? id}</option>)}</select></label> : null}</> : null}
    <footer className={styles.previewFooter}><button className="ui-button ui-button--secondary" onClick={onClose} type="button">Close</button>{team ? <Link className="ui-button ui-button--primary" href={`/teams/performance?teamId=${team.teamId}`}>Open full team performance</Link> : leader && teamId ? <Link className="ui-button ui-button--primary" href={`/teams/performance?teamId=${teamId}`}>Open full team performance</Link> : null}</footer>
  </DialogFrame>;
}

function ManagementActions({ onOpen }: { onOpen: (key: ActionKey, trigger: HTMLButtonElement) => void }) {
  const actions = [
    ["target", "performance", "Set Performance Target", "Define goals for teams and leaders"],
    ["tenure", "users", "Set Tenure Threshold", "Configure tenure expectations"],
    ["rubric", "audit", "Create Rubric Template", "Standardize evaluation criteria"],
    ["employment", "calendar", "Set Employment Start", "Schedule agent start dates"],
  ] as const;
  return <Panel className={styles.management} description="Targets and thresholds are effective-dated; historical periods retain their original resolution." title="Management settings & pending actions"><div className={styles.actionTiles}>{actions.map(([key, icon, title, description]) => <button key={key} onClick={(event) => onOpen(key, event.currentTarget)} type="button"><span><DashboardIcon name={icon} /></span><span><strong>{title}</strong><small>{description}</small></span><b aria-hidden="true">›</b></button>)}</div></Panel>;
}

export function AdminOverviewClient({ data }: { data: AdminDashboardData }) {
  const [teamPreview, setTeamPreview] = useState<Team | null>(null);
  const [leaderPreview, setLeaderPreview] = useState<Leader | null>(null);
  const [action, setAction] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState("");
  const lastTrigger = useRef<HTMLElement | null>(null);
  const comparison = data.company.comparison;
  const healthStatuses: OverviewSourceStatus[] = [
    !data.dataHealth.latestImportStatus ? "unavailable" : data.dataHealth.invalidRowCount || data.dataHealth.unmappedRowCount ? "warning" : "healthy",
    data.dataHealth.outcomeStatus === "ready" ? "healthy" : data.dataHealth.outcomeStatus,
    data.dataHealth.reconciliation.callsMatch && data.dataHealth.reconciliation.loggedInSecondsMatch && data.dataHealth.failedDeliveryAttempts === 0 ? "healthy" : "warning",
    data.dataHealth.activeVersionCount > 0 && data.dataHealth.dialerStatus === "ACTIVE_IMPORT" ? "healthy" : "unavailable",
  ];
  const overall = overallDataHealthStatus(healthStatuses);
  const history = data.trends.months;
  const activeFlags = data.company.manualFlagsActive + data.company.transferFlagsActive + data.company.performanceFlagsActive;
  const closePreview = () => { setTeamPreview(null); setLeaderPreview(null); requestAnimationFrame(() => lastTrigger.current?.focus()); };
  const closeAction = () => { setAction(null); requestAnimationFrame(() => lastTrigger.current?.focus()); };
  const previewTeam = (team: Team, trigger: HTMLElement) => { lastTrigger.current = trigger; setTeamPreview(team); };
  const previewLeader = (leader: Leader, trigger: HTMLElement) => { lastTrigger.current = trigger; setLeaderPreview(leader); };
  const params = new URLSearchParams({ range: data.period.key });
  if (data.period.key === "custom" && data.period.from && data.period.to) { params.set("from", data.period.from); params.set("to", data.period.to); }
  const kpis = [
    { id: "overview-metric-transfers", label: "Transfers", current: metricValue(data.company.transfers), previous: comparison ? metricValue(comparison.transfers) : null, format: formatNumber, icon: "performance" as const, tone: "#1767f2", history: history.map((month) => month.transfers.value), source: data.company.transfers.status },
    { id: "overview-metric-closed-deals", label: "Closed Deals", current: metricValue(data.company.closedDeals), previous: comparison ? metricValue(comparison.closedDeals) : null, format: formatNumber, icon: "leaderboard" as const, tone: "#16a66a", history: history.map((month) => month.closedDeals.value), source: data.company.closedDeals.status },
    { id: "overview-metric-conversion", label: "Conversion", current: data.company.conversion, previous: comparison?.conversion ?? null, format: formatPercent, icon: "activity" as const, tone: "#f28705", history: history.map((month) => month.conversion), source: data.company.conversion === null ? "unavailable" : "ready" },
    { id: "overview-metric-commissions", label: "Total Commissions", current: data.company.totalCommissions, previous: null, format: formatMoney, icon: "commissions" as const, tone: "#ef355d", history: [], source: data.company.totalCommissions === null ? "unavailable" : "ready" },
    { id: "overview-metric-headcount", label: "Active Headcount", current: data.company.activeHeadcount, previous: null, format: formatNumber, icon: "users" as const, tone: "#8055e8", history: [], source: "ready" },
    { id: "overview-metric-deactivated", label: "Deactivated Employees", current: data.company.deactivatedHeadcount, previous: null, format: formatNumber, icon: "agent" as const, tone: "#8a52db", history: [], source: "ready" },
    { id: "overview-metric-qa", label: "QA Pending", current: data.company.qaPending, previous: null, format: formatNumber, icon: "search" as const, tone: "#f28705", history: [], source: "ready", attention: { count: data.company.qaPending, title: "QA pending", href: "/coaching" } },
    { id: "overview-metric-shadowing", label: "Shadowing Due", current: data.company.shadowingPending, previous: null, format: formatNumber, icon: "coaching" as const, tone: "#1767f2", history: [], source: "ready", attention: { count: data.company.shadowingPending, title: "Shadowing due", href: "/coaching" } },
  ];
  const insights = [
    ["Open Commissions", formatMoney(data.company.totalCommissions), "Current commission report", "commissions", "#16a66a"],
    ["Coaching Completion", formatPercent(data.company.coachingCompletion), data.company.coachingCompletion === null ? "No coaching denominator" : "Published or acknowledged reports", "coaching", "#8055e8"],
    ["QA Pending", formatNumber(data.company.qaPending), "Reports awaiting QA", "search", "#f28705"],
    ["Shadowing Completion", formatPercent(data.company.shadowingCompletion), data.company.shadowingCompletion === null ? "No shadowing denominator" : "Completed sessions", "users", "#1767f2"],
    ["Active Flags", formatNumber(activeFlags), "Manual and calculated flags", "flag", "#ef355d"],
  ] as const;
  return (
    <section className={`${styles.page} dashboard-page`}>
      <header className={styles.hero}>
        <div><h1>Company performance control center</h1><p>Company outcomes, team comparison, leader operations, talent signals, and source health.</p></div>
        <div className={styles.heroActions}><OverviewDateFilter range={data.period} showAgentsWithNoData={false} /><a className="ui-button ui-button--secondary" href={`/api/dashboard/export?${params.toString()}`}><DashboardIcon name="import" />Export Report</a><Link className="ui-button ui-button--primary" href="/performance"><DashboardIcon name="performance" />Detailed Performance</Link></div>
      </header>
      <div className={styles.kpiGrid}>{kpis.map((kpi) => <KpiCard {...kpi} comparisonLabel={data.company.comparisonLabel} key={kpi.id} sourceStatus={kpi.source} />)}</div>
      {overall !== "healthy" ? <div className={styles.warning} data-attention-count="1" data-attention-href="#overview-data-health" data-attention-title="Data source health"><DashboardIcon name="info" /><span><strong>Some outcome sources need attention</strong><small>Unavailable values remain visible and are never replaced with estimates.</small></span><button onClick={() => { const target = document.getElementById("overview-data-health"); target?.scrollIntoView({ behavior: "smooth", block: "center" }); target?.focus({ preventScroll: true }); }} type="button">View source health</button></div> : null}
      <div className={styles.analyticsGrid}><Panel className={styles.teamPanel} description={`Performance by team (${data.period.label})`} title="Team comparison"><TeamComparison onPreview={previewTeam} rows={data.teamComparison} /></Panel><Panel className={styles.trendsPanel} actions={<span className={styles.periodPill}>Last 6 months</span>} description="Outcome trends across real calendar months" title="Month-over-month trends"><MonthlyTrends months={data.trends.months} /></Panel><DataHealth data={data.dataHealth} overall={overall} /></div>
      <div className={styles.secondaryGrid}><TalentDistribution agents={data.talentDistributionAgents} /><LeaderTable leaders={data.leaderPerformance} onPreview={previewLeader} /></div>
      <ManagementActions onOpen={(key, trigger) => { lastTrigger.current = trigger; setAction(key); }} />
      <Panel className={styles.insights} description={`Authoritative operational context (${data.period.label})`} title="Operational insights"><div className={styles.insightGrid}>{insights.map(([label, value, detail, icon, color]) => <article data-attention-count={label === "Active Flags" ? activeFlags : undefined} data-attention-href={label === "Active Flags" ? "/flags" : undefined} data-attention-title={label === "Active Flags" ? "Active flags" : undefined} key={label}><span style={{ background: `${color}18`, color }}><DashboardIcon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</div></Panel>
      <PreviewDialog key={leaderPreview?.managerId ?? teamPreview?.teamId ?? "closed"} leader={leaderPreview} onClose={closePreview} team={teamPreview} />
      <ManagementDialog action={action} data={data} onClose={closeAction} onSuccess={(message) => { setToast(message); closeAction(); }} />
      {toast ? <div className={styles.toast} role="status"><span>{toast}</span><button aria-label="Dismiss success message" onClick={() => setToast("")} type="button">×</button></div> : null}
    </section>
  );
}
