import { getCurrentUser } from "@/auth/session";
import { getCoachingRoomData } from "@/coaching/data";
import { COACHING_CATEGORIES, COACHING_CATEGORY_LABELS, type CoachingCategory } from "@/coaching/domain";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

function csv(value: unknown) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function privateText(message: string, status: number) { return new Response(message, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }

export async function GET(request: Request) {
  const actor = await getCurrentUser(); if (!actor) return privateText("Unauthorized", 401); if (actor.role === "agent") return privateText("Forbidden", 403);
  const url = new URL(request.url); const params = Object.fromEntries(url.searchParams.entries());
  const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const requested = url.searchParams.get("category") ?? ""; const category = COACHING_CATEGORIES.includes(requested as CoachingCategory) ? requested as CoachingCategory : undefined;
  const data = await getCoachingRoomData(actor, { coachProfileId: url.searchParams.get("coach") || undefined, teamId: url.searchParams.get("team") || undefined, agentProfileId: url.searchParams.get("agent") || undefined, category, dateRange, page: 1, pageSize: 5000 });
  const rows = [["Session Date", "Coach", "Category", "Participants", "Participant Count", "Coaching Note", "Created"], ...data.rows.map((row) => [row.sessionDate, row.coachName, COACHING_CATEGORY_LABELS[row.category], row.participants.map((participant) => `${participant.name} (${participant.teamName})`).join("; "), row.participants.length, row.note ?? "", row.createdAt])];
  return new Response(`\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}`, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="coaching-sessions.csv"', "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}
