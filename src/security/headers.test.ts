import { describe, expect, it } from "vitest";

import { productionSecurityHeaders } from "@/security/headers";

describe("production security headers", () => {
  it("sets transport, framing, content, referrer, permission, and isolation controls", () => {
    const headers = new Map(
      productionSecurityHeaders(true).map(({ key, value }) => [key, value]),
    );
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBeTruthy();
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("does not enable HSTS or forced HTTPS in development", () => {
    const headers = new Map(
      productionSecurityHeaders(false).map(({ key, value }) => [key, value]),
    );
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
  });
});
