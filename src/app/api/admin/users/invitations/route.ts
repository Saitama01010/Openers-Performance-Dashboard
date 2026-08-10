import { bulkSendInvitations } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";
import { parseJsonBody, uuidSchema } from "@/http/input";
import { z } from "zod";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;
const bodySchema = z.object({ userIds: z.array(uuidSchema).min(1).max(100) }).strict();

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const body = await parseJsonBody(request, bodySchema, 8 * 1024);
    const outcomes = await bulkSendInvitations(actor, body.userIds);
    return Response.json(
      {
        selected: outcomes.length,
        sent: outcomes.filter((outcome) => outcome.status === "sent").length,
        skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
        failed: outcomes.filter((outcome) => outcome.status === "failed").length,
        outcomes,
      },
      { headers: HEADERS },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Untrusted request origin."
        ? error.message
        : "Invitations failed.";
    return Response.json(
      { error: message },
      { status: message === "Untrusted request origin." ? 403 : 400, headers: HEADERS },
    );
  }
}
