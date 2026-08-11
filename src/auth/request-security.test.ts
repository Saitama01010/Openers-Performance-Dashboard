import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTrustedMutationOrigin,
  trustedClientFingerprint,
} from "@/auth/request-security";
import { resetEnvForTests } from "@/env";

vi.mock("server-only", () => ({}));

const originalEnvironment = {
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DATABASE_ENVIRONMENT: process.env.DATABASE_ENVIRONMENT,
  DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT,
  NODE_ENV: process.env.NODE_ENV,
  TRUSTED_PROXY_HEADERS: process.env.TRUSTED_PROXY_HEADERS,
};

describe("trusted mutation origin validation", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://dashboard.example.test";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "mysql://root:root@localhost:3306/openers_test";
    process.env.SESSION_SECRET = "s".repeat(32);
    process.env.DATABASE_ENVIRONMENT = "test";
    process.env.DEPLOYMENT_ENVIRONMENT = "test";
    process.env.TRUSTED_PROXY_HEADERS = "false";
    resetEnvForTests();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvForTests();
  });

  it("accepts only the canonical origin and host without a trusted proxy", () => {
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("https://dashboard.example.test/api/admin/users/1", {
          headers: {
            Host: "dashboard.example.test",
            Origin: "https://dashboard.example.test",
          },
        }),
      ),
    ).not.toThrow();
    expect(
      trustedClientFingerprint(
        new Headers({ "User-Agent": "same", "X-Forwarded-For": "203.0.113.99" }),
      ),
    ).toBe(trustedClientFingerprint(new Headers({ "User-Agent": "same" })));
  });

  it.each([
    { Host: "dashboard.example.test", Origin: "https://evil.example" },
    { Host: "evil.example", Origin: "https://dashboard.example.test" },
    { Host: "dashboard.example.test" },
    { Host: "dashboard.example.test", Origin: "https://dashboard.example.test", "X-Forwarded-Host": "evil.example" },
    { Host: "dashboard.example.test", Origin: "https://dashboard.example.test", Forwarded: "host=evil.example;proto=https" },
  ] satisfies Array<Record<string, string>>)("rejects hostile or incomplete origin and host combinations", (headers) => {
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("https://dashboard.example.test/api/admin/users/1", {
          headers: headers as unknown as HeadersInit,
        }),
      ),
    ).toThrow("Untrusted request origin.");
  });

  it("accepts overwritten proxy headers only in the documented trusted mode", () => {
    process.env.TRUSTED_PROXY_HEADERS = "true";
    resetEnvForTests();
    const valid = new Request("http://internal:3000/api", {
      headers: {
        Host: "internal:3000",
        Origin: "https://dashboard.example.test",
        "X-Forwarded-Host": "dashboard.example.test",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
        "User-Agent": "test-agent",
      },
    });
    expect(() => assertTrustedMutationOrigin(valid)).not.toThrow();
    expect(trustedClientFingerprint(valid.headers)).not.toBe(
      trustedClientFingerprint(new Headers({ "User-Agent": "test-agent" })),
    );

    const forgedHost = new Request("http://internal:3000/api", {
      headers: {
        Origin: "https://dashboard.example.test",
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "https",
      },
    });
    expect(() => assertTrustedMutationOrigin(forgedHost)).toThrow();

    const forgedForwarded = new Request("http://internal:3000/api", {
      headers: {
        Origin: "https://dashboard.example.test",
        "X-Forwarded-Host": "dashboard.example.test",
        "X-Forwarded-Proto": "https",
        Forwarded: "for=203.0.113.11;host=evil.example",
      },
    });
    expect(() => assertTrustedMutationOrigin(forgedForwarded)).toThrow();
  });

  it("accepts the actual same-origin listener for loopback development servers", () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_ENVIRONMENT = "development";
    process.env.DEPLOYMENT_ENVIRONMENT = "development";
    Object.assign(process.env, { NODE_ENV: "development" });
    resetEnvForTests();

    expect(() =>
      assertTrustedMutationOrigin(
        new Request("http://127.0.0.1:3200/api/admin/users/import/preview", {
          headers: {
            Host: "127.0.0.1:3200",
            Origin: "http://localhost:3200",
            "X-Forwarded-Host": "127.0.0.1:3200",
            "X-Forwarded-Proto": "http",
          },
        }),
      ),
    ).not.toThrow();

    const hostileHeaders: Array<Record<string, string>> = [
      { Host: "127.0.0.1:3200", Origin: "http://localhost:3100" },
      { Host: "internal:3200", Origin: "http://localhost:3200" },
      {
        Host: "127.0.0.1:3200",
        Origin: "http://localhost:3200",
        "X-Forwarded-Host": "evil.example",
      },
      {
        Host: "127.0.0.1:3200",
        Origin: "http://localhost:3200",
        "X-Forwarded-Host": "127.0.0.1:3200",
        "X-Forwarded-Proto": "https",
      },
    ];
    for (const headers of hostileHeaders) {
      expect(() =>
        assertTrustedMutationOrigin(
          new Request("http://127.0.0.1:3200/api/admin/users/import/preview", {
            headers,
          }),
        ),
      ).toThrow("Untrusted request origin.");
    }

    process.env.DATABASE_ENVIRONMENT = "test";
    process.env.DEPLOYMENT_ENVIRONMENT = "test";
    Object.assign(process.env, { NODE_ENV: "test" });
    resetEnvForTests();
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("http://127.0.0.1:3200/api/admin/users/import/preview", {
          headers: {
            Host: "127.0.0.1:3200",
            Origin: "http://localhost:3200",
          },
        }),
      ),
    ).toThrow("Untrusted request origin.");
  });
});
