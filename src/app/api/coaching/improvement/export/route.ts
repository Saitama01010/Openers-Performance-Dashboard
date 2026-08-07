import { getCurrentUser } from "@/auth/session";
import { COACHING_CATEGORY_LABELS, OVERALL_IMPROVEMENT_LABELS } from "@/coaching/domain";
import { getCoachingImprovementData } from "@/coaching/improvement-data";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";
function csv(value: unknown) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function privateText(message: string, status: number) { return new Response(message, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }

export async function GET(request: Request) {
  const actor = await getCurrentUser(); if (!actor) return privateText("Unauthorized", 401); if (actor.role === "agent") return privateText("Forbidden", 403);
  const url = new URL(request.url); const params = Object.fromEntries(url.searchParams.entries()); const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const data = await getCoachingImprovementData(actor, { dateRange, teamId: url.searchParams.get("team") || undefined, managerId: url.searchParams.get("manager") || undefined });
  const rows = [["Agent", "Teams", "Coach", "Session Date", "Focus", "Overall Rate", "Outcome"], ...data.improvement.map((row) => [row.agentName, row.teamNames.join("; "), row.coachName, row.sessionDate, COACHING_CATEGORY_LABELS[row.category], row.overall.rate === null ? "" : row.overall.rate.toFixed(1), OVERALL_IMPROVEMENT_LABELS[row.overall.status]])];
  return new Response(`\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}`, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="coaching-improvement.csv"', "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}
