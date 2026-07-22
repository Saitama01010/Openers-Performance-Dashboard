"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { verifyPassword } from "@/auth/password";
import { createSession, destroySession } from "@/auth/session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  const profile = rows[0];

  if (!profile || !(await verifyPassword(password, profile.passwordHash))) {
    redirect("/login?error=invalid");
  }

  await createSession(profile.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
