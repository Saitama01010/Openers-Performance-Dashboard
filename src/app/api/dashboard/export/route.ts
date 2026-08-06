import { getCurrentUser } from "@/auth/session";
import { companyDashboardCsv, teamDashboardCsv } from "@/dashboard/csv";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { authorizeDashboardExport } from "@/dashboard/export-access";
import { getRoleDashboardData } from "@/dashboard/role-data";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionActor = await getCurrentUser();
  if (!sessionActor) return errorResponse("Unauthorized", 401);
  try {
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
    const actor = await authorizeDashboardExport(sessionActor, requestedTeamId);
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
      return errorResponse("Forbidden", 403);
    }
    throw error;
  }
}

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
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
