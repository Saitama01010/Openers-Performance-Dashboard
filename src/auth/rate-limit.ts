import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitRecords } from "@/db/schema";
import { newId } from "@/lib/ids";
import { hashOpaqueToken } from "@/auth/security";

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / input.windowMs) * input.windowMs,
  );
  const expiresAt = new Date(windowStartedAt.getTime() + input.windowMs * 2);
  const identifierHash = hashOpaqueToken(input.identifier);
  const db = getDb();

  const requestCount = await db.transaction(async (tx) => {
    // The unique-key upsert acquires the row lock and the transaction retains
    // it through the read. Each concurrent caller therefore observes the
    // count produced by its own increment instead of a later caller's count.
    await tx
      .insert(rateLimitRecords)
      .values({
        id: newId(),
        scope: input.scope,
        identifierHash,
        windowStartedAt,
        expiresAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          requestCount: sql`${rateLimitRecords.requestCount} + 1`,
          expiresAt,
        },
      });

    const [row] = await tx
      .select({ requestCount: rateLimitRecords.requestCount })
      .from(rateLimitRecords)
      .where(
        and(
          eq(rateLimitRecords.scope, input.scope),
          eq(rateLimitRecords.identifierHash, identifierHash),
          eq(rateLimitRecords.windowStartedAt, windowStartedAt),
        ),
      )
      .limit(1);
    return row?.requestCount ?? input.limit + 1;
  });

  return {
    allowed: requestCount <= input.limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStartedAt.getTime() + input.windowMs - now.getTime()) / 1000),
    ),
  };
}

export async function cleanupExpiredRateLimits(now = new Date()) {
  await getDb()
    .delete(rateLimitRecords)
    .where(lt(rateLimitRecords.expiresAt, now));
}
