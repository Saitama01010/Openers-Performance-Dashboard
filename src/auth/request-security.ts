import "server-only";

import { getEnv } from "@/env";

export function assertTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const originHost = new URL(origin).host;
  const appHost = new URL(getEnv().APP_URL).host;

  if (originHost !== requestHost && originHost !== appHost) {
    throw new Error("Untrusted request origin.");
  }
}
