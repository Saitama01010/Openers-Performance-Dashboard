import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { performancePageCsv } from "@/performance/csv";
import { getPerformancePageData } from "@/performance/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return response("Unauthorized", 401);

  try {
    const url = new URL(request.url);
    const env = getEnv();
    const dateRange = resolveOverviewDateRange(
      {
        range: url.searchParams.get("range") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      },
      new Date(),
      env.GOOGLE_SHEETS_TIMEZONE,
    );
    const data = await getPerformancePageData(actor, {
      dateRange,
      timeZone: env.GOOGLE_SHEETS_TIMEZONE,
    });
    return new Response(`\uFEFF${performancePageCsv(data)}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="performance-data.csv"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return response("Forbidden", 403);
    }
    throw error;
  }
}

function response(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
