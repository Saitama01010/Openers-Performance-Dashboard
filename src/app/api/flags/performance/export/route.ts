import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { performanceFlagsCsv } from "@/flags/csv";
import { getPerformanceFlagsData } from "@/flags/data";

export const dynamic = "force-dynamic";

function response(message: string, status: number) { return new Response(message, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return response("Unauthorized", 401);
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
    const data = await getPerformanceFlagsData(actor, {
      dateRange,
      teamId: url.searchParams.get("team") || undefined,
      managerId: url.searchParams.get("manager") || undefined,
      profileId: url.searchParams.get("profile") || undefined,
      wrap: url.searchParams.get("wrap") === "flagged" ? "flagged" : "all",
      pause: url.searchParams.get("pause") === "flagged" ? "flagged" : "all",
    });
    if (data.source.status !== "ready") return response("Performance flag source is unavailable", 503);
    return new Response(`\uFEFF${performanceFlagsCsv(data.rows)}`, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="performance-flags.csv"', "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") return response("Forbidden", 403);
    throw error;
  }
}
