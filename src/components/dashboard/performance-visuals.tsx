import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/dashboard-icons";
import type {
  DashboardHourlyBreakdownRow,
  DashboardTotals,
} from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

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
}: {
  detail: string;
  icon: DashboardIconName;
  label: string;
  tone?: "blue" | "green" | "orange" | "violet";
  value: string;
}) {
  return (
    <article className={`metric-panel metric-panel--${tone}`}>
      <div className="metric-panel__heading">
        <span className="metric-panel__icon">
          <DashboardIcon name={icon} />
        </span>
        <p className="metric-panel__label">{label}</p>
      </div>
      <p className="metric-panel__value">{value}</p>
      <p className="metric-panel__detail">{detail}</p>
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

export function ActivityStateGrid({ totals }: { totals: DashboardTotals }) {
  return (
    <div className="activity-state-grid">
      {activityStates.map(([label, key, icon, tone]) => {
        const seconds = totals[key];
        const share =
          seconds !== null && totals.loggedInSeconds > 0
            ? (seconds / totals.loggedInSeconds) * 100
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
              {formatCompactDuration(seconds)}
            </p>
            <p className="activity-state__share">
              {seconds === null
                ? "Not reported by source"
                : share === null
                ? "No logged-in time"
                : `${formatPercentage(share)} of logged-in time`}
            </p>
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

export function ProductivityMix({ totals }: { totals: DashboardTotals }) {
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
