import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/dashboard/action-controls";
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
    <AuthShell
      description="Use your assigned account to open the role-scoped workspace."
      footer={
        <Link className="ui-link" href="/forgot-password">
          Forgot your password?
        </Link>
      }
      title="Sign in"
    >
      <div className="auth-card__messages">
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
      <form action={loginAction} className="auth-form">
        <label className="ui-label">
          Email
          <input
            autoComplete="email"
            className="ui-input"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="ui-label">
          Password
          <input
            autoComplete="current-password"
            className="ui-input"
            name="password"
            required
            type="password"
          />
        </label>
        <SubmitButton
          className="auth-form__submit"
          pendingLabel="Signing in"
        >
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
