import { permanentlyDeleteUser } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const { userId } = await context.params;
    const body = (await request.json()) as { confirmationEmail?: unknown };
    if (typeof body.confirmationEmail !== "string") {
      throw new Error("Type the user's email address to confirm deletion.");
    }
    await permanentlyDeleteUser(actor, {
      userId,
      confirmationEmail: body.confirmationEmail,
    });
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "User deletion failed." },
      { status: 400, headers: HEADERS },
    );
  }
}
