"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import { refreshLeaderboardSources } from "@/app/leaderboard/actions";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import styles from "@/components/leaderboard/leaderboard-page.module.css";

const AUTOMATIC_REFRESH_MS = 5 * 60 * 1000;

export function LeaderboardRefreshControls() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, AUTOMATIC_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <form action={refreshLeaderboardSources} className={styles.refreshForm}>
      <RefreshButton />
    </form>
  );
}

function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={pending ? "Refreshing LeaderBoard sources" : "Refresh LeaderBoard sources"}
      className={`ui-button ui-button--secondary ${styles.refreshButton}`}
      disabled={pending}
      type="submit"
    >
      <DashboardIcon name="freshness" />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
