import { adminTeamsCsv } from "@/admin/teams-csv";
import {
  listAdminTeamsDirectory,
  resolveAdminTeamDirectoryFilters,
} from "@/admin/teams";
import { getCurrentUser } from "@/auth/session";

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
  if (actor.role !== "admin") return privateResponse("Forbidden", 403);

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = resolveAdminTeamDirectoryFilters(params);
  const data = await listAdminTeamsDirectory(actor, filters, { allRows: true });
  return new Response(`\uFEFF${adminTeamsCsv(data.rows)}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="teams.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
