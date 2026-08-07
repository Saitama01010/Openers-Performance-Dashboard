"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent } from "react";

import styles from "@/components/dashboard/coaching/coaching-page.module.css";

export function CoachingTabs({ showLeaderboard }: { showLeaderboard: boolean }) {
  const pathname = usePathname();
  const tabs = [
    ...(showLeaderboard ? [{ href: "/coaching/leaderboard", label: "Leaderboard" }] : []),
    { href: "/coaching/room", label: "Coaching Room" },
    { href: "/coaching/improvement", label: "Improvement" },
  ];
  function navigateByKey(event: KeyboardEvent<HTMLAnchorElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const links = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('[role="tab"]') ?? []);
    const current = links.indexOf(event.currentTarget);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowLeft" ? (current - 1 + links.length) % links.length : (current + 1) % links.length;
    links[next]?.focus();
    links[next]?.click();
  }
  return (
    <nav aria-label="Coaching Sessions views" className={styles.tabs} role="tablist">
      {tabs.map((tab) => {
        const selected = pathname === tab.href;
        return <Link aria-controls="coaching-tab-panel" aria-current={selected ? "page" : undefined} aria-selected={selected} className={styles.tab} href={tab.href} key={tab.href} onKeyDown={navigateByKey} role="tab" tabIndex={selected ? 0 : -1}>{tab.label}</Link>;
      })}
    </nav>
  );
}
