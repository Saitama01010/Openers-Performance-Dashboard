"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";

import type { CommissionTier } from "@/commissions/domain";
import type { CommissionRow, CommissionSummary } from "@/commissions/report";
import type {
  CommissionAnalytics,
  CommissionSort,
  CommissionTablePage,
  CommissionTrendPoint,
} from "@/commissions/view-model";
import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import { DonutChart } from "@/components/ui/donut-chart";
import styles from "@/components/dashboard/commissions/commissions-page.module.css";

type SharedData = {
  role: "admin" | "manager" | "agent";
  month: { key: string; label: string; isCurrent: boolean };
  scopeLabel: string;
  stale: boolean;
  sourceFetchedAt: string | null;
  closedGeneratedAt: string | null;
  tiers: CommissionTier[];
  trend: CommissionTrendPoint[];
};

export type OrganizationCommissionData = SharedData & {
  role: "admin" | "manager";
  summary: CommissionSummary;
  previousSummary: CommissionSummary | null;
  analytics: CommissionAnalytics;
  teams: { id: string; name: string }[];
  selectedTeamId?: string;
  showTeamFilter: boolean;
  exportHref: string;
  table: CommissionTablePage;
};

export type AgentCommissionData = SharedData & {
  role: "agent";
  row: CommissionRow | null;
};

export type CommissionsPageData = OrganizationCommissionData | AgentCommissionData;

