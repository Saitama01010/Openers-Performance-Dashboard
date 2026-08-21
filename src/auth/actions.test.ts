import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateCredentials: vi.fn(),
  consumeRateLimits: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  issueRequiredPasswordChangeToken: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
  consumeRateLimits: mocks.consumeRateLimits,
}));
vi.mock("@/auth/request-security", () => ({
  trustedClientFingerprint: vi.fn(() => "trusted-client"),
}));
vi.mock("@/auth/service", () => ({
  acceptInvitation: vi.fn(),
  authenticateCredentials: mocks.authenticateCredentials,
  issueRequiredPasswordChangeToken: mocks.issueRequiredPasswordChangeToken,
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/auth/session", () => ({
  createSession: mocks.createSession,
  destroySession: mocks.destroySession,
}));

import { loginAction, logoutAction } from "@/auth/actions";

function loginForm(email: string, password: string) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

const profile = {
  id: "profile-id",
  role: "agent" as const,
  passwordHash: "hash",
  active: true,
  accountStatus: "active" as const,
  mustResetPassword: false,
};

describe("login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimits.mockResolvedValue([
      { allowed: true, retryAfterSeconds: 1 },
      { allowed: true, retryAfterSeconds: 1 },
      { allowed: true, retryAfterSeconds: 1 },
    ]);
  });

  it("creates a session for valid credentials and keeps all three limits", async () => {
    mocks.authenticateCredentials.mockResolvedValue({
      ok: true,
      profile,
      requiresPasswordChange: false,
    });

    await expect(
      loginAction(loginForm(" Person@Example.Test ", "valid-password")),
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(mocks.consumeRateLimits).toHaveBeenCalledWith([
      expect.objectContaining({ scope: "login-account-15m", identifier: "person@example.test", limit: 5 }),
      expect.objectContaining({ scope: "login-account-1h", identifier: "person@example.test", limit: 20 }),
      expect.objectContaining({ scope: "login-client-15m", identifier: "trusted-client", limit: 30 }),
    ]);
    expect(mocks.authenticateCredentials).toHaveBeenCalledWith(
      "person@example.test",
      "valid-password",
    );
    expect(mocks.createSession).toHaveBeenCalledWith(profile);
  });

  it.each([
    ["invalid password", "person@example.test", "wrong-password"],
    ["unknown user", "unknown@example.test", "wrong-password"],
    ["inactive account", "inactive@example.test", "valid-password"],
  ])("keeps the generic redirect for %s", async (_label, email, password) => {
    mocks.authenticateCredentials.mockResolvedValue({
      ok: false,
      error: "Invalid email or password.",
    });

    await expect(loginAction(loginForm(email, password))).rejects.toThrow(
      "REDIRECT:/login?error=invalid",
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("blocks when any durable policy is exhausted without skipping a policy", async () => {
    mocks.consumeRateLimits.mockResolvedValue([
      { allowed: false, retryAfterSeconds: 60 },
      { allowed: true, retryAfterSeconds: 60 },
      { allowed: true, retryAfterSeconds: 60 },
    ]);

    await expect(
      loginAction(loginForm("person@example.test", "valid-password")),
    ).rejects.toThrow("REDIRECT:/login?error=invalid");
    expect(mocks.consumeRateLimits.mock.calls[0]?.[0]).toHaveLength(3);
    expect(mocks.authenticateCredentials).not.toHaveBeenCalled();
  });

  it("preserves the required-password-change path without creating a session", async () => {
    mocks.authenticateCredentials.mockResolvedValue({
      ok: true,
      profile: { ...profile, mustResetPassword: true },
      requiresPasswordChange: true,
    });
    mocks.issueRequiredPasswordChangeToken.mockResolvedValue("required token");

    await expect(
      loginAction(loginForm("person@example.test", "temporary-password")),
    ).rejects.toThrow(
      "REDIRECT:/reset-password?required=1&token=required%20token",
    );
    expect(mocks.issueRequiredPasswordChangeToken).toHaveBeenCalledWith(
      profile.id,
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("logout action", () => {
  it("destroys the current session before returning to login", async () => {
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.destroySession).toHaveBeenCalledOnce();
  });
});
