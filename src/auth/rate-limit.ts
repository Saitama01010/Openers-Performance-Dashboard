import "server-only";

import { and, eq, sql } from "drizzle-orm";

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

  await db
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

  const rows = await db
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

  return {
    allowed: (rows[0]?.requestCount ?? input.limit + 1) <= input.limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStartedAt.getTime() + input.windowMs - now.getTime()) / 1000),
    ),
  };
}
