import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  emailDeliveryAttempts,
  passwordResetTokens,
  profiles,
  sessions,
} from "@/db/schema";
import { getEnv } from "@/env";
import { sendInvitationEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "@/email/provider";
import { newId } from "@/lib/ids";
import { hashPassword, verifyPassword } from "@/auth/password";
import {
  canAuthenticate,
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
  validatePassword,
} from "@/auth/security";
import type { Actor } from "@/auth/authorization";

const INVALID_CREDENTIALS = "Invalid email or password.";

async function recordEmailAttempt(input: {
  profileId?: string;
  tokenId?: string;
  messageType: string;
  recipientEmail: string;
  provider: string;
  ok: boolean;
  acceptedAt?: Date | null;
  providerMessageId?: string | null;
  error?: string;
}) {
  await getDb().insert(emailDeliveryAttempts).values({
    id: newId(),
    profileId: input.profileId,
    tokenId: input.tokenId,
    messageType: input.messageType,
    provider: input.provider,
    recipientEmail: input.recipientEmail,
    status: input.ok ? "accepted" : "failed",
    providerMessageId: input.providerMessageId,
    acceptedAt: input.acceptedAt,
    errorMessage: input.error,
  });
}

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
  const tokenId = newId();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + getEnv().INVITATION_TTL_HOURS * 60 * 60 * 1000,
  );

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
      id: tokenId,
      profileId: profile.id,
      tokenHash: hashOpaqueToken(token),
      createdById: input.actor.id,
      deliveryStatus: "pending",
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

  try {
    const result = await sendInvitationEmail({
      email: profile.email,
      name: profile.name,
      token,
      tokenId,
      resent: pendingInvitations.length > 0,
    });
    await recordEmailAttempt({
      profileId: profile.id,
      tokenId,
      messageType:
        pendingInvitations.length > 0
          ? "account_invitation_resent"
          : "account_invitation",
      recipientEmail: profile.email,
      provider: result.provider,
      ok: true,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    await getDb().transaction(async (tx) => {
      await tx
        .update(accountInvitationTokens)
        .set({ deliveryStatus: "delivery_failed" })
        .where(eq(accountInvitationTokens.id, tokenId));
      await tx.insert(emailDeliveryAttempts).values({
        id: newId(),
        profileId: profile.id,
        tokenId,
        messageType:
          pendingInvitations.length > 0
            ? "account_invitation_resent"
            : "account_invitation",
        provider: getEnv().EMAIL_PROVIDER,
        recipientEmail: profile.email,
        status: "failed",
        errorMessage: message,
      });
    });
  }

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
        passwordChangedAt: now,
        accessRevokedAt: null,
      })
      .where(eq(profiles.id, profile.id));
    await tx
      .update(accountInvitationTokens)
      .set({ usedAt: now, deliveryStatus: "accepted" })
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

  const now = new Date();
  const activeResetRows = await getDb()
    .select({
      id: passwordResetTokens.id,
    })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.profileId, profile.id),
        isNull(passwordResetTokens.usedAt),
        isNull(passwordResetTokens.revokedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);

  if (activeResetRows[0]) {
    return;
  }

  const token = createOpaqueToken();
  const tokenId = newId();
  const expiresAt = new Date(
    now.getTime() + getEnv().PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );

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
      id: tokenId,
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

  try {
    const result = await sendPasswordResetEmail({
      email: profile.email,
      name: profile.name,
      token,
      tokenId,
    });
    await recordEmailAttempt({
      profileId: profile.id,
      tokenId,
      messageType: "password_reset",
      recipientEmail: profile.email,
      provider: result.provider,
      ok: true,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
    });
  } catch (error) {
    await recordEmailAttempt({
      profileId: profile.id,
      tokenId,
      messageType: "password_reset",
      recipientEmail: profile.email,
      provider: getEnv().EMAIL_PROVIDER,
      ok: false,
      error: error instanceof Error ? error.message : "Email delivery failed.",
    });
  }
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
      .set({ passwordHash, mustResetPassword: false, passwordChangedAt: now })
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

  try {
    const result = await sendPasswordChangedEmail({
      email: profile.email,
      name: profile.name,
    });
    await recordEmailAttempt({
      profileId: profile.id,
      messageType: "password_changed",
      recipientEmail: profile.email,
      provider: result.provider,
      ok: true,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
    });
  } catch (error) {
    await recordEmailAttempt({
      profileId: profile.id,
      messageType: "password_changed",
      recipientEmail: profile.email,
      provider: getEnv().EMAIL_PROVIDER,
      ok: false,
      error: error instanceof Error ? error.message : "Email delivery failed.",
    });
  }
  return { ok: true } as const;
}
