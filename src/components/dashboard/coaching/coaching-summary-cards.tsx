"use client";

import { useState } from "react";

import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";

export type CoachingMetricCard = {
  label: string;
  value: number | null;
  display?: string;
  previous: number | null;
  comparisonLabel?: string | null;
  icon: DashboardIconName;
  tone: "blue" | "green" | "purple" | "orange";
  trend: Array<{ date: string; value: number }>;
  unavailableLabel?: string;
};

function comparison(card: CoachingMetricCard) {
  if (card.value === null || card.previous === null) return null;
  const difference = card.value - card.previous;
  if (card.previous === 0) return difference === 0 ? { direction: "flat", text: "No change" } : null;
  const rate = (difference / card.previous) * 100;
  return {
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
    text: `${difference > 0 ? "↑" : difference < 0 ? "↓" : "—"} ${Math.abs(rate).toFixed(1)}% vs ${card.comparisonLabel ?? "comparison"}`,
  };
}

function Sparkline({ points, label }: { points: CoachingMetricCard["trend"]; label: string }) {
  const [active, setActive] = useState(Math.max(0, points.length - 1));
  if (points.length < 2) return <div className={styles.spark}><span className={styles.muted}>Not enough daily data</span></div>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const x = (index: number) => 2 + (index / Math.max(1, points.length - 1)) * 96;
  const y = (value: number) => 30 - ((value - min) / spread) * 24;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`).join(" ");
  function move(direction: number) {
    setActive((current) => Math.min(points.length - 1, Math.max(0, current + direction)));
  }
  return (
    <div className={styles.spark}>
      <svg
        aria-label={`${label} daily trend. Use left and right arrow keys to inspect dates.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        }}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
          setActive(Math.round(ratio * (points.length - 1)));
        }}
        role="img"
        tabIndex={0}
        viewBox="0 0 100 34"
      >
        <path d={path} />
        <circle cx={x(active)} cy={y(points[active]?.value ?? 0)} r="2.8" />
      </svg>
      <span aria-live="polite" className={styles.sparkTip}>{points[active]?.date}: {points[active]?.value}</span>
    </div>
  );
}

export function CoachingSummaryCards({ cards, columns = 5 }: { cards: CoachingMetricCard[]; columns?: 4 | 5 }) {
  return (
    <section aria-label="Coaching summary" className={styles.kpiGrid} data-columns={columns}>
      {cards.map((card) => {
        const delta = comparison(card);
        return (
          <article className={styles.kpiCard} key={card.label}>
            <span className={styles.kpiIcon} data-tone={card.tone}><DashboardIcon name={card.icon} /></span>
            <div className={styles.kpiContent}>
              <span className={styles.kpiLabel}>{card.label}</span>
              <strong className={styles.kpiValue}>{card.display ?? (card.value === null ? "N/A" : card.value.toLocaleString("en-US"))}</strong>
              <span className={styles.kpiComparison} data-direction={delta?.direction}>
                {card.value === null ? card.unavailableLabel ?? "Not tracked" : delta?.text ?? "No comparable period"}
              </span>
            </div>
            {card.value === null ? <span className={styles.muted}>The current data model does not store this state.</span> : <Sparkline label={card.label} points={card.trend} />}
          </article>
        );
      })}
    </section>
  );
}
