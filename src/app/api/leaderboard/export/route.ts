import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { prepareLeaderboardRows, resolveLeaderboardView } from "@/leaderboard/analytics";
import { leaderboardCsv } from "@/leaderboard/csv";
import { getLeaderboardData } from "@/leaderboard/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return privateResponse("Unauthorized", 401);

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const env = getEnv();
  const range = resolveOverviewDateRange(params, new Date(), env.GOOGLE_SHEETS_TIMEZONE);
  const view = resolveLeaderboardView(params);
  const data = await getLeaderboardData(actor, {
    from: range.from,
    to: range.to,
    comparison: range.comparison ?? undefined,
  });
  if (data.status !== "ready") {
    return privateResponse("Leaderboard sources are unavailable", 503);
  }
  const closedMetricsAvailable = data.closedMetricsAvailable !== false;
  if (!closedMetricsAvailable && view.metric !== "transfers") {
    return privateResponse("Closed leaderboard metrics are unavailable", 503);
  }
  const rows = prepareLeaderboardRows(data.rows, view);
  return new Response(
    `\uFEFF${leaderboardCsv(rows, view.metric, { closedMetricsAvailable })}`,
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="leaderboard.csv"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function privateResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
