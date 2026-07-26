import { bulkSendInvitations } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const body = (await request.json()) as { userIds?: unknown };
    if (
      !Array.isArray(body.userIds) ||
      body.userIds.length === 0 ||
      body.userIds.some((id) => typeof id !== "string")
    ) {
      throw new Error("Select at least one user.");
    }
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
    return Response.json(
      { error: error instanceof Error ? error.message : "Invitations failed." },
      { status: 400, headers: HEADERS },
    );
  }
}
