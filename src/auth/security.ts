import { createHash, randomBytes } from "crypto";

export const TOKEN_TTL_MS = {
  invitation: 1000 * 60 * 60 * 48,
  passwordReset: 1000 * 60 * 30,
} as const;

export type AccountStatus =
  | "invited"
  | "active"
  | "deactivated"
  | "revoked";

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string) {
  const errors: string[] = [];

  if (password.length < 12) errors.push("Use at least 12 characters.");
  if (!/[a-z]/.test(password)) errors.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Include an uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Include a symbol.");

  return errors;
}

export function canAuthenticate(profile: {
  active: boolean;
  accountStatus: AccountStatus;
  passwordHash: string | null;
  mustResetPassword: boolean;
}) {
  if (!profile.active || profile.accountStatus !== "active") {
    return { allowed: false, reason: "inactive" } as const;
  }

  if (!profile.passwordHash) {
    return { allowed: false, reason: "no_password" } as const;
  }

  if (profile.mustResetPassword) {
    return { allowed: false, reason: "reset_required" } as const;
  }

  return { allowed: true, reason: null } as const;
}

export function tokenCanBeUsed(token: {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}, now = new Date()) {
  return !token.usedAt && !token.revokedAt && token.expiresAt.getTime() > now.getTime();
}
