import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvForTests } from "@/env";
import { validatePassword } from "@/auth/security";

vi.mock("server-only", () => ({}));

describe("temporary password encryption", () => {
  beforeEach(() => {
    process.env.DATABASE_URL =
      "mysql://openers:openers_password@127.0.0.1:3306/openers_dashboard_test";
    process.env.DATABASE_ENVIRONMENT = "test";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    vi.stubEnv("NODE_ENV", "test");
    process.env.TEMP_PASSWORD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    resetEnvForTests();
  });

  it("generates a strong password and encrypts it with authenticated encryption", async () => {
    const {
      decryptTemporaryPassword,
      encryptTemporaryPassword,
      generateTemporaryPassword,
    } = await import("@/auth/temporary-password");
    const password = generateTemporaryPassword();
    const encrypted = encryptTemporaryPassword(password);

    expect(validatePassword(password)).toEqual([]);
    expect(encrypted).not.toContain(password);
    expect(encrypted).toMatch(/^v1\./);
    expect(decryptTemporaryPassword(encrypted)).toBe(password);
  });

  it("rejects tampered ciphertext without exposing secret material", async () => {
    const { decryptTemporaryPassword, encryptTemporaryPassword } = await import(
      "@/auth/temporary-password"
    );
    const encrypted = encryptTemporaryPassword("Aa7!temporary-password");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    const tampered = parts.join(".");

    expect(() => decryptTemporaryPassword(tampered)).toThrow(
      "Temporary password is unavailable.",
    );
  });
});
