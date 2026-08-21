import "server-only";

import { and, eq, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitRecords } from "@/db/schema";
import { newId } from "@/lib/ids";
import { hashOpaqueToken } from "@/auth/security";

export type RateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

type PreparedRateLimit = RateLimitInput & {
  now: Date;
  windowStartedAt: Date;
  expiresAt: Date;
  identifierHash: string;
};

function prepareRateLimit(input: RateLimitInput): PreparedRateLimit {
  const now = input.now ?? new Date();
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / input.windowMs) * input.windowMs,
  );

  return {
    ...input,
    now,
    windowStartedAt,
    expiresAt: new Date(windowStartedAt.getTime() + input.windowMs * 2),
    identifierHash: hashOpaqueToken(input.identifier),
  };
}

function rateLimitKey(input: {
  scope: string;
  identifierHash: string;
  windowStartedAt: Date;
}) {
  return `${input.scope}\u0000${input.identifierHash}\u0000${input.windowStartedAt.getTime()}`;
}

export async function consumeRateLimits(inputs: RateLimitInput[]) {
  if (inputs.length === 0) return [];

  const prepared = inputs.map(prepareRateLimit);
  const rows = await getDb().transaction(async (tx) => {
    // A single ordered upsert keeps every policy dimension durable while
    // avoiding one connection and transaction per limit. The unique key still
    // serializes concurrent increments for each independent window.
    await tx
      .insert(rateLimitRecords)
      .values(
        prepared.map((input) => ({
          id: newId(),
          scope: input.scope,
          identifierHash: input.identifierHash,
          windowStartedAt: input.windowStartedAt,
          expiresAt: input.expiresAt,
        })),
      )
      .onDuplicateKeyUpdate({
        set: {
          requestCount: sql`${rateLimitRecords.requestCount} + 1`,
        },
      });

    return tx
      .select({
        scope: rateLimitRecords.scope,
        identifierHash: rateLimitRecords.identifierHash,
        windowStartedAt: rateLimitRecords.windowStartedAt,
        requestCount: rateLimitRecords.requestCount,
      })
      .from(rateLimitRecords)
      .where(
        or(
          ...prepared.map((input) =>
            and(
              eq(rateLimitRecords.scope, input.scope),
              eq(rateLimitRecords.identifierHash, input.identifierHash),
              eq(rateLimitRecords.windowStartedAt, input.windowStartedAt),
            ),
          ),
        ),
      );
  });

  const counts = new Map(
    rows.map((row) => [rateLimitKey(row), row.requestCount]),
  );

  return prepared.map((input) => {
    const requestCount = counts.get(rateLimitKey(input)) ?? input.limit + 1;
    return {
      allowed: requestCount <= input.limit,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (input.windowStartedAt.getTime() + input.windowMs - input.now.getTime()) /
            1000,
        ),
      ),
    };
  });
}

export async function consumeRateLimit(input: RateLimitInput) {
  const [result] = await consumeRateLimits([input]);

  return result;
}

export async function cleanupExpiredRateLimits(now = new Date()) {
  await getDb()
    .delete(rateLimitRecords)
    .where(lt(rateLimitRecords.expiresAt, now));
}
