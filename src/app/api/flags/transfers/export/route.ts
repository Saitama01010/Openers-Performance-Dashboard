import { getCurrentUser } from "@/auth/session";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { transferFlagsCsv } from "@/flags/csv";
import { getTransferFlagsData } from "@/flags/data";
import type { TransferFlagClassification } from "@/flags/domain";

export const dynamic = "force-dynamic";
function response(message: string, status: number) { return new Response(message, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
function classification(value: string | null) { return value === "strong" || value === "improvement" ? value as TransferFlagClassification : undefined; }

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return response("Unauthorized", 401);
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
    const data = await getTransferFlagsData(actor, { dateRange, teamId: url.searchParams.get("team") || undefined, managerId: url.searchParams.get("manager") || undefined, profileId: url.searchParams.get("profile") || undefined, classification: classification(url.searchParams.get("flag")) });
    if (data.source.status !== "ready") return response("Transfer flag source is unavailable", 503);
    return new Response(`\uFEFF${transferFlagsCsv(data.rows)}`, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="transfer-flags.csv"', "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") return response("Forbidden", 403);
    throw error;
  }
}
