import { resolveAgentDirectoryFilters } from "@/agents/directory-analytics";
import { agentDirectoryCsv } from "@/agents/csv";
import { getAgentDirectoryExportRows } from "@/agents/directory";
import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

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

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const range = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const data = await getAgentDirectoryExportRows(actor, {
    dateRange: range,
    filters: resolveAgentDirectoryFilters(params),
  });
  if (data.sources.transfers !== "ready" || data.sources.closedDeals !== "ready") {
    return privateResponse("Agent outcome sources are unavailable", 503);
  }
  return new Response(`\uFEFF${agentDirectoryCsv(data.rows)}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="agents.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
