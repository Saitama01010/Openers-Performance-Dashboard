import Link from "next/link";

import { forgotPasswordAction } from "@/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { StatusBanner } from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      description="Enter your account email. If it is eligible, we will send a time-limited reset link."
      footer={
        <Link className="ui-link" href="/login">
          Return to sign in
        </Link>
      }
      title="Reset your password"
    >
      {params.sent === "1" ? (
        <StatusBanner tone="success">
          If this account is eligible, a reset link has been sent. Check the
          inbox associated with the account.
        </StatusBanner>
      ) : (
        <form action={forgotPasswordAction} className="auth-form">
          <label className="ui-label">
            Email
            <input
              autoComplete="email"
              className="ui-input"
              maxLength={255}
              name="email"
              required
              type="email"
            />
          </label>
          <SubmitButton
            className="auth-form__submit"
            pendingLabel="Sending reset link"
          >
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
