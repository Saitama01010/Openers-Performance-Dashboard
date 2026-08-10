import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { consumeRateLimit } from "@/auth/rate-limit";
import { getDb } from "@/db";
import { rateLimitRecords } from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const scopes: string[] = [];

afterEach(async () => {
  for (const scope of scopes.splice(0)) {
    await getDb().delete(rateLimitRecords).where(eq(rateLimitRecords.scope, scope));
  }
});

describe("durable authentication rate limiting", () => {
  it("permits normal attempts and blocks attempts beyond the limit", async () => {
    const scope = `test-normal-${newId()}`;
    scopes.push(scope);

    expect((await consumeRateLimit({ scope, identifier: "person@example.test", limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    expect((await consumeRateLimit({ scope, identifier: "person@example.test", limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    expect((await consumeRateLimit({ scope, identifier: "person@example.test", limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    expect((await consumeRateLimit({ scope, identifier: "person@example.test", limit: 3, windowMs: 60_000 })).allowed).toBe(false);
  });

  it("cannot be bypassed by concurrent requests", async () => {
    const scope = `test-concurrent-${newId()}`;
    scopes.push(scope);

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeRateLimit({
          scope,
          identifier: "known-account@example.test",
          limit: 5,
          windowMs: 60_000,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(7);
  });
});
