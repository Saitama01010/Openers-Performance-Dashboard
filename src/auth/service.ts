import "server-only";

import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";

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
const LINK_NO_LONGER_VALID = "This link is no longer valid. Request a new link.";
const INVITATION_ALREADY_USED = "This invitation link is invalid or has already been used.";
const RESET_ALREADY_USED = "This reset link is invalid or has already been used.";
const PASSWORD_REUSE_ERROR = "Your new password must be different from your current password.";

export type TokenInspectionStatus =
  | "valid"
  | "used"
  | "revoked"
  | "expired"
  | "invalid"
  | "superseded"
  | "account_not_eligible";

function isExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

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

  if (
    !profile ||
    !profile.email ||
    !(
      (profile.accountStatus === "active" &&
        profile.passwordState === "temporary") ||
      (profile.accountStatus === "invited" && !profile.passwordHash)
    )
  ) {
    throw new Error("User cannot be invited.");
  }
  const recipientEmail = profile.email;

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
      email: recipientEmail,
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
      recipientEmail,
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
        recipientEmail,
        status: "failed",
        errorMessage: message,
      });
    });
  }

  return { expiresAt };
}

export async function inspectInvitationToken(
  token: string,
): Promise<{ status: TokenInspectionStatus }> {
  if (!token) return { status: "invalid" };

  const now = new Date();
  const tokenHash = hashOpaqueToken(token);
  const tokenRows = await getDb()
    .select()
    .from(accountInvitationTokens)
    .where(eq(accountInvitationTokens.tokenHash, tokenHash))
    .limit(1);
  const invitation = tokenRows[0];

  if (!invitation) return { status: "invalid" };
  if (invitation.usedAt) return { status: "used" };
  if (invitation.revokedAt || invitation.deliveryStatus === "revoked") {
    return { status: "revoked" };
  }
  if (isExpired(invitation.expiresAt, now)) return { status: "expired" };

  const profileRows = await getDb()
    .select({
      id: profiles.id,
      accountStatus: profiles.accountStatus,
      active: profiles.active,
      passwordHash: profiles.passwordHash,
      passwordState: profiles.passwordState,
    })
    .from(profiles)
    .where(eq(profiles.id, invitation.profileId))
    .limit(1);
  const profile = profileRows[0];

  if (
    !profile ||
    !(
      (profile.accountStatus === "active" &&
        profile.passwordState === "temporary") ||
      (profile.accountStatus === "invited" && !profile.passwordHash)
    )
  ) {
    return { status: "account_not_eligible" };
  }

  const newestRows = await getDb()
    .select({ id: accountInvitationTokens.id })
    .from(accountInvitationTokens)
    .where(
      and(
        eq(accountInvitationTokens.profileId, invitation.profileId),
        isNull(accountInvitationTokens.usedAt),
        isNull(accountInvitationTokens.revokedAt),
        gt(accountInvitationTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(accountInvitationTokens.createdAt))
    .limit(1);

  return { status: newestRows[0]?.id === invitation.id ? "valid" : "superseded" };
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

    if (!invitation) return "invalid";

    const newestRows = await tx
      .select({ id: accountInvitationTokens.id })
      .from(accountInvitationTokens)
      .where(
        and(
          eq(accountInvitationTokens.profileId, invitation.profileId),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
          gt(accountInvitationTokens.expiresAt, now),
        ),
      )
      .orderBy(desc(accountInvitationTokens.createdAt))
      .limit(1)
      .for("update");

    if (newestRows[0]?.id !== invitation.id) return "superseded";

    const profileRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, invitation.profileId))
      .limit(1)
      .for("update");
    const profile = profileRows[0];

    if (
      !profile ||
      !(
        (profile.accountStatus === "active" &&
          profile.passwordState === "temporary") ||
        (profile.accountStatus === "invited" && !profile.passwordHash)
      )
    ) {
      return "invalid";
    }

    if (profile.passwordHash && (await verifyPassword(input.password, profile.passwordHash))) {
      return "password_reused";
    }

    await tx
      .update(profiles)
      .set({
        passwordHash,
        passwordState: "permanent",
        encryptedTemporaryPassword: null,
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
    await tx
      .update(accountInvitationTokens)
      .set({ revokedAt: now, deliveryStatus: "revoked" })
      .where(
        and(
          eq(accountInvitationTokens.profileId, profile.id),
          ne(accountInvitationTokens.id, invitation.id),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
        ),
      );
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
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.profileId, profile.id), isNull(sessions.revokedAt)));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: profile.id,
      action: "user.password_created",
      entityType: "profile",
      entityId: profile.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: profile.id,
      action: "user.temporary_password_cleared",
      entityType: "profile",
      entityId: profile.id,
    });
    return "accepted";
  });

  if (result === "accepted") return { ok: true } as const;
  if (result === "password_reused") {
    return { ok: false, error: PASSWORD_REUSE_ERROR } as const;
  }
  if (result === "superseded") {
    return { ok: false, error: LINK_NO_LONGER_VALID } as const;
  }
  return { ok: false, error: INVITATION_ALREADY_USED } as const;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const profileRows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);
  const profile = profileRows[0];

  if (
    !profile ||
    !profile.email ||
    profile.accountStatus !== "active" ||
    !profile.active
  ) {
    return;
  }

  const now = new Date();
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

