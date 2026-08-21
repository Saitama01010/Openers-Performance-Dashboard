import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { LeaderboardRefreshControls } from "@/components/leaderboard/leaderboard-refresh-controls";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { formatCompactLeaderboardRange } from "@/components/leaderboard/leaderboard-date-label";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import styles from "@/components/leaderboard/leaderboard-page.module.css";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { resolveLeaderboardView } from "@/leaderboard/analytics";
import { getLeaderboardData } from "@/leaderboard/data";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const view = resolveLeaderboardView(params);
  const data = await getLeaderboardData(user, {
    from: dateRange.from,
    to: dateRange.to,
    comparison: dateRange.comparison ?? undefined,
  });

  return (
    <DashboardShell user={user}>
      <section className={`leaderboard-page ${styles.page}`}>
        <header className={styles.pageHeader}>
          <div className={styles.headingCopy}>
            <p>Performance</p>
            <h1>LeaderBoard</h1>
            <span>Rank openers by valid Closed worksheet submissions and attributed transfers.</span>
          </div>
          <div className={styles.headerControls}>
            <div className={styles.headerActions}>
              <DashboardDateFilter
                ariaLabel="Leaderboard date filter"
                pathname="/leaderboard"
                range={dateRange}
              />
              <LeaderboardRefreshControls />
            </div>
            <p className={styles.rangeLabel}>
              <DashboardIcon name="calendar" />
              <span>{dateRange.label}:</span>
              <strong>
                {dateRange.from && dateRange.to
                  ? formatCompactLeaderboardRange(dateRange.from, dateRange.to)
                  : "All available history"}
              </strong>
            </p>
          </div>
        </header>
        <LeaderboardView data={data} dateRange={dateRange} initialView={view} />
      </section>
    </DashboardShell>
  );
}
