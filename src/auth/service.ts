import "server-only";

import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  passwordResetTokens,
  profiles,
  sessions,
} from "@/db/schema";
import { getEnv } from "@/env";
import { enqueueEmailOutbox } from "@/email/outbox";
import { newId } from "@/lib/ids";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/auth/password";
import {
  MAX_PASSWORD_LENGTH,
  canAuthenticate,
  createOpaqueToken,
  hashOpaqueToken,
  isValidOpaqueToken,
  normalizeEmail,
  validatePassword,
} from "@/auth/security";
import type { Actor } from "@/auth/authorization";
import { consumeRateLimit } from "@/auth/rate-limit";
import { actorOrganizationId } from "@/teams/visibility";

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

export async function authenticateCredentials(email: string, password: string) {
  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizeEmail(email)))
    .limit(1);
  const profile = rows[0];

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: INVALID_CREDENTIALS } as const;
  }

  const passwordMatches = await verifyPassword(
    password,
    profile?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!profile?.passwordHash || !passwordMatches) {
    return { ok: false, error: INVALID_CREDENTIALS } as const;
  }

  const policy = canAuthenticate(profile);

  if (!policy.allowed) {
    if (policy.reason === "reset_required") {
      return {
        ok: true,
        profile,
        requiresPasswordChange: true,
      } as const;
    }
    return { ok: false, error: INVALID_CREDENTIALS } as const;
  }

  await getDb()
    .update(profiles)
    .set({ lastLoginAt: new Date() })
    .where(eq(profiles.id, profile.id));

  return { ok: true, profile, requiresPasswordChange: false } as const;
}

export async function issueRequiredPasswordChangeToken(profileId: string) {
  const now = new Date();
  const token = createOpaqueToken();
  const tokenId = newId();
  const expiresAt = new Date(
    now.getTime() + getEnv().PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );

  await getDb().transaction(async (tx) => {
    const [profile] = await tx
      .select({
        id: profiles.id,
        active: profiles.active,
        accountStatus: profiles.accountStatus,
        mustResetPassword: profiles.mustResetPassword,
      })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1)
      .for("update");
    if (
      !profile ||
      !profile.active ||
      profile.accountStatus !== "active" ||
      !profile.mustResetPassword
    ) {
      throw new Error(INVALID_CREDENTIALS);
    }
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
      action: "user.required_password_change_started",
      entityType: "profile",
      entityId: profile.id,
    });
  });

  return token;
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
    .where(and(
      eq(profiles.id, input.profileId),
      eq(profiles.organizationId, actorOrganizationId(input.actor)),
    ))
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
    await enqueueEmailOutbox(tx, {
      organizationId: actorOrganizationId(input.actor),
      profileId: profile.id,
      referenceId: tokenId,
      recipientEmail,
      messageType:
        pendingInvitations.length > 0
          ? "account_invitation_resent"
          : "account_invitation",
      idempotencyKey: `account_invitation:${tokenId}`,
      payload: {
        kind: "account_invitation",
        name: profile.name,
        token,
        tokenId,
        resent: pendingInvitations.length > 0,
      },
    });
  });

  return { expiresAt };
}

export async function inspectInvitationToken(
  token: string,
): Promise<{ status: TokenInspectionStatus }> {
  if (!isValidOpaqueToken(token)) return { status: "invalid" };
  const inspectionLimit = await consumeRateLimit({
    scope: "invitation-inspection-token-15m",
    identifier: token,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!inspectionLimit.allowed) return { status: "invalid" };

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
  if (!isValidOpaqueToken(input.token)) {
    return { ok: false, error: INVITATION_ALREADY_USED } as const;
  }
  const passwordErrors = validatePassword(input.password);

  if (passwordErrors.length > 0) {
    return { ok: false, error: passwordErrors.join(" ") } as const;
  }

  const now = new Date();
  const tokenHash = hashOpaqueToken(input.token);
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

    const passwordHash = await hashPassword(input.password);

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
  const recipientEmail = profile.email;

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
    await enqueueEmailOutbox(tx, {
      organizationId: profile.organizationId,
      profileId: profile.id,
      referenceId: tokenId,
      recipientEmail,
      messageType: "password_reset",
      idempotencyKey: `password_reset:${tokenId}`,
      payload: {
        kind: "password_reset",
        name: profile.name,
        token,
        tokenId,
      },
    });
  });
}

export async function inspectPasswordResetToken(
  token: string,
): Promise<{ status: TokenInspectionStatus }> {
  if (!isValidOpaqueToken(token)) return { status: "invalid" };
  const inspectionLimit = await consumeRateLimit({
    scope: "reset-inspection-token-15m",
    identifier: token,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!inspectionLimit.allowed) return { status: "invalid" };

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
  if (!isValidOpaqueToken(input.token)) {
    return { ok: false, error: RESET_ALREADY_USED } as const;
  }
  const passwordErrors = validatePassword(input.password);

  if (passwordErrors.length > 0) {
    return { ok: false, error: passwordErrors.join(" ") } as const;
  }

  const now = new Date();
  const tokenHash = hashOpaqueToken(input.token);
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

    const passwordHash = await hashPassword(input.password);

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
    await enqueueEmailOutbox(tx, {
      organizationId: currentProfile.organizationId,
      profileId: currentProfile.id,
      referenceId: currentProfile.id,
      recipientEmail: currentProfile.email,
      messageType: "password_changed",
      idempotencyKey: `password_changed:${currentProfile.id}:${now.toISOString()}`,
      payload: { kind: "password_changed", name: currentProfile.name },
    });
    return "success";
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

  return { ok: true } as const;
}
