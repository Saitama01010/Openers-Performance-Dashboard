import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/dashboard-icons";
import {
  AnimatedMetricValue,
  AnimatedProductivityMix,
  type AnimatedMetricFormat,
} from "@/components/dashboard/overview-animations";
import { METRIC_CARD_TONES, metricCardStyle } from "@/components/ui/statistics-card";
import type {
  DashboardData,
  DashboardHourlyBreakdownRow,
  DashboardTotals,
} from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

const METRIC_PANEL_TONES = {
  blue: METRIC_CARD_TONES.blue,
  green: METRIC_CARD_TONES.green,
  orange: METRIC_CARD_TONES.orange,
  violet: METRIC_CARD_TONES.purple,
} as const;

export function formatCompactDuration(seconds: number | null) {
  if (seconds === null) return "N/A";

  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${formatNumber(hours)}h ${minutes}m`;
}

export function MetricPanel({
  detail,
  icon,
  label,
  tone = "blue",
  value,
  animatedValue,
}: {
  animatedValue?: {
    format: AnimatedMetricFormat;
    value: number | null;
  };
  detail: string;
  icon: DashboardIconName;
  label: string;
  tone?: "blue" | "green" | "orange" | "violet";
  value: string;
}) {
  return (
    <article className={`metric-panel metric-panel--${tone} metric-color-card`} style={metricCardStyle(METRIC_PANEL_TONES[tone])}>
      <div className="metric-panel__heading">
        <span className="metric-panel__icon metric-card-icon">
          <DashboardIcon name={icon} />
        </span>
        <p className="metric-panel__label metric-card-label">{label}</p>
      </div>
      <p className="metric-panel__value metric-card-value">
        {animatedValue ? (
          <AnimatedMetricValue
            format={animatedValue.format}
            value={animatedValue.value}
          />
        ) : (
          value
        )}
      </p>
      <p className="metric-panel__detail metric-card-detail">{detail}</p>
    </article>
  );
}

const activityStates = [
  ["Ready time", "readySeconds", "activity", "blue"],
  ["Talk time", "talkSeconds", "talk", "green"],
  ["Ringing time", "ringingSeconds", "ringing", "violet"],
  ["Wrap time", "wrapSeconds", "activity", "cyan"],
  ["Paused time", "pausedSeconds", "pause", "orange"],
  ["System Pause", "systemPauseSeconds", "pause", "orange"],
  ["Net", "netSeconds", "activity", "blue"],
  ["Idle time", "idleSeconds", "freshness", "pink"],
  ["Untracked time", "untrackedSeconds", "untracked", "slate"],
] as const;

type DashboardComparison = NonNullable<DashboardData["comparison"]>;

function comparisonTrend(
  current: number,
  previous: number,
  comparison: DashboardComparison,
) {
  if (!comparison.hasData) {
    return {
      label: "No prior period data",
      tone: "neutral",
    } as const;
  }

  if (previous <= 0) {
    return current > 0
      ? {
          label: `↑ New vs ${comparison.label}`,
          tone: "up",
        }
      : {
          label: `— No change vs ${comparison.label}`,
          tone: "neutral",
        };
  }

  const percentage = ((current - previous) / previous) * 100;
  if (Math.abs(percentage) < 0.005) {
    return {
      label: `— No change vs ${comparison.label}`,
      tone: "neutral",
    } as const;
  }

  const rising = percentage > 0;
  return {
    label: `${rising ? "↑ Up" : "↓ Down"} ${formatPercentage(
      Math.abs(percentage),
    )} vs ${comparison.label}`,
    tone: rising ? "up" : "down",
  } as const;
}

export function ActivityStateGrid({
  animateValues = false,
  comparison,
  totals,
}: {
  animateValues?: boolean;
  comparison?: DashboardComparison | null;
  totals: DashboardTotals;
}) {
  return (
    <div className="activity-state-grid">
      {activityStates.map(([label, key, icon, tone]) => {
        const seconds = totals[key];
        const share =
          seconds !== null && totals.loggedInSeconds > 0
            ? (seconds / totals.loggedInSeconds) * 100
            : null;
        const trend = comparison
          ? comparisonTrend(
              seconds ?? 0,
              comparison.totals[key] ?? 0,
              comparison,
            )
          : null;

        return (
          <article
            className={`activity-state activity-state--${tone}`}
            key={key}
          >
            <div className="activity-state__heading">
              <span className="activity-state__icon">
                <DashboardIcon name={icon} />
              </span>
              <p>{label}</p>
            </div>
            <p className="activity-state__value">
              {animateValues ? (
                <AnimatedMetricValue format="duration" value={seconds} />
              ) : (
                formatCompactDuration(seconds)
              )}
            </p>
            <p className="activity-state__share">
              {seconds === null
                ? "Not reported by source"
                : share === null
                ? "No logged-in time"
                : `${formatPercentage(share)} of logged-in time`}
            </p>
            {trend ? (
              <p
                className={`activity-state__trend activity-state__trend--${trend.tone}`}
              >
                {trend.label}
              </p>
            ) : null}
            <span className="activity-state__track" aria-hidden="true">
              <span
                className="activity-state__bar"
                style={{ width: `${Math.min(100, Math.max(0, share ?? 0))}%` }}
              />
            </span>
          </article>
        );
      })}
    </div>
  );
}

export function HourlyActivityChart({
  dailyAggregatePresent = false,
  rows,
}: {
  dailyAggregatePresent?: boolean;
  rows: DashboardHourlyBreakdownRow[];
}) {
  const maximumCalls = Math.max(0, ...rows.map((row) => row.calls));
  const scaleDivisor = Math.max(1, maximumCalls);
  const midpointCalls = Math.round(maximumCalls / 2);

  if (rows.length === 0) {
    return (
      <div className="chart-empty">
        {dailyAggregatePresent
          ? "Hourly detail is unavailable for daily aggregate imports."
          : "No hourly activity is available in the active data."}
      </div>
    );
  }

  return (
    <figure className="hourly-chart">
      <figcaption className="sr-only">
        Calls by hour in the active reporting scope. The highest hourly total is{" "}
        {formatNumber(maximumCalls)} calls.
      </figcaption>
      <div className="hourly-chart__body">
        <div aria-hidden="true" className="hourly-chart__scale">
          <span>{formatNumber(maximumCalls)}</span>
          <span>{formatNumber(midpointCalls)}</span>
          <span>0</span>
        </div>
        <div className="hourly-chart__plot">
          <span
            aria-hidden="true"
            className="hourly-chart__gridline hourly-chart__gridline--top"
          />
          <span
            aria-hidden="true"
            className="hourly-chart__gridline hourly-chart__gridline--middle"
          />
          {rows.map((row) => {
            const hour = `${String(row.hour).padStart(2, "0")}:00`;
            const value = `${formatNumber(row.calls)} calls`;

            return (
              <div
                aria-label={`${hour}: ${value}`}
                className="hourly-chart__column"
                key={row.hour}
                role="img"
                tabIndex={0}
                title={`${hour} · ${value}`}
              >
                <span
                  aria-hidden="true"
                  className="hourly-chart__bar"
                  style={{
                    height:
                      row.calls > 0
                        ? `${Math.max(2, (row.calls / scaleDivisor) * 100)}%`
                        : "0%",
                  }}
                />
                <span className="hourly-chart__label">
                  {String(row.hour).padStart(2, "0")}
                </span>
                <span aria-hidden="true" className="hourly-chart__tooltip">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hourly-chart__legend">
        <span>
          <span className="hourly-chart__legend-mark" /> Calls
        </span>
        <span>Hours shown in local time</span>
      </div>
    </figure>
  );
}

export function ProductivityMix({
  totals,
  variant = "bar",
}: {
  totals: DashboardTotals;
  variant?: "bar" | "donut";
}) {
  const items = [
    ["Ready", totals.readySeconds, "blue"],
    ["Talk", totals.talkSeconds, "green"],
    ["Wrap", totals.wrapSeconds, "cyan"],
    ["Paused", totals.pausedSeconds, "orange"],
    ["System Pause", totals.systemPauseSeconds, "orange"],
    ["Idle", totals.idleSeconds, "pink"],
    ["Ringing", totals.ringingSeconds, "violet"],
    ["Untracked", totals.untrackedSeconds, "slate"],
  ] as const;
  const total = items.reduce((sum, [, seconds]) => sum + (seconds ?? 0), 0);

  if (variant === "donut") {
    return (
      <AnimatedProductivityMix
        items={items.map(([label, seconds, tone]) => ({
          label,
          seconds: seconds ?? 0,
          tone,
        }))}
      />
    );
  }

  return (
    <div className="productivity-mix">
      <div
        aria-label="Time allocation"
        className="productivity-mix__bar"
        role="img"
      >
        {items.map(([label, seconds, tone]) => (
          <span
            aria-label={`${label}: ${
              seconds === null ? "not reported" : formatDurationSeconds(seconds).hms
            }`}
            className={`productivity-mix__segment productivity-mix__segment--${tone}`}
            key={label}
            style={{
              width: `${
                total > 0 && seconds !== null ? (seconds / total) * 100 : 0
              }%`,
            }}
          />
        ))}
      </div>
      <dl className="productivity-mix__legend">
        {items.map(([label, seconds, tone]) => (
          <div key={label}>
            <dt>
              <span
                className={`productivity-mix__dot productivity-mix__dot--${tone}`}
              />
              {label}
            </dt>
            <dd>
              {seconds === null
                ? "N/A"
                : total > 0
                ? formatOptionalNumber((seconds / total) * 100)
                : "0.0"}
              {seconds === null ? null : "%"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
