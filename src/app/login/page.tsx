import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";
import {
  LoginSubmitButton,
  PasswordField,
} from "@/components/auth/login-controls";
import { LoginShell } from "@/components/auth/login-shell";
import styles from "@/components/auth/login.module.css";
import { StatusBanner } from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; setup?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user) redirect("/dashboard");

  return (
    <LoginShell>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Openers workspace</p>
        <h2 id="login-heading">Sign in</h2>
        <p className={styles.headerDescription}>
          Use your assigned account to open the role-scoped workspace.
        </p>
      </header>

      <div aria-live="polite" className={styles.messages}>
        {params.error ? (
          <StatusBanner tone="danger">
            The email or password did not match an active account. Check both
            fields and try again.
          </StatusBanner>
        ) : null}
        {params.setup === "complete" ? (
          <StatusBanner tone="success">
            Your account is ready. Sign in with the password you created.
          </StatusBanner>
        ) : null}
        {params.reset === "complete" ? (
          <StatusBanner tone="success">
            Your password changed. Sign in again on every device.
          </StatusBanner>
        ) : null}
      </div>

      <form action={loginAction} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="login-email">
            Email
          </label>
          <span className={styles.inputShell}>
            <svg
              aria-hidden="true"
              className={styles.inputIcon}
              fill="none"
              viewBox="0 0 24 24"
            >
              <rect height="14" rx="2" width="18" x="3" y="5" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              autoComplete="email"
              className={styles.input}
              id="login-email"
              name="email"
              placeholder="you@company.com"
              required
              type="email"
            />
          </span>
        </div>
        <PasswordField />
        <LoginSubmitButton>Sign in</LoginSubmitButton>
      </form>

      <div className={styles.footer} aria-hidden="true">
        <span className={styles.footerDividerLabel}>or</span>
      </div>
      <Link className={styles.forgotLink} href="/forgot-password">
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <rect height="10" rx="1.5" width="12" x="6" y="10" />
          <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        </svg>
        Forgot your password?
      </Link>
    </LoginShell>
  );
}
