import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendSendMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: resendSendMock,
    };
  },
}));

const originalEnv = { ...process.env };

function setBaseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  process.env = {
    ...originalEnv,
    DATABASE_URL: "mysql://openers:openers_password@127.0.0.1:3306/openers_dashboard",
    SESSION_SECRET: "12345678901234567890123456789012",
    APP_URL: "https://dialexpert.test",
    EMAIL_PROVIDER: "console",
    EMAIL_FROM_NAME: "DialExpert",
    EMAIL_FROM_ADDRESS: "no-reply@updates.dialexpert.com",
    INVITATION_TTL_HOURS: "48",
    PASSWORD_RESET_TTL_MINUTES: "30",
    TEMP_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    NODE_ENV: "development",
    ...overrides,
  };
}

describe("transactional email provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setBaseEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("renders invitation email content with html, text, and the invitation link", async () => {
    const { invitationEmail } = await import("@/email/provider");

    const message = invitationEmail({
      email: "agent@example.com",
      name: "Agent Smith",
      token: "invite-token",
      tokenId: "invite-record",
    });

    expect(message.subject).toContain("Set up your DialExpert account");
    expect(message.text).toContain("https://dialexpert.test/accept-invitation?token=invite-token");
    expect(message.text).toContain("This invitation link expires in 48 hours.");
    expect(message.html).toContain("Accept invitation");
    expect(message.html).toContain("DialExpert");
    expect(message.idempotencyKey).toBe("account_invitation:invite-record");
  });

  it("renders password reset content with the reset link", async () => {
    const { passwordResetEmail } = await import("@/email/provider");

    const message = passwordResetEmail({
      email: "agent@example.com",
      name: "Agent Smith",
      token: "reset-token",
      tokenId: "reset-record",
    });

    expect(message.text).toContain("https://dialexpert.test/reset-password?token=reset-token");
    expect(message.text).toContain("This reset link expires in 30 minutes.");
    expect(message.idempotencyKey).toBe("password_reset:reset-record");
  });

  it("renders password changed and access revoked notifications", async () => {
    const {
      accessRevokedEmail,
      passwordChangedEmail,
    } = await import("@/email/provider");

    const changed = passwordChangedEmail({
      email: "agent@example.com",
      name: "Agent Smith",
    });
    const revoked = accessRevokedEmail({
      email: "agent@example.com",
      name: "Agent Smith",
    });

    expect(changed.text).toContain("Your DialExpert password was changed");
    expect(changed.text).toContain("This security notice does not expire");
    expect(revoked.text).toContain("Your DialExpert access was revoked");
    expect(revoked.html).toContain("Open DialExpert");
  });

  it("uses resend with reply-to and returns the provider message id", async () => {
    setBaseEnv({
      EMAIL_PROVIDER: "resend",
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_123",
      EMAIL_REPLY_TO: "support@updates.dialexpert.com",
    });
    resendSendMock.mockResolvedValue({
      data: { id: "re_123" },
      error: null,
      headers: null,
    });

    const { deliverEmail } = await import("@/email/provider");

    const result = await deliverEmail({
      to: "agent@example.com",
      subject: "Subject",
      text: "Plain text",
      html: "<p>HTML</p>",
      idempotencyKey: "password_reset:reset-record",
    });

    expect(result).toMatchObject({
      ok: true,
      provider: "resend",
      providerMessageId: "re_123",
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "DialExpert <no-reply@updates.dialexpert.com>",
        replyTo: ["support@updates.dialexpert.com"],
      }),
      { idempotencyKey: "password_reset:reset-record" },
    );
  });

  it("redacts the api key from resend failures", async () => {
    setBaseEnv({
      EMAIL_PROVIDER: "resend",
      NODE_ENV: "production",
      RESEND_API_KEY: "re_secret_value",
    });
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: "invalid api key re_secret_value" },
      headers: null,
    });

    const { deliverEmail } = await import("@/email/provider");

    const result = await deliverEmail({
      to: "agent@example.com",
      subject: "Subject",
      text: "Plain text",
      html: "<p>HTML</p>",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected delivery to fail");
    }
    expect(result.error).not.toContain("re_secret_value");
  });

  it("keeps console delivery metadata available without logging token-bearing bodies", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { deliverEmail } = await import("@/email/provider");

    const result = await deliverEmail({
      to: "agent@example.com",
      subject: "Subject",
      text: "Local invitation link token=raw-secret-token",
      html: "<p>Local invitation link token=raw-secret-token</p>",
    });

    expect(result).toMatchObject({ ok: true, provider: "console" });
    const logged = String(infoSpy.mock.calls[0]?.[0]);
    expect(logged).toContain("body=[redacted]");
    expect(logged).not.toContain("raw-secret-token");
  });
});
