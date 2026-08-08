"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  forwardRef,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import styles from "@/components/ui/donut-chart.module.css";

export interface DonutChartSegment {
  id: string;
  value: number;
  color: string;
  label: string;
  accessibleLabel?: string;
}

type DonutChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  activeSegmentId?: string | null;
  animationDelayPerSegment?: number;
  animationDuration?: number;
  ariaLabel: string;
  centerClassName?: string;
  centerContent?: ReactNode;
  data: DonutChartSegment[];
  highlightOnHover?: boolean;
  interactiveSegments?: boolean;
  onSegmentHover?: (segment: DonutChartSegment | null) => void;
  onSegmentSelect?: (segment: DonutChartSegment) => void;
  size?: number;
  strokeWidth?: number;
  totalValue?: number;
  trackColor?: string;
};

type SegmentLayout = {
  dashLength: number;
  offset: number;
  segment: DonutChartSegment;
};

function joinClassNames(...names: Array<string | undefined>) {
  return names.filter(Boolean).join(" ");
}

const DonutChart = forwardRef<HTMLDivElement, DonutChartProps>(function DonutChart(
  {
    activeSegmentId,
    animationDelayPerSegment = 0.04,
    animationDuration = 0.68,
    ariaLabel,
    centerClassName,
    centerContent,
    className,
    data,
    highlightOnHover = true,
    interactiveSegments = false,
    onSegmentHover,
    onSegmentSelect,
    size = 200,
    strokeWidth = 20,
    style,
    totalValue: providedTotal,
    trackColor = "#edf1f6",
    ...props
  },
  ref,
) {
  const reducedMotion = useReducedMotion();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const safeSize = Math.max(48, size);
  const safeStrokeWidth = Math.min(Math.max(1, strokeWidth), safeSize / 2 - 1);
  const radius = safeSize / 2 - safeStrokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const positiveData = useMemo(
    () => data.filter((segment) => Number.isFinite(segment.value) && segment.value > 0),
    [data],
  );
  const dataTotal = useMemo(
    () => positiveData.reduce((sum, segment) => sum + segment.value, 0),
    [positiveData],
  );
  const totalValue = providedTotal === undefined
    ? dataTotal
    : Math.max(dataTotal, Number.isFinite(providedTotal) ? providedTotal : 0);
  const layouts = useMemo<SegmentLayout[]>(() => {
    let cumulativeValue = 0;

    return positiveData.map((segment) => {
      const share = totalValue > 0 ? segment.value / totalValue : 0;
      const offset = totalValue > 0 ? (cumulativeValue / totalValue) * circumference : 0;
      cumulativeValue += segment.value;
      return {
        dashLength: Math.max(0, share * circumference - Math.min(1.4, circumference * 0.004)),
        offset,
        segment,
      };
    });
  }, [circumference, positiveData, totalValue]);
  const resolvedActiveId = hoveredId ?? activeSegmentId ?? null;

  function setHovered(segment: DonutChartSegment | null) {
    setHoveredId(segment?.id ?? null);
    onSegmentHover?.(segment);
  }

  function handleSegmentKeyDown(event: KeyboardEvent<SVGCircleElement>, segment: DonutChartSegment) {
    if (!interactiveSegments || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSegmentSelect?.(segment);
  }

  return (
    <div
      className={joinClassNames(styles.root, className)}
      ref={ref}
      style={{ "--donut-size": `${safeSize}px`, ...style } as CSSProperties}
      {...props}
    >
      <svg
        aria-label={ariaLabel}
        className={styles.svg}
        role={interactiveSegments ? "group" : "img"}
        viewBox={`0 0 ${safeSize} ${safeSize}`}
      >
        <circle
          aria-hidden="true"
          cx={safeSize / 2}
          cy={safeSize / 2}
          fill="transparent"
          r={radius}
          stroke={trackColor}
          strokeWidth={safeStrokeWidth}
        />
        {layouts.map(({ dashLength, offset, segment }, index) => {
          const isActive = resolvedActiveId === segment.id;
          const isDimmed = Boolean(resolvedActiveId && !isActive);
          const finalDasharray = `${dashLength} ${Math.max(0, circumference - dashLength)}`;
          const transitionDelay = Math.min(index * animationDelayPerSegment, 0.24);

          return (
            <motion.circle
              animate={{ opacity: 1, strokeDasharray: finalDasharray }}
              aria-label={interactiveSegments ? segment.accessibleLabel ?? segment.label : undefined}
              className={styles.segment}
              cx={safeSize / 2}
              cy={safeSize / 2}
              data-active={highlightOnHover && isActive ? "true" : undefined}
              data-dimmed={highlightOnHover && isDimmed ? "true" : undefined}
              data-interactive={interactiveSegments ? "true" : undefined}
              fill="transparent"
              initial={reducedMotion ? false : { opacity: 0, strokeDasharray: `0 ${circumference}` }}
              key={segment.id}
              onBlur={interactiveSegments ? () => setHovered(null) : undefined}
              onClick={interactiveSegments ? () => onSegmentSelect?.(segment) : undefined}
              onFocus={interactiveSegments ? () => setHovered(segment) : undefined}
              onKeyDown={interactiveSegments ? (event) => handleSegmentKeyDown(event, segment) : undefined}
              onPointerEnter={() => setHovered(segment)}
              onPointerLeave={() => setHovered(null)}
              r={radius}
              role={interactiveSegments ? "button" : undefined}
              stroke={segment.color}
              strokeDasharray={finalDasharray}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              strokeWidth={isActive && highlightOnHover ? safeStrokeWidth * 1.08 : safeStrokeWidth}
              style={{ "--segment-color": segment.color } as CSSProperties}
              tabIndex={interactiveSegments ? 0 : undefined}
              transition={reducedMotion ? { duration: 0 } : {
                opacity: { delay: transitionDelay, duration: 0.18 },
                strokeDasharray: {
                  delay: transitionDelay,
                  duration: animationDuration,
                  ease: [0.16, 1, 0.3, 1],
                },
              }}
            >
              <title>{segment.accessibleLabel ?? segment.label}</title>
            </motion.circle>
          );
        })}
      </svg>
      {centerContent ? (
        <div className={joinClassNames(styles.center, centerClassName)}>{centerContent}</div>
      ) : null}
    </div>
  );
});

DonutChart.displayName = "DonutChart";

export { DonutChart };
