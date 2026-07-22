import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { profiles, sessions, teamMemberships, teams } from "@/db/schema";
import { hashOpaqueToken } from "@/auth/security";

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

export async function createSession(profileId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

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

export async function getCurrentUser() {
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

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const userRows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, session.profileId))
    .limit(1);
  const user = userRows[0];

  if (!user || !user.active || user.accountStatus !== "active") {
    return null;
  }

  const memberships = await getDb()
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(teamMemberships.profileId, user.id),
        isNull(teamMemberships.endedAt),
        eq(teams.active, true),
      ),
    );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamIds: memberships.map((membership) => membership.teamId),
  };
}
