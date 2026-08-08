"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DonutChart } from "@/components/ui/donut-chart";
import {
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export type AnimatedMetricFormat =
  | "count"
  | "decimal"
  | "duration"
  | "percentage";

export type ProductivityMixItem = {
  label: string;
  seconds: number;
  tone: "blue" | "cyan" | "green" | "orange" | "pink" | "slate" | "violet";
};

const productivityToneColors: Record<ProductivityMixItem["tone"], string> = {
  blue: "var(--primary)",
  cyan: "#0f97a5",
  green: "var(--success)",
  orange: "#f07b14",
  pink: "#e83e75",
  slate: "#718096",
  violet: "#6d3fe0",
};

export type ClosedDealsPerformer = {
  agentName: string;
  closedDeals: number;
  profileId: string;
};

function compactDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${formatNumber(hours)}h ${minutes}m`;
}

function formattedMetric(value: number, format: AnimatedMetricFormat) {
  if (format === "duration") return compactDuration(value);
  if (format === "decimal") return formatOptionalNumber(value);
  if (format === "percentage") return formatPercentage(value);
  return formatNumber(Math.round(value));
}

function useMotionReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      if (media.matches) {
        setReady(true);
        return;
      }
      secondFrame = window.requestAnimationFrame(() => setReady(true));
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return ready;
}

function useAnimatedValue(value: number, duration: number) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let startedAt: number | null = null;

    const update = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(value * easedProgress);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(update);
      }
    };

    animationFrame = window.requestAnimationFrame((timestamp) => {
      if (media.matches || value === 0) {
        setDisplayValue(value);
        return;
      }
      setDisplayValue(0);
      startedAt = timestamp;
      animationFrame = window.requestAnimationFrame(update);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [duration, value]);

  return displayValue;
}

export function AnimatedMetricValue({
  duration = 650,
  fallback = "—",
  format,
  value,
}: {
  duration?: number;
  fallback?: string;
  format: AnimatedMetricFormat;
  value: number | null;
}) {
  const displayValue = useAnimatedValue(value ?? 0, duration);

  if (value === null) return fallback;

  const finalValue = formattedMetric(value, format);

  return (
    <span aria-label={finalValue} className="animated-metric-value">
      <span aria-hidden="true">{formattedMetric(displayValue, format)}</span>
    </span>
  );
}

export function AnimatedProductivityMix({
  items,
}: {
  items: ProductivityMixItem[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.seconds, 0),
    [items],
  );
  return (
    <div className="productivity-mix productivity-mix--donut">
      <div className="productivity-mix__content">
        <DonutChart
          activeSegmentId={activeIndex === null ? null : items[activeIndex]?.label}
          ariaLabel={`Recorded activity totals ${compactDuration(total)}`}
          centerClassName="productivity-mix__total"
          centerContent={<><span>Total</span><strong><AnimatedMetricValue duration={760} format="duration" value={total} /></strong></>}
          className="productivity-mix__donut"
          data={items.map((item) => ({ id: item.label, value: item.seconds, color: productivityToneColors[item.tone], label: item.label, accessibleLabel: `${item.label}: ${compactDuration(item.seconds)}` }))}
          size={168}
          strokeWidth={22}
        />

        <div className="productivity-mix__legend" role="list">
          {items.map((item, index) => {
            const share = total > 0 ? (item.seconds / total) * 100 : 0;

            return (
              <button
                aria-label={`${item.label}: ${compactDuration(item.seconds)}, ${formatPercentage(share)}`}
                className="productivity-mix__legend-button"
                key={item.label}
                onBlur={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                type="button"
              >
                <span>
                  <span
                    className={`productivity-mix__dot productivity-mix__dot--${item.tone}`}
                  />
                  {item.label}
                </span>
                <strong>{formatPercentage(share)}</strong>
              </button>
            );
          })}
        </div>
      </div>
      <Link className="productivity-mix__action" href="/performance">
        View full breakdown
        <DashboardIcon name="arrowRight" />
      </Link>
    </div>
  );
}

export function AnimatedClosedDealsBarChart({
  emptyMessage,
  rows,
}: {
  emptyMessage: string;
  rows: ClosedDealsPerformer[];
}) {
  const ready = useMotionReady();
  const maximum = Math.max(0, ...rows.map((row) => row.closedDeals));

  if (rows.length === 0) {
    return (
      <div className="closed-deals-chart__empty" role="status">
        <span aria-hidden="true">
          <DashboardIcon name="leaderboard" />
        </span>
        <div>
          <strong>Closed-deals data is not available</strong>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <figure className="closed-deals-chart">
      <figcaption className="sr-only">
        Top five performers ranked by closed deals in the selected period.
      </figcaption>
      <ol>
        {rows.slice(0, 5).map((row, index) => {
          const width = maximum > 0 ? (row.closedDeals / maximum) * 100 : 0;
          const style = {
            "--bar-delay": `${index * 55}ms`,
            "--bar-scale": ready ? width / 100 : 0,
          } as CSSProperties;

          return (
            <li key={row.profileId}>
              <div className="closed-deals-chart__label">
                <span>{row.agentName}</span>
                <strong>
                  <AnimatedMetricValue
                    duration={680}
                    format="count"
                    value={row.closedDeals}
                  />
                </strong>
              </div>
              <span
                aria-label={`${row.agentName}: ${formatNumber(row.closedDeals)} closed deals`}
                className="closed-deals-chart__track"
                role="img"
              >
                <span
                  aria-hidden="true"
                  className="closed-deals-chart__bar"
                  style={style}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
