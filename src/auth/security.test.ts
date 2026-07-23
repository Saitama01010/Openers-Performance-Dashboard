import { describe, expect, it } from "vitest";

import {
  canAuthenticate,
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
  tokenCanBeUsed,
  validatePassword,
} from "@/auth/security";

const activeProfile = {
  active: true,
  accountStatus: "active" as const,
  passwordHash: "hash",
  mustResetPassword: false,
};

describe("authentication security policy", () => {
  it("normalizes login email", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("requires a strong password", () => {
    expect(validatePassword("short")).toHaveLength(4);
    expect(validatePassword("StrongPass1!")).toEqual([]);
  });

  it("allows only active accounts with a password", () => {
    expect(canAuthenticate(activeProfile).allowed).toBe(true);
    expect(canAuthenticate({ ...activeProfile, accountStatus: "deactivated" }).allowed).toBe(false);
    expect(canAuthenticate({ ...activeProfile, accountStatus: "revoked" }).allowed).toBe(false);
    expect(canAuthenticate({ ...activeProfile, passwordHash: null }).allowed).toBe(false);
    expect(canAuthenticate({ ...activeProfile, mustResetPassword: true }).allowed).toBe(false);
  });

  it("creates opaque tokens and hashes them deterministically", () => {
    const token = createOpaqueToken();
    expect(token).not.toContain("=");
    expect(hashOpaqueToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("rejects expired, used, and revoked tokens", () => {
    const future = new Date("2030-01-01T00:00:00Z");
    const past = new Date("2020-01-01T00:00:00Z");
    const now = new Date("2025-01-01T00:00:00Z");
    expect(tokenCanBeUsed({ expiresAt: future, usedAt: null, revokedAt: null }, now)).toBe(true);
    expect(tokenCanBeUsed({ expiresAt: past, usedAt: null, revokedAt: null }, now)).toBe(false);
    expect(tokenCanBeUsed({ expiresAt: future, usedAt: now, revokedAt: null }, now)).toBe(false);
    expect(tokenCanBeUsed({ expiresAt: future, usedAt: null, revokedAt: now }, now)).toBe(false);
  });
});
