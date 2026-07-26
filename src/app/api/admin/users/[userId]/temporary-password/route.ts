import {
  regenerateTemporaryPassword,
  revealTemporaryPassword,
} from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) {
    return Response.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE_HEADERS });
  }
  if (actor.role !== "admin") {
    return Response.json({ error: "Administrator access required." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    assertTrustedMutationOrigin(request);
    const { userId } = await context.params;
    const body = (await request.json()) as { action?: unknown };

    if (body.action === "regenerate") {
      await regenerateTemporaryPassword(actor, userId);
      return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
    }
    if (body.action !== "reveal") {
      return Response.json({ error: "Unsupported action." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const password = await revealTemporaryPassword(actor, userId);
    return Response.json({ password }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Temporary password is unavailable.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
