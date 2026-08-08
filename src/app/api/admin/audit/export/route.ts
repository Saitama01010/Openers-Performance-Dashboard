import { adminAuditCsv } from "@/admin/audit-csv";
import { listAdminAuditEvents, resolveAdminAuditFilters } from "@/admin/audit";
import { getCurrentUser } from "@/auth/session";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

function reply(message: string, status: number) {
  return new Response(message, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return reply("Unauthorized", 401);
  if (actor.role !== "admin") return reply("Forbidden", 403);
  const url = new URL(request.url);
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const filters = resolveAdminAuditFilters(Object.fromEntries(url.searchParams.entries()), new Date(), timeZone);
  const data = await listAdminAuditEvents(actor, filters, { allRows: true, timeZone });
  return new Response(`\uFEFF${adminAuditCsv(data.rows)}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
