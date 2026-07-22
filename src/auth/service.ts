import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  passwordResetTokens,
  profiles,
  sessions,
} from "@/db/schema";
import { sendInvitationEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "@/email/provider";
import { newId } from "@/lib/ids";
import { hashPassword, verifyPassword } from "@/auth/password";
import {
  TOKEN_TTL_MS,
  canAuthenticate,
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
  validatePassword,
} from "@/auth/security";
import type { Actor } from "@/auth/authorization";

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function authenticateCredentials(email: string, password: string) {
  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizeEmail(email)))
    .limit(1);
  const profile = rows[0];

  if (!profile?.passwordHash || !(await verifyPassword(password, profile.passwordHash))) {
    return { ok: false, error: INVALID_CREDENTIALS } as const;
  }

  const policy = canAuthenticate(profile);

  if (!policy.allowed) {
    return { ok: false, error: INVALID_CREDENTIALS } as const;
  }

  await getDb()
    .update(profiles)
    .set({ lastLoginAt: new Date() })
    .where(eq(profiles.id, profile.id));

  return { ok: true, profile } as const;
}

export async function issueInvitation(input: {
  actor: Actor;
  profileId: string;
}) {
  if (input.actor.role !== "admin") {
    throw new Error("Forbidden");
  }

  const profileRows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  const profile = profileRows[0];

  if (!profile || profile.accountStatus !== "invited") {
    throw new Error("User cannot be invited.");
  }

  const pendingInvitations = await getDb()
    .select({ id: accountInvitationTokens.id })
    .from(accountInvitationTokens)
    .where(
      and(
        eq(accountInvitationTokens.profileId, profile.id),
        isNull(accountInvitationTokens.usedAt),
        isNull(accountInvitationTokens.revokedAt),
      ),
    )
    .limit(1);

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS.invitation);

  await getDb().transaction(async (tx) => {
    await tx
      .update(accountInvitationTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accountInvitationTokens.profileId, profile.id),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
        ),
      );
    await tx.insert(accountInvitationTokens).values({
      id: newId(),
      profileId: profile.id,
      tokenHash: hashOpaqueToken(token),
      createdById: input.actor.id,
      expiresAt,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action:
        pendingInvitations.length > 0
          ? "user.invitation_resent"
          : "user.invitation_sent",
      entityType: "profile",
      entityId: profile.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  });

  await sendInvitationEmail({ email: profile.email, name: profile.name, token });
  return { expiresAt };
}

export async function acceptInvitation(input: {
  token: string;
  password: string;
}) {
  const passwordErrors = validatePassword(input.password);

  if (passwordErrors.length > 0) {
    return { ok: false, error: passwordErrors.join(" ") } as const;
  }

  const now = new Date();
  const tokenHash = hashOpaqueToken(input.token);
  const passwordHash = await hashPassword(input.password);
  const result = await getDb().transaction(async (tx) => {
    const tokenRows = await tx
      .select()
      .from(accountInvitationTokens)
      .where(
        and(
          eq(accountInvitationTokens.tokenHash, tokenHash),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
          gt(accountInvitationTokens.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");
    const invitation = tokenRows[0];

    if (!invitation) return null;

    const profileRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, invitation.profileId))
      .limit(1)
      .for("update");
    const profile = profileRows[0];

    if (!profile || profile.accountStatus !== "invited") return null;

    await tx
      .update(profiles)
      .set({
        passwordHash,
        active: true,
        accountStatus: "active",
        mustResetPassword: false,
        accessRevokedAt: null,
      })
      .where(eq(profiles.id, profile.id));
    await tx
      .update(accountInvitationTokens)
      .set({ usedAt: now })
      .where(eq(accountInvitationTokens.id, invitation.id));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: profile.id,
      action: "user.invitation_accepted",
      entityType: "profile",
      entityId: profile.id,
    });
    return profile;
  });

  return result
    ? ({ ok: true } as const)
    : ({ ok: false, error: "This invitation link is invalid or expired." } as const);
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const profileRows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);
  const profile = profileRows[0];

  if (!profile || profile.accountStatus !== "active" || !profile.active) {
    return;
  }

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS.passwordReset);

  await getDb().transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.profileId, profile.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
    await tx.insert(passwordResetTokens).values({
      id: newId(),
      profileId: profile.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: profile.id,
      action: "user.password_reset_requested",
      entityType: "profile",
      entityId: profile.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  });

  await sendPasswordResetEmail({ email: profile.email, name: profile.name, token });
}

export async function resetPassword(input: {
  token: string;
  password: string;
}) {
  const passwordErrors = validatePassword(input.password);

  if (passwordErrors.length > 0) {
    return { ok: false, error: passwordErrors.join(" ") } as const;
  }

  const now = new Date();
  const tokenHash = hashOpaqueToken(input.token);
  const passwordHash = await hashPassword(input.password);
  const profile = await getDb().transaction(async (tx) => {
    const tokenRows = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");
    const resetToken = tokenRows[0];

    if (!resetToken) return null;

    const profileRows = await tx
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.id, resetToken.profileId),
          eq(profiles.accountStatus, "active"),
          eq(profiles.active, true),
        ),
      )
      .limit(1)
      .for("update");
    const currentProfile = profileRows[0];

    if (!currentProfile) return null;

    await tx
      .update(profiles)
      .set({ passwordHash, mustResetPassword: false })
      .where(eq(profiles.id, currentProfile.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, resetToken.id));
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.profileId, currentProfile.id), isNull(sessions.revokedAt)));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: currentProfile.id,
      action: "user.password_reset_completed",
      entityType: "profile",
      entityId: currentProfile.id,
    });
    return currentProfile;
  });

  if (!profile) {
    return { ok: false, error: "This reset link is invalid or expired." } as const;
  }

  await sendPasswordChangedEmail({ email: profile.email, name: profile.name });
  return { ok: true } as const;
}