export async function inspectPasswordResetToken(
  token: string,
): Promise<{ status: TokenInspectionStatus }> {
  if (!token) return { status: "invalid" };

  const now = new Date();
  const tokenHash = hashOpaqueToken(token);
  const tokenRows = await getDb()
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  const resetToken = tokenRows[0];

  if (!resetToken) return { status: "invalid" };
  if (resetToken.usedAt) return { status: "used" };
  if (resetToken.revokedAt) return { status: "revoked" };
  if (isExpired(resetToken.expiresAt, now)) return { status: "expired" };

  const profileRows = await getDb()
    .select({
      id: profiles.id,
      accountStatus: profiles.accountStatus,
      active: profiles.active,
    })
    .from(profiles)
    .where(eq(profiles.id, resetToken.profileId))
    .limit(1);
  const profile = profileRows[0];

  if (!profile || profile.accountStatus !== "active" || !profile.active) {
    return { status: "account_not_eligible" };
  }

  const newestRows = await getDb()
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.profileId, resetToken.profileId),
        isNull(passwordResetTokens.usedAt),
        isNull(passwordResetTokens.revokedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);

  return { status: newestRows[0]?.id === resetToken.id ? "valid" : "superseded" };
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

    if (!resetToken) return "invalid";

    const newestRows = await tx
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.profileId, resetToken.profileId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1)
      .for("update");

    if (newestRows[0]?.id !== resetToken.id) return "superseded";

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

    if (!currentProfile || !currentProfile.email) return "invalid";
    if (
      currentProfile.passwordHash &&
      (await verifyPassword(input.password, currentProfile.passwordHash))
    ) {
      return "password_reused";
    }

    await tx
      .update(profiles)
      .set({
        passwordHash,
        passwordState: "permanent",
        encryptedTemporaryPassword: null,
        mustResetPassword: false,
        passwordChangedAt: now,
      })
      .where(eq(profiles.id, currentProfile.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, resetToken.id));
    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.profileId, currentProfile.id),
          ne(passwordResetTokens.id, resetToken.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
    await tx
      .update(accountInvitationTokens)
      .set({ revokedAt: now, deliveryStatus: "revoked" })
      .where(
        and(
          eq(accountInvitationTokens.profileId, currentProfile.id),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
        ),
      );
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.profileId, currentProfile.id), isNull(sessions.revokedAt)));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: currentProfile.id,
      action: "user.password_created",
      entityType: "profile",
      entityId: currentProfile.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: currentProfile.id,
      action: "user.temporary_password_cleared",
      entityType: "profile",
      entityId: currentProfile.id,
    });
    return { ...currentProfile, email: currentProfile.email };
  });

  if (profile === "password_reused") {
    return { ok: false, error: PASSWORD_REUSE_ERROR } as const;
  }
  if (profile === "superseded") {
    return { ok: false, error: LINK_NO_LONGER_VALID } as const;
  }
  if (profile === "invalid") {
    return { ok: false, error: RESET_ALREADY_USED } as const;
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
