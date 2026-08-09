import { getAdminAuditEvent } from "@/admin/audit";
import { getCurrentUser } from "@/auth/session";
import { uuidSchema } from "@/http/input";

export const dynamic = "force-dynamic";

function reply(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return reply("Unauthorized", 401);
  if (actor.role !== "admin") return reply("Forbidden", 403);
  const { eventId } = await context.params;
  if (!uuidSchema.safeParse(eventId).success) return reply("Invalid event ID", 400);
  const event = await getAdminAuditEvent(actor, eventId);
  if (!event) return reply("Audit event not found", 404);
  return Response.json(event, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