const TEAM_COLORS = ["#2563eb", "#10b981", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4", "#64748b"];
const REPORT_COLUMNS = [
  "American Name",
  "Email",
  "Team",
  "Closed Deals",
  "Current Tier",
  "EGP per Deal",
  "Commission",
  "Base Salary",
  "Total Compensation",
] as const;

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function egp(value: number) {
  return `${number(value)} EGP`;
}

function percent(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function sourceTime(value: string | null) {
  if (!value) return "Not reported by source";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

function comparison(current: number, previous: number | null) {
  if (previous === null) return null;
  const absolute = current - previous;
  const ratio = previous === 0 ? null : absolute / previous;
  return { absolute, ratio };
}

function MetricCard({
  title,
  value,
  support,
  icon,
  tone,
  month,
  employees,
  previous,
  numericValue,
  source,
  details,
}: {
  title: string;
  value: string;
  support: string;
  icon: DashboardIconName;
  tone: "blue" | "green" | "violet" | "orange" | "cyan";
  month: string;
  employees: number;
  previous: number | null;
  numericValue: number;
  source: string | null;
  details?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const change = comparison(numericValue, previous);
  const changeText = change
    ? `${change.absolute >= 0 ? "+" : ""}${number(change.absolute)}${change.ratio === null ? "" : ` (${change.ratio >= 0 ? "+" : ""}${percent(change.ratio)})`}`
    : null;
  return (
    <button
      aria-expanded={open}
      className={styles.metricCard}
      data-tone={tone}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !pinned) setOpen(false);
      }}
      onClick={() => {
        setPinned((value) => !value);
        setOpen((value) => !value);
      }}
      onFocus={() => setOpen(true)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => {
        if (!pinned) setOpen(false);
      }}
      type="button"
    >
      <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
      <span className={styles.metricCopy}><span>{title}</span><strong>{value}</strong><small>{support}</small></span>
      {open ? (
        <span className={styles.metricTooltip} role="tooltip">
          <strong>{title}</strong>
          <span><b>Commission month</b>{month}</span>
          <span><b>Current value</b>{value}</span>
          <span><b>Employees included</b>{number(employees)}</span>
          {changeText ? <span><b>Previous-month change</b>{changeText}</span> : null}
          <span><b>Latest source refresh</b>{sourceTime(source)}</span>
          {details ? <em>{details}</em> : null}
        </span>
      ) : null}
    </button>
  );
}

function StatusNotice({ data }: { data: SharedData }) {
  return (
    <div className={styles.noticeStack}>
      {data.stale ? (
        <div className={styles.statusNotice} data-tone="warning" role="status">
          <DashboardIcon name="info" />
          <span><strong>Closed source refresh is stale.</strong> Values use the last successful load, and export remains disabled until recovery.</span>
        </div>
      ) : null}
      {data.month.isCurrent ? (
        <div className={styles.statusNotice} data-tone="info" role="status">
          <DashboardIcon name="info" />
          <span><strong>{data.month.label} is still in progress.</strong> Values are estimated through the latest successful source refresh.</span>
        </div>
      ) : null}
    </div>
  );
}

function PageHeader({ data, exportHref }: { data: SharedData; exportHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <header className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>Compensation</span>
        <h1>Commissions</h1>
        <p>{data.role === "agent"
          ? "Track your personal monthly closed deals, commission tier, and total compensation."
          : "Monthly compensation from valid matched Closed worksheet deals. Higher tiers apply retroactively to the full month."}</p>
        <span className={styles.scope}><strong>Scope:</strong> {data.scopeLabel}</span>
      </div>
      <div className={styles.headerActions}>
        <label className={styles.monthControl}>
          <span>Commission month</span>
          <input
            aria-label="Commission month"
            disabled={pending}
            name="commissionMonth"
            onChange={(event) => {
              if (!event.target.value) return;
              const params = new URLSearchParams(searchParams.toString());
              params.set("commissionMonth", event.target.value);
              params.delete("page");
              startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
            }}
            type="month"
            value={data.month.key}
          />
        </label>
        {exportHref ? (
          data.stale
            ? <button className={styles.primaryButton} disabled title="Export is unavailable until the Closed source refreshes successfully." type="button"><DashboardIcon name="commissions" />Export Commissions</button>
            : <Link className={styles.primaryButton} href={exportHref}><DashboardIcon name="commissions" />Export Commissions</Link>
        ) : null}
      </div>
    </header>
  );
}

function DashboardTrend({ points }: { points: CommissionTrendPoint[] }) {
  const [index, setIndex] = useState(Math.max(0, points.length - 1));
  const [pinned, setPinned] = useState(false);
  const [activeSeries, setActiveSeries] = useState<"commission" | "totalCompensation" | null>(null);
  const [visible, setVisible] = useState({ commission: true, totalCompensation: true });
  const chartRef = useRef<HTMLDivElement>(null);
  const width = 640;
  const height = 220;
  const plot = { left: 42, right: 18, top: 18, bottom: 32 };
  const series = [
    { key: "commission" as const, label: "Commission", color: "#2563eb" },
    { key: "totalCompensation" as const, label: "Total compensation", color: "#10b981" },
  ];
  const values = points.flatMap((point) => series.filter((item) => visible[item.key]).map((item) => point[item.key]));
  const maximum = Math.max(1, ...values);
  const x = (value: number) => plot.left + (points.length <= 1 ? (width - plot.left - plot.right) / 2 : value * (width - plot.left - plot.right) / (points.length - 1));
  const y = (value: number) => plot.top + (1 - value / maximum) * (height - plot.top - plot.bottom);
  const path = (key: "commission" | "totalCompensation") => points.map((point, pointIndex) => `${x(pointIndex)},${y(point[key])}`).join(" ");
  const active = points[index];
  const move = (clientX: number, element: SVGSVGElement) => {
    if (pinned || points.length === 0) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setIndex(Math.round(ratio * (points.length - 1)));
  };
  const toggle = (key: "commission" | "totalCompensation") => {
    if (visible[key] && Object.values(visible).filter(Boolean).length === 1) return;
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };
  useEffect(() => {
    if (!pinned) return;
    const close = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [pinned]);
  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="commission-trend-title">
      <header className={styles.panelHeader}>
        <div><h2 id="commission-trend-title">Commission trend (EGP)</h2><p>Authoritative monthly values for the current authorized scope.</p></div>
        <div className={styles.legend} aria-label="Chart series">
          {series.map((item) => <button aria-pressed={visible[item.key]} data-active={activeSeries === item.key || undefined} key={item.key} onClick={() => toggle(item.key)} onFocus={() => setActiveSeries(item.key)} onPointerEnter={() => setActiveSeries(item.key)} onPointerLeave={() => setActiveSeries(null)} type="button"><i style={{ background: item.color }} />{item.label}</button>)}
          {!visible.commission || !visible.totalCompensation ? <button className={styles.resetSeries} onClick={() => setVisible({ commission: true, totalCompensation: true })} type="button">Reset</button> : null}
        </div>
      </header>
      {points.length === 0 ? <EmptyState title="No commission history is available" detail="This is the first authoritative commission period in scope." /> : (
        <div className={styles.chartArea} ref={chartRef}>
          <svg
            aria-label="Monthly commission and total compensation trend. Use left and right arrow keys to inspect months."
            className={styles.lineChart}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
              if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(points.length - 1, value + 1)); }
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned((value) => !value); }
              if (event.key === "Escape") setPinned(false);
            }}
            onPointerDown={() => setPinned(true)}
            onPointerMove={(event) => move(event.clientX, event.currentTarget)}
            role="img"
            tabIndex={0}
            viewBox={`0 0 ${width} ${height}`}
          >
            {[0, .25, .5, .75, 1].map((portion) => <line className={styles.gridLine} key={portion} x1={plot.left} x2={width - plot.right} y1={plot.top + portion * (height - plot.top - plot.bottom)} y2={plot.top + portion * (height - plot.top - plot.bottom)} />)}
            {series.map((item) => visible[item.key] ? <polyline className={styles.seriesLine} data-dimmed={activeSeries && activeSeries !== item.key ? "true" : undefined} fill="none" key={item.key} points={path(item.key)} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSeries === item.key ? 3.4 : 2.4} /> : null)}
            {active ? <line className={styles.crosshair} x1={x(index)} x2={x(index)} y1={plot.top} y2={height - plot.bottom} /> : null}
            {active ? series.map((item) => visible[item.key] ? <circle cx={x(index)} cy={y(active[item.key])} fill="#fff" key={item.key} r={activeSeries === item.key ? 5 : 4} stroke={item.color} strokeWidth="2.5" /> : null) : null}
            {points.map((point, pointIndex) => <text className={styles.axisLabel} key={point.key} textAnchor="middle" x={x(pointIndex)} y={height - 10}>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${point.key}-15T00:00:00Z`))}</text>)}
          </svg>
          {active ? <div aria-live="polite" className={styles.chartTooltip} style={{ "--tooltip-x": `${points.length <= 1 ? 50 : index / (points.length - 1) * 100}%` } as CSSProperties}><strong>{active.label}{active.estimated ? " (Estimated)" : ""}</strong><span><i style={{ background: "#2563eb" }} />Commission<b>{egp(active.commission)}</b></span><span><i style={{ background: "#10b981" }} />Base salaries<b>{egp(active.baseSalaries)}</b></span><span><i style={{ background: "#10b981" }} />Total compensation<b>{egp(active.totalCompensation)}</b></span><span>Closed deals<b>{number(active.closedDeals)}</b></span><span>Employees<b>{number(active.employees)}</b></span></div> : null}
        </div>
      )}
      <div className={styles.srOnly}><table><caption>Accessible commission trend data</caption><thead><tr><th>Month</th><th>Commission</th><th>Base salaries</th><th>Total compensation</th><th>Closed deals</th><th>Employees</th><th>Status</th></tr></thead><tbody>{points.map((point) => <tr key={point.key}><th>{point.label}</th><td>{egp(point.commission)}</td><td>{egp(point.baseSalaries)}</td><td>{egp(point.totalCompensation)}</td><td>{point.closedDeals}</td><td>{point.employees}</td><td>{point.estimated ? "Estimated" : "Final"}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function TeamDistribution({ data }: { data: OrganizationCommissionData }) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.summary.totalCommission;
  const segments = data.analytics.byTeam.map((team, index) => ({
    team,
    color: TEAM_COLORS[index % TEAM_COLORS.length] ?? "#718096",
  }));
  const selected = data.analytics.byTeam.find((team) => team.id === active) ?? null;
  return (
    <section className={styles.panel} aria-labelledby="commission-team-title">
      <header className={styles.panelHeader}><div><h2 id="commission-team-title">Commission by team</h2><p>Contribution to total commission in authorized scope.</p></div></header>
      {total <= 0 || data.analytics.byTeam.length === 0 ? <EmptyState title="No team commission distribution" detail="The authorized scope has zero commission for this month." /> : data.analytics.byTeam.length === 1 ? (
        <div className={styles.singleTeam}><span><DashboardIcon name="teams" /></span><div><strong>{data.analytics.byTeam[0]?.name}</strong><p>{number(data.analytics.byTeam[0]?.employees ?? 0)} employees · {number(data.analytics.byTeam[0]?.closedDeals ?? 0)} closed deals</p></div><b>{egp(data.analytics.byTeam[0]?.commission ?? 0)}</b></div>
      ) : (
        <div className={styles.donutLayout}>
          <div className={styles.donutWrap}>
            <DonutChart activeSegmentId={active} ariaLabel="Team commission distribution. Use Tab to inspect teams." centerClassName={styles.donutCenter} centerContent={<><strong>{selected ? percent(selected.share) : egp(total)}</strong><span>{selected ? selected.name : "Total commission"}</span></>} className={styles.donut} data={segments.map(({ team, color }) => ({ id: team.id, value: team.commission, color, label: team.name, accessibleLabel: `${team.name}: ${egp(team.commission)}, ${percent(team.share)}` }))} interactiveSegments onSegmentHover={(segment) => setActive(segment?.id ?? null)} onSegmentSelect={(segment) => setActive(active === segment.id ? null : segment.id)} size={190} strokeWidth={31} totalValue={total} />
          </div>
          <ul className={styles.distributionList}>{segments.map(({ team, color }) => <li key={team.id}><button aria-pressed={active === team.id} onBlur={() => setActive(null)} onClick={() => setActive(active === team.id ? null : team.id)} onFocus={() => setActive(team.id)} onPointerEnter={() => setActive(team.id)} onPointerLeave={() => setActive(null)} type="button"><i style={{ background: color }} /><span>{team.name}<small>{team.employees} employees · {team.closedDeals} deals</small></span><strong>{egp(team.commission)}<small>{percent(team.share)}</small></strong><em role="tooltip"><b>{team.name}</b><span>Employees {team.employees}</span><span>Closed deals {team.closedDeals}</span><span>Commission {egp(team.commission)}</span><span>Total compensation {egp(team.totalCompensation)}</span></em></button></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function TierDistribution({ data }: { data: OrganizationCommissionData }) {
  const maximum = Math.max(0, ...data.analytics.byTier.map((tier) => tier.employees));
  return (
    <section className={styles.panel} aria-labelledby="commission-tier-distribution-title">
      <header className={styles.panelHeader}><div><h2 id="commission-tier-distribution-title">Employees by commission tier</h2><p>Authorized employees by configured monthly tier.</p></div></header>
      {maximum === 0 ? <EmptyState title="No tier distribution is available" detail="No employees are in the authorized commission scope." /> : (
        <div className={styles.tierBars}>{data.analytics.byTier.map((tier) => <button key={tier.label} type="button"><span className={styles.barPlot}><i style={{ height: `${Math.max(4, tier.employees / maximum * 100)}%` }} /></span><strong>{tier.employees}</strong><span>{tier.label}</span><small>{egp(tier.ratePerDeal)} / deal</small><em role="tooltip"><b>{tier.label} deals</b><span>Rate {egp(tier.ratePerDeal)} per deal</span><span>Employees {tier.employees} ({percent(tier.employeeShare)})</span><span>Closed deals {tier.closedDeals}</span><span>Commission {egp(tier.commission)}</span></em></button>)}</div>
      )}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.emptyState}><span><DashboardIcon name="info" /></span><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

function sortLabel(sort: CommissionSort) {
  return sort === "closedDeals" ? "Closed Deals" : sort === "tier" ? "Current Tier" : sort === "commission" ? "Commission" : sort === "baseSalary" ? "Base Salary" : sort === "totalCompensation" ? "Total Compensation" : "Real Name";
}

function RowPreview({ row, onClose }: { row: CommissionRow; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className={styles.previewBackdrop} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="commission-preview-title" aria-modal="true" className={styles.preview} role="dialog"><header><div><span>Commission record</span><h2 id="commission-preview-title">{row.realName}</h2><p>{row.team?.name ?? "Unassigned"}</p></div><button aria-label="Close commission preview" onClick={onClose} ref={closeRef} type="button"><DashboardIcon name="close" /></button></header><dl><div><dt>Closed deals</dt><dd>{row.closedDeals}</dd></div><div><dt>Current tier</dt><dd>{row.tierLabel}</dd></div><div><dt>EGP per deal</dt><dd>{egp(row.ratePerDeal)}</dd></div><div><dt>Commission</dt><dd>{egp(row.commissionAmount)}</dd></div><div><dt>Base salary</dt><dd>{egp(row.baseSalary)}</dd></div><div><dt>Total compensation</dt><dd>{egp(row.totalCompensation)}</dd></div><div><dt>Next tier</dt><dd>{row.dealsUntilNextTier === null ? "Uncapped" : `${row.dealsUntilNextTier} deal${row.dealsUntilNextTier === 1 ? "" : "s"}`}</dd></div></dl><Link className={styles.primaryButton} href={`/agents/${encodeURIComponent(row.id)}`}>Open agent performance<DashboardIcon name="arrowRight" /></Link></section></div>;
}

function CommissionReport({ data, updateParams, pending }: { data: OrganizationCommissionData; updateParams: (changes: Record<string, string | null>) => void; pending: boolean }) {
  const [query, setQuery] = useState(data.table.query);
  const [columns, setColumns] = useState<Record<(typeof REPORT_COLUMNS)[number], boolean>>(() => Object.fromEntries(REPORT_COLUMNS.map((column) => [column, true])) as Record<(typeof REPORT_COLUMNS)[number], boolean>);
  const [selected, setSelected] = useState<CommissionRow | null>(null);
  const sort = (value: CommissionSort) => updateParams({ sort: value, direction: data.table.sort === value && data.table.direction === "asc" ? "desc" : "asc", page: "1" });
  const sortable = (label: string, value: CommissionSort) => <button aria-label={`Sort by ${label}`} aria-pressed={data.table.sort === value} onClick={() => sort(value)} type="button">{label}<span aria-hidden="true">{data.table.sort === value ? data.table.direction === "asc" ? " ↑" : " ↓" : " ↕"}</span></button>;
  const visible = (column: (typeof REPORT_COLUMNS)[number]) => columns[column];
  return (
    <section className={`${styles.panel} ${styles.reportPanel}`} aria-labelledby="commission-report-title">
      <header className={styles.reportHeader}><div><h2 id="commission-report-title">{data.month.label} commission report</h2><p>One row per employee inside your authorized scope.</p></div><div className={styles.reportActions}><details><summary><DashboardIcon name="dashboard" />Columns</summary><div className={styles.columnMenu}>{REPORT_COLUMNS.map((column) => <label key={column}><input checked={columns[column]} onChange={(event) => setColumns((current) => ({ ...current, [column]: event.target.checked }))} type="checkbox" />{column}</label>)}</div></details></div></header>
      <div className={styles.tableToolbar}>
        <form onSubmit={(event) => { event.preventDefault(); updateParams({ query, page: "1" }); }}><label><DashboardIcon name="search" /><span className={styles.srOnly}>Search employees</span><input aria-label="Search commission employees" onChange={(event) => setQuery(event.target.value)} placeholder="Search employees…" value={query} /></label><button disabled={pending} type="submit">Search</button>{data.table.query ? <button onClick={() => { setQuery(""); updateParams({ query: null, page: "1" }); }} type="button">Clear</button> : null}</form>
        <label>Sort by<select aria-label="Sort commission report" onChange={(event) => sort(event.target.value as CommissionSort)} value={data.table.sort}>{(["name", "closedDeals", "tier", "commission", "baseSalary", "totalCompensation"] as CommissionSort[]).map((item) => <option key={item} value={item}>{sortLabel(item)}</option>)}</select></label>
      </div>
      <div className={styles.tableScroll} role="region" aria-label="Commission results" tabIndex={0}>
        <table><caption>Role-scoped monthly commissions</caption><thead><tr><th scope="col">{sortable("Real Name", "name")}</th>{visible("American Name") ? <th scope="col">American Name</th> : null}{visible("Email") ? <th scope="col">Email</th> : null}{visible("Team") ? <th scope="col">Team</th> : null}{visible("Closed Deals") ? <th className={styles.numeric} scope="col">{sortable("Closed Deals", "closedDeals")}</th> : null}{visible("Current Tier") ? <th scope="col">{sortable("Current Tier", "tier")}</th> : null}{visible("EGP per Deal") ? <th className={styles.numeric} scope="col">EGP per Deal</th> : null}{visible("Commission") ? <th className={styles.numeric} scope="col">{sortable("Commission", "commission")}</th> : null}{visible("Base Salary") ? <th className={styles.numeric} scope="col">{sortable("Base Salary", "baseSalary")}</th> : null}{visible("Total Compensation") ? <th className={styles.numeric} scope="col">{sortable("Total Compensation", "totalCompensation")}</th> : null}<th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{data.table.rows.length === 0 ? <tr><td colSpan={REPORT_COLUMNS.filter((column) => columns[column]).length + 2}><EmptyState title="No employees match these controls" detail="Adjust the search or authorized team selection." /></td></tr> : data.table.rows.map((row) => <tr key={row.id} tabIndex={0}><th scope="row"><strong>{row.realName}</strong><small>{row.active ? "Active" : "Inactive · final closed-deal month"}</small></th>{visible("American Name") ? <td>{row.americanName || "Not provided"}</td> : null}{visible("Email") ? <td>{row.email || "Not provided"}</td> : null}{visible("Team") ? <td><span className={styles.teamBadge}>{row.team?.name || "Unassigned"}</span></td> : null}{visible("Closed Deals") ? <td className={styles.numeric}><strong>{row.closedDeals}</strong></td> : null}{visible("Current Tier") ? <td><span className={styles.tierBadge}>{row.tierLabel}</span></td> : null}{visible("EGP per Deal") ? <td className={styles.numeric}>{egp(row.ratePerDeal)}</td> : null}{visible("Commission") ? <td className={styles.numeric}><strong>{egp(row.commissionAmount)}</strong></td> : null}{visible("Base Salary") ? <td className={styles.numeric}>{egp(row.baseSalary)}</td> : null}{visible("Total Compensation") ? <td className={styles.numeric}><strong>{egp(row.totalCompensation)}</strong></td> : null}<td><button aria-label={`Preview ${row.realName} commission`} className={styles.rowAction} onClick={() => setSelected(row)} type="button"><DashboardIcon name="arrowRight" /></button></td></tr>)}</tbody></table>
      </div>
      <footer className={styles.tableFooter}><label>Rows per page<select onChange={(event) => updateParams({ pageSize: event.target.value, page: "1" })} value={data.table.pageSize}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><span>Showing {data.table.totalRows === 0 ? 0 : (data.table.page - 1) * data.table.pageSize + 1}–{Math.min(data.table.page * data.table.pageSize, data.table.totalRows)} of {data.table.totalRows} employees</span><nav aria-label="Commission report pages"><button aria-label="Previous page" disabled={data.table.page <= 1 || pending} onClick={() => updateParams({ page: String(data.table.page - 1) })} type="button">‹</button>{Array.from({ length: Math.min(5, data.table.totalPages) }, (_, index) => Math.min(Math.max(1, data.table.page - 2), Math.max(1, data.table.totalPages - 4)) + index).map((page) => <button aria-current={page === data.table.page ? "page" : undefined} key={page} onClick={() => updateParams({ page: String(page) })} type="button">{page}</button>)}<button aria-label="Next page" disabled={data.table.page >= data.table.totalPages || pending} onClick={() => updateParams({ page: String(data.table.page + 1) })} type="button">›</button></nav></footer>
      {selected ? <RowPreview onClose={() => setSelected(null)} row={selected} /> : null}
    </section>
  );
}

function OrganizationDashboard({ data }: { data: OrganizationCommissionData }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const updateParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };
  const metricCards = [
    { title: "Total employees", value: number(data.summary.totalEmployees), numeric: data.summary.totalEmployees, previous: data.previousSummary?.totalEmployees ?? null, icon: "users" as const, tone: "blue" as const, support: "Included in this report" },
    { title: "Total closed deals", value: number(data.summary.totalClosedDeals), numeric: data.summary.totalClosedDeals, previous: data.previousSummary?.totalClosedDeals ?? null, icon: "calls" as const, tone: "green" as const, support: "Valid matched Closed deals" },
    { title: "Total commission", value: egp(data.summary.totalCommission), numeric: data.summary.totalCommission, previous: data.previousSummary?.totalCommission ?? null, icon: "commissions" as const, tone: "violet" as const, support: "Retroactive tier earnings" },
    { title: "Total base salaries", value: egp(data.summary.totalBaseSalaries), numeric: data.summary.totalBaseSalaries, previous: data.previousSummary?.totalBaseSalaries ?? null, icon: "teams" as const, tone: "orange" as const, support: "Authoritative monthly base" },
    { title: "Total compensation", value: egp(data.summary.totalCompensation), numeric: data.summary.totalCompensation, previous: data.previousSummary?.totalCompensation ?? null, icon: "performance" as const, tone: "cyan" as const, support: "Base salary plus commission" },
  ];
  return <>
    <PageHeader data={data} exportHref={data.exportHref} />
    <StatusNotice data={data} />
    {data.showTeamFilter ? <div className={styles.scopeToolbar}><label>Team<select aria-label="Filter commission dashboard by team" disabled={pending} onChange={(event) => updateParams({ team: event.target.value || null, page: "1" })} value={data.selectedTeamId ?? ""}><option value="">All authorized teams</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{data.selectedTeamId ? <button onClick={() => updateParams({ team: null, page: "1" })} type="button">Clear team filter</button> : null}</div> : null}
    <div className={styles.metricGrid}>{metricCards.map((card) => <MetricCard details={card.title === "Total commission" ? "Higher achieved tiers apply to every valid deal in the selected month." : undefined} employees={data.summary.totalEmployees} icon={card.icon} key={card.title} month={data.month.label} numericValue={card.numeric} previous={card.previous} source={data.closedGeneratedAt ?? data.sourceFetchedAt} support={card.support} title={card.title} tone={card.tone} value={card.value} />)}</div>
    <div className={styles.analyticsGrid}><DashboardTrend points={data.trend} /><TeamDistribution data={data} /><TierDistribution data={data} /></div>
    <CommissionReport data={data} pending={pending} updateParams={updateParams} />
  </>;
}

function PersonalProgress({ row }: { row: CommissionRow }) {
  const [open, setOpen] = useState(false);
  const hasNext = row.nextTierMinimum !== null && row.nextTierRate !== null && row.dealsUntilNextTier !== null;
  const span = hasNext ? Math.max(1, row.nextTierMinimum! - row.tierMinimum) : 1;
  const progress = hasNext ? Math.min(1, Math.max(0, (row.closedDeals - row.tierMinimum) / span)) : 1;
  return <section className={`${styles.panel} ${styles.progressPanel}`} aria-labelledby="personal-progress-title"><header className={styles.panelHeader}><div><h2 id="personal-progress-title">My commission progress</h2><p>Every valid Closed deal moves this month toward the next configured tier.</p></div><span className={styles.currentTierBadge}>Current tier · {row.tierLabel}</span></header><button aria-expanded={open} className={styles.progressInteractive} onBlur={() => setOpen(false)} onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)} type="button"><div className={styles.progressLabels}><span><small>Current tier</small><strong>{row.tierLabel} deals</strong><b>{egp(row.ratePerDeal)} / deal</b></span><span><small>{hasNext ? "Next tier" : "Top tier"}</small><strong>{hasNext ? `${row.nextTierMinimum}+ deals` : "Uncapped"}</strong><b>{hasNext ? `${egp(row.nextTierRate!)} / deal` : `${egp(row.ratePerDeal)} continues`}</b></span></div><div className={styles.progressTrack}><i style={{ width: `${progress * 100}%` }} /><span style={{ left: `${progress * 100}%` }}>{row.closedDeals}</span></div><p>{hasNext ? `${row.dealsUntilNextTier} more closed deal${row.dealsUntilNextTier === 1 ? "" : "s"} to reach the next tier` : "You are in the uncapped tier; the configured rate continues for every additional valid deal."}</p>{open ? <em className={styles.progressTooltip} role="tooltip"><b>Current closed deals {row.closedDeals}</b><span>Current tier {row.tierLabel}</span><span>Current rate {egp(row.ratePerDeal)} / deal</span><span>Current commission {egp(row.commissionAmount)}</span>{hasNext ? <><span>Next tier {row.nextTierMinimum}+</span><span>Next rate {egp(row.nextTierRate!)} / deal</span><span>Deals remaining {row.dealsUntilNextTier}</span></> : <span>Next tier Uncapped</span>}</em> : null}</button></section>;
}

function PersonalTrend({ points }: { points: CommissionTrendPoint[] }) {
  const [metric, setMetric] = useState<"commission" | "closedDeals" | "totalCompensation">("commission");
  const [index, setIndex] = useState(Math.max(0, points.length - 1));
  const [pinned, setPinned] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const width = 720;
  const height = 230;
  const values = points.map((point) => point[metric]);
  const maximum = Math.max(1, ...values);
  const x = (value: number) => 44 + (points.length <= 1 ? 320 : value * 650 / (points.length - 1));
  const y = (value: number) => 18 + (1 - value / maximum) * 170;
  const active = points[index];
  useEffect(() => {
    if (!pinned) return;
    const close = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [pinned]);
  return <section className={`${styles.panel} ${styles.personalTrend}`} aria-labelledby="personal-trend-title"><header className={styles.panelHeader}><div><h2 id="personal-trend-title">My commission trend</h2><p>Your personal monthly earnings history only.</p></div><div className={styles.metricSwitch} role="group" aria-label="Personal trend metric">{(["commission", "closedDeals", "totalCompensation"] as const).map((item) => <button aria-pressed={metric === item} key={item} onClick={() => setMetric(item)} type="button">{item === "closedDeals" ? "Closed Deals" : item === "totalCompensation" ? "Total Compensation" : "Commission"}</button>)}</div></header>{points.length === 0 ? <EmptyState title="No personal history is available" detail="This is your first authoritative commission period." /> : <div className={styles.chartArea} ref={chartRef}><svg aria-label="Personal monthly commission trend. Use left and right arrow keys to inspect months." className={styles.lineChart} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(points.length - 1, value + 1)); } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned((value) => !value); } if (event.key === "Escape") setPinned(false); }} onPointerDown={() => setPinned(true)} onPointerMove={(event) => { if (pinned) return; const rect = event.currentTarget.getBoundingClientRect(); setIndex(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (points.length - 1))); }} role="img" tabIndex={0} viewBox={`0 0 ${width} ${height}`}>{[0, .25, .5, .75, 1].map((portion) => <line className={styles.gridLine} key={portion} x1="44" x2="694" y1={18 + portion * 170} y2={18 + portion * 170} />)}<polyline className={styles.seriesLine} fill="none" points={points.map((point, pointIndex) => `${x(pointIndex)},${y(point[metric])}`).join(" ")} stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.7" />{active ? <><line className={styles.crosshair} x1={x(index)} x2={x(index)} y1="18" y2="188" /><circle cx={x(index)} cy={y(active[metric])} fill="#fff" r="5" stroke="#2563eb" strokeWidth="2.5" /></> : null}{points.map((point, pointIndex) => <text className={styles.axisLabel} key={point.key} textAnchor="middle" x={x(pointIndex)} y="216">{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${point.key}-15T00:00:00Z`))}</text>)}</svg>{active ? <div aria-live="polite" className={styles.personalChartTooltip}><strong>{active.label}{active.estimated ? " · Estimated" : " · Final"}</strong><span>Closed Deals<b>{active.closedDeals}</b></span><span>Tier<b>{active.tierLabel ?? "N/A"}</b></span><span>Rate<b>{active.ratePerDeal === null ? "N/A" : `${egp(active.ratePerDeal)} / deal`}</b></span><span>Commission<b>{egp(active.commission)}</b></span><span>Base Salary<b>{egp(active.baseSalaries)}</b></span><span>Total Compensation<b>{egp(active.totalCompensation)}</b></span></div> : null}</div>}<div className={styles.srOnly}><table><caption>Accessible personal commission trend data</caption><thead><tr><th>Month</th><th>Closed deals</th><th>Tier</th><th>Rate</th><th>Commission</th><th>Base salary</th><th>Total compensation</th></tr></thead><tbody>{points.map((point) => <tr key={point.key}><th>{point.label}</th><td>{point.closedDeals}</td><td>{point.tierLabel}</td><td>{point.ratePerDeal}</td><td>{point.commission}</td><td>{point.baseSalaries}</td><td>{point.totalCompensation}</td></tr>)}</tbody></table></div></section>;
}

