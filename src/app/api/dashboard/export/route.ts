import { getCurrentUser } from "@/auth/session";
import { assertDashboardExportAccess } from "@/auth/feature-access";
import { companyDashboardCsv, teamDashboardCsv } from "@/dashboard/csv";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getRoleDashboardData } from "@/dashboard/role-data";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  try {
    await assertDashboardExportAccess(actor);
    const url = new URL(request.url);
    const dateRange = resolveOverviewDateRange(
      {
        range: url.searchParams.get("range") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      },
      new Date(),
      getEnv().GOOGLE_SHEETS_TIMEZONE,
    );
    const requestedTeamId = url.searchParams.get("teamId") || undefined;
    if (actor.role === "manager" && requestedTeamId && !actor.teamIds.includes(requestedTeamId)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (actor.role === "admin" && !requestedTeamId) {
      const result = await getRoleDashboardData(actor, { dateRange });
      if (result.role !== "admin") throw new Error("Unexpected dashboard role.");
      return csvResponse(companyDashboardCsv(result.data.teamComparison), "company-dashboard.csv");
    }
    const managerViewActor = {
      ...actor,
      role: "manager" as const,
      teamIds: requestedTeamId ? [requestedTeamId] : actor.teamIds,
    };
    const result = await getRoleDashboardData(managerViewActor, { dateRange });
    if (result.role !== "manager") throw new Error("Unexpected dashboard role.");
    return csvResponse(teamDashboardCsv(result.data.rows.map((row) => ({
      ...row,
      transfers: row.exportPeriod.transfers,
      closedDeals: row.exportPeriod.closedDeals,
      conversion: row.exportPeriod.conversion,
      targetProgress: row.monthTargetProgress,
    }))), "team-dashboard.csv");
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

function csvResponse(csv: string, filename: string) {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
