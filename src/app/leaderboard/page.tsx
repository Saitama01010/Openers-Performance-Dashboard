import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { PageHeader } from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getLeaderboardData } from "@/leaderboard/data";

export const dynamic = "force-dynamic";

function dateFilter(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : undefined;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const data = await getLeaderboardData(user, {
    query: params.q?.trim() || undefined,
    teamId: params.teamId?.trim() || undefined,
    from: dateFilter(params.from),
    to: dateFilter(params.to),
  });

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          description="Rank openers by successfully attributed closed deals, with transfer count reserved only as an optional tie-breaker."
          eyebrow="Performance"
          title="LeaderBoard"
        />
        <LeaderboardView data={data} />
      </section>
    </DashboardShell>
  );
}
