"use client";

import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/dashboard-icons";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";
import { AreaTrend } from "@/components/ui/area-trend";

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

const TREND_COLORS: Record<CoachingMetricCard["tone"], string> = {
  blue: "#1f5eff",
  green: "#0a8f64",
  orange: "#d97706",
  purple: "#7c3aed",
};

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
            {card.value === null ? <span className={styles.muted}>The current data model does not store this state.</span> : (
              <AreaTrend
                ariaLabel={`${card.label} daily trend`}
                className={styles.spark}
                color={TREND_COLORS[card.tone]}
                emptyLabel="Not enough daily data"
                points={card.trend.map((point) => ({ label: point.date, value: point.value }))}
                size="standard"
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
