import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const baseEnv = {
  DATABASE_URL: "mysql://openers:openers_password@127.0.0.1:3306/openers_dashboard",
  SESSION_SECRET: "12345678901234567890123456789012",
  NODE_ENV: "development",
} satisfies NodeJS.ProcessEnv;

describe("environment validation", () => {
  it("accepts console email in development", async () => {
    const { parseEnv } = await import("@/env");
    const env = parseEnv({
      ...baseEnv,
      NODE_ENV: "development",
      EMAIL_PROVIDER: "console",
    });

    expect(env.EMAIL_PROVIDER).toBe("console");
    expect(env.EMAIL_FROM_NAME).toBe("DialExpert");
    expect(env.EMAIL_FROM_ADDRESS).toBe("no-reply@updates.dialexpert.com");
  });

  it("rejects console email in production", async () => {
    const { parseEnv } = await import("@/env");
    expect(() =>
      parseEnv({
        ...baseEnv,
        NODE_ENV: "production",
        EMAIL_PROVIDER: "console",
      }),
    ).toThrow(/EMAIL_PROVIDER=console is not allowed in production/);
  });

  it("requires resend api key when resend is selected", async () => {
    const { parseEnv } = await import("@/env");
    expect(() =>
      parseEnv({
        ...baseEnv,
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM_NAME: "DialExpert",
        EMAIL_FROM_ADDRESS: "no-reply@updates.dialexpert.com",
      }),
    ).toThrow(/RESEND_API_KEY is required when EMAIL_PROVIDER=resend/);
  });

  it("validates optional reply-to when provided", async () => {
    const { parseEnv } = await import("@/env");
    expect(() =>
      parseEnv({
        ...baseEnv,
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_123",
        EMAIL_REPLY_TO: "not-an-email",
      }),
    ).toThrow(/Invalid email address/);
  });

  it("requires a valid temporary-password encryption key in production", async () => {
    const { parseEnv } = await import("@/env");
    expect(() =>
      parseEnv({
        ...baseEnv,
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_123",
      }),
    ).toThrow(/TEMP_PASSWORD_ENCRYPTION_KEY is required in production/);
    expect(() =>
      parseEnv({
        ...baseEnv,
        TEMP_PASSWORD_ENCRYPTION_KEY: "not-a-32-byte-key",
      }),
    ).toThrow(/base64-encoded 32-byte key/);
  });

  it("validates the optional transfer Sheet configuration", async () => {
    const { parseEnv } = await import("@/env");
    const env = parseEnv({
      ...baseEnv,
      GOOGLE_TRANSFERS_SHEET_ID: "sheet-id",
      GOOGLE_TRANSFERS_SHEET_GID: "1437961980",
      GOOGLE_TRANSFERS_SHEET_TIMEZONE: "Africa/Cairo",
    });
    expect(env.GOOGLE_TRANSFERS_SHEET_TIMEZONE).toBe("Africa/Cairo");

    expect(() =>
      parseEnv({
        ...baseEnv,
        GOOGLE_TRANSFERS_SHEET_ID: "sheet-id",
      }),
    ).toThrow(/must be configured together/);
    expect(() =>
      parseEnv({
        ...baseEnv,
        GOOGLE_TRANSFERS_SHEET_TIMEZONE: "Mars/Olympus",
      }),
    ).toThrow(/valid IANA timezone/);
  });
});
