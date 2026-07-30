"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { refreshLeaderboardSources } from "@/app/leaderboard/actions";

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
    <form action={refreshLeaderboardSources}>
      <button className="ui-button ui-button--secondary" type="submit">
        Refresh
      </button>
    </form>
  );
}
