import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { LeaderboardRefreshControls } from "@/components/leaderboard/leaderboard-refresh-controls";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { PageHeader } from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { getLeaderboardData } from "@/leaderboard/data";
import { resolveLeaderboardSort } from "@/leaderboard/sorting";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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
  const query = firstValue(params.q)?.trim() || undefined;
  const teamId = firstValue(params.teamId)?.trim() || undefined;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const sort = resolveLeaderboardSort(params);
  const data = await getLeaderboardData(user, {
    query,
    teamId,
    from: dateRange.from,
    to: dateRange.to,
  });

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page leaderboard-page">
        <PageHeader
          actions={
            <>
              <DashboardDateFilter
                ariaLabel="Leaderboard date filter"
                pathname="/leaderboard"
                preservedParams={{
                  q: query,
                  teamId,
                  sort: sort?.column,
                  direction: sort?.direction,
                }}
                range={dateRange}
              />
              <LeaderboardRefreshControls />
            </>
          }
          description="Rank openers by valid Closed worksheet submissions, attributed automatically by American Name."
          eyebrow="Performance"
          title="LeaderBoard"
        />
        <LeaderboardView data={data} dateRange={dateRange} sort={sort} />
      </section>
    </DashboardShell>
  );
}
