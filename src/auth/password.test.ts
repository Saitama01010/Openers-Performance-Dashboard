import { describe, expect, it } from "vitest";

import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@/auth/password";

describe("password hashing boundaries", () => {
  it("keeps the constant unknown-account hash valid for the bcrypt timing path", async () => {
    await expect(verifyPassword("not-the-password", DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });

  it("rejects password inputs before bcrypt when they exceed the maximum", async () => {
    await expect(hashPassword("x".repeat(257))).rejects.toThrow("Password input is too long");
    await expect(verifyPassword("x".repeat(257), DUMMY_PASSWORD_HASH)).rejects.toThrow("Password input is too long");
  });

  it("keeps bcrypt cost 12 and verifies newly generated hashes", async () => {
    const password = "Native-Bcrypt-Compatibility-123!";
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${password}x`, hash)).resolves.toBe(false);
  });
});
