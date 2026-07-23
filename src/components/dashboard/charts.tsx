import Link from "next/link";

import { EmptyState } from "@/components/dashboard/dashboard-primitives";
import { Icon } from "@/components/dashboard/icon";
import type {
  DashboardTotals,
  DashboardTrendPoint,
  HourlyActivityPoint,
  TeamComparisonRow,
} from "@/dashboard/data";
import { toPercentage } from "@/dashboard/format";

function ChartHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="border-b border-white/[0.055] px-5 py-4 sm:px-6">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
    </div>
  );
}

export function DailyTrendChart({
  canImport,
  points,
}: {
  canImport: boolean;
  points: DashboardTrendPoint[];
}) {
  if (points.length === 0) {
    return (
      <article className="dashboard-card min-w-0 overflow-hidden">
        <ChartHeader
          description="Calls and logged-in hours across the selected window."
          title="Daily performance trend"
        />
        <EmptyState
          action={
            canImport ? (
              <Link
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan hover:text-white"
                href="/import"
              >
                Import performance data
                <Icon className="size-3.5" name="arrow-up-right" />
              </Link>
            ) : undefined
          }
          description="Once dialer activity exists in this reporting window, daily calls and logged-in hours will appear here."
          title="No daily activity yet"
        />
      </article>
    );
  }

  const width = 720;
  const height = 260;
  const left = 32;
  const right = 18;
  const top = 24;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxCalls = Math.max(...points.map((point) => point.calls), 1);
  const maxHours = Math.max(...points.map((point) => point.loginHours), 1);
  const xFor = (index: number) =>
    points.length === 1
      ? left + plotWidth / 2
      : left + (index / (points.length - 1)) * plotWidth;
  const callsY = (value: number) =>
    top + plotHeight - (value / maxCalls) * plotHeight;
  const hoursY = (value: number) =>
    top + plotHeight - (value / maxHours) * plotHeight;
  const callsPath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(index)} ${callsY(point.calls)}`,
    )
    .join(" ");
  const hoursPath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(index)} ${hoursY(point.loginHours)}`,
    )
    .join(" ");
  const areaPath = `${callsPath} L ${xFor(points.length - 1)} ${
    top + plotHeight
  } L ${xFor(0)} ${top + plotHeight} Z`;

  return (
    <article className="dashboard-card min-w-0 overflow-hidden">
      <ChartHeader
        description="Calls and logged-in hours across the selected window."
        title="Daily performance trend"
      />
      <div className="px-3 pt-3 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-4 px-2 pb-1 text-[10px] font-medium text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-primary" />
            Calls
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-teal" />
            Logged-in hours
          </span>
          <span className="ml-auto">Independent scales</span>
        </div>
        <svg
          aria-label="Daily calls and logged-in hours trend"
          className="h-auto w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id="calls-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#168BFF" stopOpacity=".28" />
              <stop offset="1" stopColor="#168BFF" stopOpacity="0" />
            </linearGradient>
            <filter id="line-glow">
              <feGaussianBlur result="blur" stdDeviation="3" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = top + plotHeight * tick;
            return (
              <line
                key={tick}
                stroke="#203247"
                strokeDasharray="3 6"
                strokeWidth="1"
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
            );
          })}
          <path d={areaPath} fill="url(#calls-area)" />
          <path
            d={callsPath}
            fill="none"
            filter="url(#line-glow)"
            stroke="#168BFF"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d={hoursPath}
            fill="none"
            stroke="#2DD4BF"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          {points.map((point, index) => (
            <g key={point.date}>
              <circle
                cx={xFor(index)}
                cy={callsY(point.calls)}
                fill="#07101C"
                r="4"
                stroke="#39D8F2"
                strokeWidth="2"
              >
                <title>{`${point.label}: ${point.calls} calls, ${point.loginHours.toFixed(1)} logged-in hours`}</title>
              </circle>
              {(points.length <= 8 ||
                index === 0 ||
                index === points.length - 1 ||
                index % Math.ceil(points.length / 6) === 0) && (
                <text
                  fill="#8CA2B8"
                  fontSize="10"
                  textAnchor="middle"
                  x={xFor(index)}
                  y={height - 15}
                >
                  {point.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </article>
  );
}

export function ProductivityBreakdown({
  totals,
}: {
  totals: DashboardTotals;
}) {
  const segments = [
    { label: "Ready", value: totals.readySeconds, color: "bg-cyan" },
    { label: "Talk", value: totals.talkSeconds, color: "bg-primary" },
    { label: "Wrap", value: totals.wrapSeconds, color: "bg-teal" },
    { label: "Paused", value: totals.pausedSeconds, color: "bg-warning" },
    { label: "Idle", value: totals.idleSeconds, color: "bg-muted" },
  ];

  return (
    <article className="dashboard-card min-w-0 overflow-hidden">
      <ChartHeader
        description="Share of logged-in time by activity state."
        title="Productivity mix"
      />
      {totals.loginSeconds <= 0 ? (
        <EmptyState
          description="Activity ratios will populate when logged-in time is available for this range."
          icon="activity"
          title="No activity mix available"
        />
      ) : (
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.045]">
            {segments.map((segment) => (
              <span
                className={`${segment.color} min-w-px opacity-90`}
                key={segment.label}
                style={{
                  width: `${Math.min(
                    toPercentage(segment.value, totals.loginSeconds),
                    100,
                  )}%`,
                }}
              />
            ))}
          </div>
          <div className="space-y-4">
            {segments.map((segment) => {
              const percentage = toPercentage(
                segment.value,
                totals.loginSeconds,
              );
              return (
                <div key={segment.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                    <span className="flex items-center gap-2 font-medium text-muted-strong">
                      <span
                        className={`size-1.5 rounded-full ${segment.color}`}
                      />
                      {segment.label}
                    </span>
                    <span className="font-mono font-semibold text-white">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.045]">
                    <div
                      className={`h-full rounded-full ${segment.color}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

export function HourlyBreakdownChart({
  points,
}: {
  points: HourlyActivityPoint[];
}) {
  const maxCalls = Math.max(...points.map((point) => point.calls), 1);

  return (
    <article className="dashboard-card min-w-0 overflow-hidden">
      <ChartHeader
        description="Call volume by hour in the selected reporting window."
        title="Hourly breakdown"
      />
      {points.length === 0 ? (
        <EmptyState
          description="Hourly call volume will appear as soon as activity is imported for this range."
          icon="clock"
          title="No hourly data available"
        />
      ) : (
        <div className="flex min-h-64 items-end gap-1 overflow-x-auto px-5 pt-8 pb-5 sm:gap-2 sm:px-6">
          {points.map((point) => (
            <div
              className="group flex min-w-8 flex-1 flex-col items-center gap-2"
              key={point.hour}
            >
              <div className="flex h-40 w-full items-end justify-center">
                <div
                  className="relative w-full max-w-7 rounded-t-md bg-gradient-to-t from-primary/55 to-cyan shadow-[0_0_20px_rgba(22,139,255,.08)] transition group-hover:from-primary group-hover:to-cyan"
                  style={{
                    height: `${Math.max((point.calls / maxCalls) * 100, 4)}%`,
                  }}
                >
                  <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md border border-border bg-background px-1.5 py-1 text-[9px] font-semibold whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    {point.calls} calls
                  </span>
                </div>
              </div>
              <span className="text-[9px] whitespace-nowrap text-muted">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function TeamComparisonChart({
  rows,
}: {
  rows: TeamComparisonRow[];
}) {
  const max = Math.max(...rows.map((row) => row.callsPerHour), 1);

  return (
    <article
      className="dashboard-card min-w-0 overflow-hidden"
      id="team-comparison"
    >
      <ChartHeader
        description="Calls per logged-in hour across teams in your scope."
        title="Team comparison"
      />
      {rows.length === 0 ? (
        <EmptyState
          description="Team comparisons will appear when imported activity includes team snapshots."
          icon="team"
          title="No team comparison available"
        />
      ) : (
        <div className="space-y-5 px-5 py-5 sm:px-6">
          {rows.map((row, index) => (
            <div key={row.team}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white/[0.045] font-mono text-[10px] font-semibold text-muted-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-xs font-semibold text-white">
                    {row.team}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-cyan">
                  {row.callsPerHour.toFixed(1)}
                  <span className="ml-1 font-sans font-normal text-muted">
                    calls/hr
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.045]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-cyan to-teal"
                  style={{ width: `${(row.callsPerHour / max) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted">
                {row.calls.toLocaleString()} calls · {row.loginHours.toFixed(1)}{" "}
                logged-in hours
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
