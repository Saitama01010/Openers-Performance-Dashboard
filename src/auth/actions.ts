"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createSession, destroySession } from "@/auth/session";
import { consumeRateLimit } from "@/auth/rate-limit";
import {
  acceptInvitation,
  authenticateCredentials,
  requestPasswordReset,
  resetPassword,
} from "@/auth/service";
import { normalizeEmail } from "@/auth/security";

export async function loginAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const result = await authenticateCredentials(email, password);

  if (!result.ok) {
    redirect("/login?error=invalid");
  }

  await createSession(result.profile.id);
  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const headerStore = await headers();
  const address = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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
