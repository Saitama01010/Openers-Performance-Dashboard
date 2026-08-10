import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { getEnv } from "@/env";

export function assertTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("Untrusted request origin.");

  const env = getEnv();
  const canonical = new URL(env.APP_URL);
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("Untrusted request origin.");
  }

  if (parsedOrigin.origin !== canonical.origin) {
    throw new Error("Untrusted request origin.");
  }

  if (request.headers.has("forwarded")) {
    throw new Error("Untrusted request origin.");
  }

  if (env.TRUSTED_PROXY_HEADERS) {
    const forwardedHost = singleHeaderValue(
      request.headers.get("x-forwarded-host"),
    );
    const forwardedProto = singleHeaderValue(
      request.headers.get("x-forwarded-proto"),
    );
    if (
      forwardedHost !== canonical.host ||
      forwardedProto !== canonical.protocol.slice(0, -1)
    ) {
      throw new Error("Untrusted request origin.");
    }
    return;
  }

  if (request.headers.get("host") !== canonical.host) {
    throw new Error("Untrusted request origin.");
  }
  if (
    request.headers.has("x-forwarded-host")
  ) {
    throw new Error("Untrusted request origin.");
  }
}

function singleHeaderValue(value: string | null) {
  if (!value || value.length > 255 || value.includes(",")) return null;
  return value.trim().toLocaleLowerCase("en-US");
}

function validIp(value: string) {
  return isIP(value) !== 0;
}

export function trustedClientFingerprint(headers: Headers) {
  const env = getEnv();
  let address = "unavailable";
  if (env.TRUSTED_PROXY_HEADERS) {
    const forwardedFor = headers.get("x-forwarded-for");
    const candidate = forwardedFor?.split(",", 1)[0]?.trim() ?? "";
    if (candidate.length <= 64 && validIp(candidate)) address = candidate;
  }
  const userAgent = (headers.get("user-agent") ?? "unknown").slice(0, 256);
  return createHash("sha256")
    .update(`${address}\n${userAgent}`)
    .digest("hex");
}
