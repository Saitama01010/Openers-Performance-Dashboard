import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { consumeRateLimit, consumeRateLimits } from "@/auth/rate-limit";
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

  it("increments every batched login policy and preserves independent limits", async () => {
    const account15m = `test-batch-account-15m-${newId()}`;
    const account1h = `test-batch-account-1h-${newId()}`;
    const client15m = `test-batch-client-15m-${newId()}`;
    scopes.push(account15m, account1h, client15m);
    const limits = [
      { scope: account15m, identifier: "person@example.test", limit: 1, windowMs: 60_000 },
      { scope: account1h, identifier: "person@example.test", limit: 2, windowMs: 60_000 },
      { scope: client15m, identifier: "client", limit: 2, windowMs: 60_000 },
    ];

    expect((await consumeRateLimits(limits)).map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
    ]);
    expect((await consumeRateLimits(limits)).map((result) => result.allowed)).toEqual([
      false,
      true,
      true,
    ]);
    expect((await consumeRateLimits(limits)).map((result) => result.allowed)).toEqual([
      false,
      false,
      false,
    ]);
  });
});
