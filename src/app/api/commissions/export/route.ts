import { getCurrentUser } from "@/auth/session";
import { commissionsCsv, safeCommissionFilename } from "@/commissions/csv";
import { getCommissionReport } from "@/commissions/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (actor.role === "agent") return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const commissionMonth = url.searchParams.get("commissionMonth")?.trim() || undefined;
  const teamId = url.searchParams.get("team")?.trim() || undefined;

  try {
    const report = await getCommissionReport(actor, {
      commissionMonth,
      teamId,
      purpose: "export",
    });
    if (report.status === "source_unavailable" || report.stale) {
      return new Response("Closed source unavailable", {
        status: 503,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }
    const teamName = report.selectedTeamId
      ? report.teams.find((team) => team.id === report.selectedTeamId)?.name
      : actor.role === "manager" && report.teams.length === 1
        ? report.teams[0].name
        : null;
    const fileName = safeCommissionFilename(report.month.key, teamName);
    return new Response(`\uFEFF${commissionsCsv(report.rows)}`, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RangeError) return new Response("Invalid commission month", { status: 400 });
    if (error instanceof Error && error.message === "Forbidden") {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}
