"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createSession, destroySession } from "@/auth/session";
import { consumeRateLimit, consumeRateLimits } from "@/auth/rate-limit";
import {
  acceptInvitation,
  authenticateCredentials,
  issueRequiredPasswordChangeToken,
  requestPasswordReset,
  resetPassword,
} from "@/auth/service";
import { normalizeEmail } from "@/auth/security";
import { trustedClientFingerprint } from "@/auth/request-security";

async function requestFingerprint() {
  return trustedClientFingerprint(await headers());
}

async function authenticationLimits(input: {
  operation: "login" | "invitation" | "reset";
  identifier: string;
}) {
  const fingerprint = await requestFingerprint();
  const limits =
    input.operation === "login"
      ? await consumeRateLimits([
          { scope: "login-account-15m", identifier: input.identifier, limit: 5, windowMs: 15 * 60 * 1000 },
          { scope: "login-account-1h", identifier: input.identifier, limit: 20, windowMs: 60 * 60 * 1000 },
          { scope: "login-client-15m", identifier: fingerprint, limit: 30, windowMs: 15 * 60 * 1000 },
        ])
      : await Promise.all([
          consumeRateLimit({ scope: `${input.operation}-token-15m`, identifier: input.identifier, limit: 8, windowMs: 15 * 60 * 1000 }),
          consumeRateLimit({ scope: `${input.operation}-client-15m`, identifier: fingerprint, limit: 30, windowMs: 15 * 60 * 1000 }),
        ]);
  return limits.every((limit) => limit.allowed);
}

export async function loginAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!(await authenticationLimits({ operation: "login", identifier: email }))) {
    redirect("/login?error=invalid");
  }
  const result = await authenticateCredentials(email, password);

  if (!result.ok) {
    redirect("/login?error=invalid");
  }

  if (result.requiresPasswordChange) {
    const token = await issueRequiredPasswordChangeToken(result.profile.id);
    redirect(`/reset-password?required=1&token=${encodeURIComponent(token)}`);
  }

  await createSession(result.profile);
  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const address = await requestFingerprint();
  const [emailLimit, addressLimit] = await Promise.all([
    consumeRateLimit({ scope: "password-reset-email", identifier: email, limit: 3, windowMs: 60 * 60 * 1000 }),
    consumeRateLimit({ scope: "password-reset-address", identifier: address, limit: 10, windowMs: 60 * 60 * 1000 }),
  ]);

  if (emailLimit.allowed && addressLimit.allowed) {
    await requestPasswordReset(email);
  }

  redirect("/forgot-password?sent=1");
}

export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!token || password !== confirmation) {
    redirect(`/accept-invitation?token=${encodeURIComponent(token)}&error=password`);
  }

  if (!(await authenticationLimits({ operation: "invitation", identifier: token }))) {
    redirect("/accept-invitation?error=invalid");
  }

  const result = await acceptInvitation({ token, password });

  if (!result.ok) {
    redirect(`/accept-invitation?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.error)}`);
  }

  redirect("/login?setup=complete");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!token || password !== confirmation) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=password`);
  }

  if (!(await authenticationLimits({ operation: "reset", identifier: token }))) {
    redirect("/reset-password?error=invalid");
  }

  const result = await resetPassword({ token, password });

  if (!result.ok) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.error)}`);
  }

  redirect("/login?reset=complete");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