function TierReference({ tiers, row }: { tiers: CommissionTier[]; row: CommissionRow }) {
  return <section className={styles.panel} aria-labelledby="tier-reference-title"><header className={styles.panelHeader}><div><h2 id="tier-reference-title">Commission tiers</h2><p>Reaching a higher tier applies that rate to all valid closed deals in this commission month.</p></div></header><div className={styles.tierReference}>{tiers.map((tier) => { const active = tier.label === row.tierLabel; const distance = row.closedDeals < tier.minimum ? `${tier.minimum - row.closedDeals} deals away` : row.closedDeals > (tier.maximum ?? Number.MAX_SAFE_INTEGER) ? "Tier completed" : "Current range"; return <button aria-current={active ? "true" : undefined} key={tier.label} type="button"><span>{tier.label} deals</span><strong>{egp(tier.ratePerDeal)} / deal</strong>{active ? <b>Your current tier</b> : <small>{distance}</small>}<em role="tooltip"><b>{tier.label} deals</b><span>{egp(tier.ratePerDeal)} per deal</span><span>{distance}</span><span>The achieved tier rate applies retroactively to all valid deals in this month.</span></em></button>; })}</div></section>;
}

function AgentDashboard({ data }: { data: AgentCommissionData }) {
  const row = data.row;
  const previous = data.trend.length > 1 ? data.trend[data.trend.length - 2] : null;
  if (!row) return <><PageHeader data={data} /><StatusNotice data={data} /><section className={styles.panel}><EmptyState title="No commission record is available" detail="No authorized personal commission row exists for the selected month." /></section></>;
  const cards = [
    { title: "My Closed Deals", value: number(row.closedDeals), numeric: row.closedDeals, previous: previous?.closedDeals ?? null, support: "Valid closed deals this month", icon: "calls" as const, tone: "blue" as const },
    { title: "Current Tier", value: row.tierLabel, numeric: row.tierMinimum, previous: null, support: `${egp(row.ratePerDeal)} per deal`, icon: "performance" as const, tone: "green" as const },
    { title: "Commission Earned", value: egp(row.commissionAmount), numeric: row.commissionAmount, previous: previous?.commission ?? null, support: "Excludes base salary", icon: "commissions" as const, tone: "violet" as const },
    { title: "Base Salary", value: egp(row.baseSalary), numeric: row.baseSalary, previous: previous?.baseSalaries ?? null, support: "Monthly base", icon: "teams" as const, tone: "orange" as const },
    { title: "Total Compensation", value: egp(row.totalCompensation), numeric: row.totalCompensation, previous: previous?.totalCompensation ?? null, support: "Base plus commission", icon: "performance" as const, tone: "cyan" as const },
    { title: "Next Tier", value: row.dealsUntilNextTier === null ? "Uncapped" : `${row.dealsUntilNextTier} deal${row.dealsUntilNextTier === 1 ? "" : "s"}`, numeric: row.dealsUntilNextTier ?? row.closedDeals, previous: null, support: row.nextTierRate === null ? `${egp(row.ratePerDeal)} continues per deal` : `to ${egp(row.nextTierRate)} / deal`, icon: "arrowRight" as const, tone: "blue" as const },
  ];
  return <><PageHeader data={data} /><StatusNotice data={data} /><div className={`${styles.metricGrid} ${styles.personalMetricGrid}`}>{cards.map((card) => <MetricCard details={card.title === "Current Tier" || card.title === "Next Tier" ? "Reaching the next tier applies that tier's rate to all valid closed deals in this commission month." : undefined} employees={1} icon={card.icon} key={card.title} month={data.month.label} numericValue={card.numeric} previous={card.previous} source={data.closedGeneratedAt ?? data.sourceFetchedAt} support={card.support} title={card.title} tone={card.tone} value={card.value} />)}</div><PersonalProgress row={row} /><PersonalTrend points={data.trend} /><TierReference row={row} tiers={data.tiers} /></>;
}

export function CommissionsPageClient({ data }: { data: CommissionsPageData }) {
  return <section aria-label="Commissions workspace" className={styles.page}>{data.role === "agent" ? <AgentDashboard data={data} /> : <OrganizationDashboard data={data} />}</section>;
}
