import "server-only";

import { consumeRateLimit } from "@/auth/rate-limit";
import { trustedClientFingerprint } from "@/auth/request-security";
import {
  inspectInvitationToken,
  inspectPasswordResetToken,
} from "@/auth/service";

export async function inspectTokenForRequest(input: {
  kind: "invitation" | "reset";
  token: string;
  headers: Headers;
}) {
  const clientLimit = await consumeRateLimit({
    scope: `${input.kind}-inspection-client-15m`,
    identifier: trustedClientFingerprint(input.headers),
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!clientLimit.allowed) return { status: "invalid" as const };
  return input.kind === "invitation"
    ? inspectInvitationToken(input.token)
    : inspectPasswordResetToken(input.token);
}
