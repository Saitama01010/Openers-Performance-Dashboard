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

export async function createSession(profileId: string) {
  const token = createSessionToken();
  const [profile] = await getDb()
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw new Error("Authenticated profile is unavailable.");
  const env = getEnv();
  const lifetimeHours =
    profile.role === "admin"
      ? env.ADMIN_SESSION_ABSOLUTE_HOURS
      : env.SESSION_ABSOLUTE_HOURS;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * lifetimeHours);

  await getDb().insert(sessions).values({
    id: sessionIdFromToken(token),
    profileId,
    expiresAt,
  });

  const cookieStore = await cookies();
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

async function getCurrentUserUncached() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const sessionRows = await getDb()
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionIdFromToken(token)),
        isNull(sessions.revokedAt),
      ),
    )
    .limit(1);
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
        .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)));
    }
    return null;
  }

  if (session.lastSeenAt.getTime() <= now - 5 * 60 * 1000) {
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(
        and(
          eq(sessions.id, session.id),
          isNull(sessions.revokedAt),
          lt(sessions.lastSeenAt, new Date(now - 5 * 60 * 1000)),
        ),
      );
  }

  const userRows = await getDb()
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      active: profiles.active,
      accountStatus: profiles.accountStatus,
      organizationId: profiles.organizationId,
    })
    .from(profiles)
    .where(eq(profiles.id, session.profileId))
    .limit(1);
  const user = userRows[0];

  if (!user || !user.email || !user.active || user.accountStatus !== "active") {
    return null;
  }

  const memberships = await getDb()
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(teamMemberships.profileId, user.id),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
        eq(teams.active, true),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
        eq(teams.organizationId, user.organizationId),
      ),
    );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamIds: memberships.map((membership) => membership.teamId),
    organizationId: user.organizationId,
  };
}

export const getCurrentUser = cache(getCurrentUserUncached);
