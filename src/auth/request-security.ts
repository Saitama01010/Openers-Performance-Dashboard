import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { getEnv } from "@/env";

const LOCAL_DEVELOPMENT_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function localDevelopmentOriginMatches(
  request: Request,
  origin: URL,
  canonical: URL,
  nodeEnvironment: string,
  trustedProxyHeaders: boolean,
) {
  if (
    nodeEnvironment !== "development" ||
    trustedProxyHeaders ||
    canonical.protocol !== "http:" ||
    origin.protocol !== "http:" ||
    !LOCAL_DEVELOPMENT_HOSTS.has(canonical.hostname.toLocaleLowerCase("en-US")) ||
    !LOCAL_DEVELOPMENT_HOSTS.has(origin.hostname.toLocaleLowerCase("en-US"))
  ) {
    return false;
  }

  const host = request.headers.get("host");
  if (!host) return false;

  let requestOrigin: URL;
  try {
    requestOrigin = new URL(`http://${host}`);
  } catch {
    return false;
  }

  const forwardedHost = request.headers.has("x-forwarded-host")
    ? singleHeaderValue(request.headers.get("x-forwarded-host"))
    : requestOrigin.host;
  const forwardedProto = request.headers.has("x-forwarded-proto")
    ? singleHeaderValue(request.headers.get("x-forwarded-proto"))
    : requestOrigin.protocol.slice(0, -1);

  return (
    LOCAL_DEVELOPMENT_HOSTS.has(requestOrigin.hostname.toLocaleLowerCase("en-US")) &&
    requestOrigin.port === origin.port &&
    forwardedHost === requestOrigin.host.toLocaleLowerCase("en-US") &&
    forwardedProto === origin.protocol.slice(0, -1)
  );
}

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

  if (request.headers.has("forwarded")) {
    throw new Error("Untrusted request origin.");
  }

  const localDevelopmentOrigin = localDevelopmentOriginMatches(
    request,
    parsedOrigin,
    canonical,
    env.NODE_ENV,
    env.TRUSTED_PROXY_HEADERS,
  );
  if (localDevelopmentOrigin) {
    return;
  }

  if (parsedOrigin.origin !== canonical.origin) {
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
