import bcrypt from "bcryptjs";

import { MAX_PASSWORD_LENGTH } from "@/auth/security";

// Cost 12 hash for a fixed, non-secret value. It keeps the unknown-account
// path on the same expensive bcrypt code path without creating a credential.
export const DUMMY_PASSWORD_HASH =
  "$2b$12$4yP1bRzDBbxZ/C1sIO69/Oak2sP3PVyAZ4s8.wN6jVvVT4n2vT1Xu";

function assertPasswordLength(password: string) {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password input is too long.");
  }
}

export async function hashPassword(password: string) {
  assertPasswordLength(password);
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  assertPasswordLength(password);
  return bcrypt.compare(password, passwordHash);
}
