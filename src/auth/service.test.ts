import { beforeEach, describe, expect, it, vi } from "vitest";

const passwordResetEmailMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const dbQueryQueue = vi.hoisted(() => [] as unknown[][]);

vi.mock("server-only", () => ({}));

const selectMock = vi.hoisted(() =>
  vi.fn(() => {
    const rows = dbQueryQueue.shift() ?? [];

    return {
      from() {
        return this;
      },
      where() {
        return this;
      },
      orderBy() {
        return this;
      },
      limit() {
        return Promise.resolve(rows);
      },
    };
  }),
);

vi.mock("@/db", () => ({
  getDb: () => ({
    select: selectMock,
    transaction: transactionMock,
  }),
}));

vi.mock("@/email/provider", () => ({
  sendInvitationEmail: vi.fn(),
  sendPasswordResetEmail: passwordResetEmailMock,
  sendPasswordChangedEmail: vi.fn(),
}));

describe("password reset duplicate protection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbQueryQueue.length = 0;
    process.env.DATABASE_URL =
      "mysql://openers:openers_password@127.0.0.1:3306/openers_dashboard";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.EMAIL_PROVIDER = "console";
    process.env.NODE_ENV = "development";
  });

  it("does not send a duplicate password reset email when an active token already exists", async () => {
    dbQueryQueue.push(
      [
        {
          id: "profile-1",
          email: "agent@example.com",
          name: "Agent Smith",
          accountStatus: "active",
          active: true,
        },
      ],
      [{ id: "reset-token-1" }],
    );

    const { requestPasswordReset } = await import("@/auth/service");

    await requestPasswordReset("agent@example.com");

    expect(transactionMock).not.toHaveBeenCalled();
    expect(passwordResetEmailMock).not.toHaveBeenCalled();
  });
});
