import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { resolveTeamPerformanceFilters } from "@/teams/performance-analytics";
import { teamPerformanceCsv } from "@/teams/performance-csv";
import { getTeamPerformanceExportRows } from "@/teams/performance";

export const dynamic = "force-dynamic";

function privateResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return privateResponse("Unauthorized", 401);
  if (actor.role === "agent") return privateResponse("Forbidden", 403);

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const data = await getTeamPerformanceExportRows(actor, {
    dateRange,
    filters: resolveTeamPerformanceFilters(params),
  });
  if (data.sources.transfers !== "ready" || data.sources.closedDeals !== "ready") {
    return privateResponse("Team outcome sources are unavailable", 503);
  }
  return new Response(`\uFEFF${teamPerformanceCsv(data.rows)}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="team-performance.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
