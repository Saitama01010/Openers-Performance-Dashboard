import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { profiles, sessions, teamMemberships, teams } from "@/db/schema";
import { hashOpaqueToken } from "@/auth/security";
import { getEnv } from "@/env";

export const SESSION_COOKIE_NAME = "op_session";

function hashToken(token: string) {
  return hashOpaqueToken(token);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionIdFromToken(token: string) {
  return hashToken(token);
}

export function safeTokenEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function isSessionUsableAt(
  session: { expiresAt: Date; lastSeenAt: Date },
  now: Date,
  idleMinutes: number,
) {
  return (
    session.expiresAt.getTime() > now.getTime() &&
    session.lastSeenAt.getTime() + idleMinutes * 60 * 1_000 > now.getTime()
  );
}

type SessionProfile = Pick<typeof profiles.$inferSelect, "id" | "role">;

export async function createSessionRecord(profile: SessionProfile) {
  const token = createSessionToken();
  const env = getEnv();
  const lifetimeHours =
    profile.role === "admin"
      ? env.ADMIN_SESSION_ABSOLUTE_HOURS
      : env.SESSION_ABSOLUTE_HOURS;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * lifetimeHours);

  await getDb().insert(sessions).values({
    id: sessionIdFromToken(token),
    profileId: profile.id,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function createSession(profile: SessionProfile) {
  const cookieStorePromise = cookies();
  const { token, expiresAt } = await createSessionRecord(profile);

  const cookieStore = await cookieStorePromise;
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await getDb().delete(sessions).where(eq(sessions.id, sessionIdFromToken(token)));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function revokeAllSessions(profileId: string) {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.profileId, profileId), isNull(sessions.revokedAt)));
}

export async function getCurrentSessionId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return token ? sessionIdFromToken(token) : null;
}

export async function getSessionUser(token: string) {
  const sessionRows = await getDb()
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      active: profiles.active,
      accountStatus: profiles.accountStatus,
      organizationId: profiles.organizationId,
      teamId: teams.id,
    })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.profileId))
    .leftJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, profiles.id),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .leftJoin(
      teams,
      and(
        eq(teams.id, teamMemberships.teamId),
        eq(teams.active, true),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
        eq(teams.organizationId, profiles.organizationId),
      ),
    )
    .where(
      and(
        eq(sessions.id, sessionIdFromToken(token)),
        isNull(sessions.revokedAt),
      ),
    );
  const session = sessionRows[0];

  const now = Date.now();
  if (
    !session ||
    !isSessionUsableAt(session, new Date(now), getEnv().SESSION_IDLE_MINUTES)
  ) {
    if (session) {
      await getDb()
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, session.sessionId), isNull(sessions.revokedAt)));
    }
    return null;
  }

  if (session.lastSeenAt.getTime() <= now - 5 * 60 * 1000) {
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(
        and(
          eq(sessions.id, session.sessionId),
          isNull(sessions.revokedAt),
          lt(sessions.lastSeenAt, new Date(now - 5 * 60 * 1000)),
        ),
      );
  }

  if (!session.email || !session.active || session.accountStatus !== "active") {
    return null;
  }

  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    teamIds: sessionRows.flatMap((row) => (row.teamId ? [row.teamId] : [])),
    organizationId: session.organizationId,
  };
}

async function getCurrentUserUncached() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return token ? getSessionUser(token) : null;
}

export const getCurrentUser = cache(getCurrentUserUncached);
