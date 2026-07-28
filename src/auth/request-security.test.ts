import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { resetEnvForTests } from "@/env";

vi.mock("server-only", () => ({}));

const originalEnvironment = {
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

describe("trusted mutation origin validation", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://dashboard.example.test";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "mysql://root:root@localhost:3306/openers_test";
    process.env.SESSION_SECRET = "s".repeat(32);
    resetEnvForTests();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvForTests();
  });

  it("accepts the request host and configured application host", () => {
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("https://internal.example.test/api/admin/users/1", {
          headers: {
            Host: "internal.example.test",
            Origin: "https://internal.example.test",
          },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("https://internal.example.test/api/admin/users/1", {
          headers: {
            Host: "internal.example.test",
            Origin: "https://dashboard.example.test",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an unrelated origin", () => {
    expect(() =>
      assertTrustedMutationOrigin(
        new Request("https://dashboard.example.test/api/admin/users/1", {
          headers: {
            Host: "dashboard.example.test",
            Origin: "https://evil.example",
          },
        }),
      ),
    ).toThrow("Untrusted request origin.");
  });
});
