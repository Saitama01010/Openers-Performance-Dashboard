import {
  regenerateTemporaryPassword,
  revealTemporaryPassword,
} from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { consumeRateLimit } from "@/auth/rate-limit";
import { getCurrentUser } from "@/auth/session";
import { z } from "zod";
import { parseJsonBody } from "@/http/input";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const paramsSchema = z.object({ userId: z.string().uuid() }).strict();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reveal") }).strict(),
  z.object({
    action: z.literal("regenerate"),
    reason: z.string().trim().min(8).max(500),
  }).strict(),
]);

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
    const { userId } = paramsSchema.parse(await context.params);
    const body = await parseJsonBody(request, bodySchema, 2_048);
    const rateLimit = await consumeRateLimit({
      scope: `temporary-password-${body.action}`,
      identifier: `${actor.id}:${userId}`,
      limit: body.action === "reveal" ? 10 : 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    if (body.action === "regenerate") {
      await regenerateTemporaryPassword(actor, userId, body.reason);
      return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
    }
    const password = await revealTemporaryPassword(actor, userId);
    return Response.json({ password }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const untrustedOrigin =
      error instanceof Error && error.message === "Untrusted request origin.";
    return Response.json(
      {
        error:
          untrustedOrigin
            ? "Untrusted request origin."
            : error instanceof z.ZodError
            ? "Invalid temporary-password request."
            : error instanceof SyntaxError
              ? "Invalid temporary-password request."
              : error instanceof Error && [
                  "Temporary password is no longer available.",
                  "Provide a reason between 8 and 500 characters.",
                ].includes(error.message)
                ? error.message
                : "Temporary password is unavailable.",
      },
      { status: untrustedOrigin ? 403 : 400, headers: NO_STORE_HEADERS },
    );
  }
}
