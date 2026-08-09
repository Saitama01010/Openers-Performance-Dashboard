import { z } from "zod";

import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { consumeRateLimit } from "@/auth/rate-limit";
import { getCurrentUser } from "@/auth/session";
import { retryFailedEmail } from "@/email/outbox";

const paramsSchema = z.object({ messageId: z.string().uuid() }).strict();
const HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const { messageId } = paramsSchema.parse(await context.params);
    const limit = await consumeRateLimit({
      scope: "email-outbox-admin-retry",
      identifier: `${actor.id}:${messageId}`,
      limit: 10,
      windowMs: 60 * 60 * 1_000,
    });
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { ...HEADERS, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    await retryFailedEmail(actor, messageId);
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (error) {
    const origin = error instanceof Error && error.message === "Untrusted request origin.";
    const notFound = error instanceof Error && error.message === "Email message was not found.";
    return Response.json(
      { error: origin ? "Untrusted request origin." : notFound ? "Email message was not found." : "Invalid email retry request." },
      { status: origin ? 403 : notFound ? 404 : 400, headers: HEADERS },
    );
  }
}
