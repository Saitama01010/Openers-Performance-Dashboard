"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import styles from "@/components/ui/area-trend.module.css";

export type AreaTrendPoint = {
  label?: string;
  value: number | null;
};

type AreaTrendProps = {
  ariaLabel: string;
  className?: string;
  color: string;
  emptyLabel?: string;
  formatValue?: (value: number) => string;
  interactive?: boolean;
  points: AreaTrendPoint[];
  size?: "compact" | "standard" | "large";
};

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;
const INSET_X = 4;
const INSET_Y = 5;
const BASELINE = VIEWBOX_HEIGHT - INSET_Y;

export function AreaTrend({
  ariaLabel,
  className,
  color,
  emptyLabel = "Not enough trend data",
  formatValue = (value) => value.toLocaleString("en-US"),
  interactive = true,
  points,
  size = "compact",
}: AreaTrendProps) {
  const gradientId = `area-trend-${useId().replaceAll(":", "")}`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const available = points.flatMap((point, index) =>
    point.value === null ? [] : [{ ...point, index, value: point.value }],
  );

  if (available.length < 2) {
    return <span className={`${styles.empty} ${className ?? ""}`.trim()}>{emptyLabel}</span>;
  }

  const values = available.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const denominator = Math.max(points.length - 1, 1);
  const coordinates = available.map((point) => ({
    ...point,
    x: INSET_X + (point.index / denominator) * (VIEWBOX_WIDTH - INSET_X * 2),
    y: BASELINE - ((point.value - minimum) / range) * (VIEWBOX_HEIGHT - INSET_Y * 2),
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L${coordinates.at(-1)?.x ?? INSET_X} ${BASELINE} L${coordinates[0].x} ${BASELINE} Z`;
  const active = activeIndex === null ? null : coordinates[activeIndex] ?? null;

  function moveActive(direction: -1 | 1) {
    setActiveIndex((current) => {
      const start = current ?? coordinates.length - 1;
      return Math.max(0, Math.min(coordinates.length - 1, start + direction));
    });
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
    }
    if (event.key === "Escape") setActiveIndex(null);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
    const nearest = coordinates.reduce((best, point, index) =>
      Math.abs(point.x / VIEWBOX_WIDTH - ratio) < Math.abs(coordinates[best].x / VIEWBOX_WIDTH - ratio) ? index : best,
    0);
    setActiveIndex(nearest);
  }

  const rootStyle = {
    "--area-trend-color": color,
    "--area-trend-active-x": `${active?.x ?? 50}%`,
  } as CSSProperties;

  return (
    <span className={`${styles.root} ${className ?? ""}`.trim()} data-size={size} style={rootStyle}>
      <svg
        aria-label={interactive ? `${ariaLabel}. Use left and right arrow keys to inspect points.` : ariaLabel}
        className={styles.chart}
        onBlur={interactive ? () => setActiveIndex(null) : undefined}
        onFocus={interactive ? () => setActiveIndex(coordinates.length - 1) : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        onLostPointerCapture={interactive ? () => setActiveIndex(null) : undefined}
        onPointerCancel={interactive ? () => setActiveIndex(null) : undefined}
        onPointerLeave={interactive ? () => setActiveIndex(null) : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        role="img"
        tabIndex={interactive ? 0 : undefined}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <title>{ariaLabel}</title>
        <desc>
          {available.map((point) => `${point.label ?? `Point ${point.index + 1}`}: ${formatValue(point.value)}`).join("; ")}
        </desc>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.035" />
          </linearGradient>
        </defs>
        <path className={styles.area} d={areaPath} fill={`url(#${gradientId})`} />
        <path className={styles.line} d={linePath} fill="none" stroke={color} />
        {interactive && active ? (
          <g aria-hidden="true">
            <line className={styles.crosshair} x1={active.x} x2={active.x} y1={INSET_Y} y2={BASELINE} />
            <circle className={styles.activeDot} cx={active.x} cy={active.y} fill={color} r="3.4" />
          </g>
        ) : null}
      </svg>
      {interactive && active ? (
        <span
          aria-live="polite"
          className={styles.tooltip}
          data-edge={activeIndex === 0 ? "start" : activeIndex === coordinates.length - 1 ? "end" : undefined}
          role="status"
        >
          {active.label ? <span>{active.label}</span> : null}
          <strong>{formatValue(active.value)}</strong>
        </span>
      ) : null}
    </span>
  );
}
