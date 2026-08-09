import Link from "next/link";
import { headers } from "next/headers";

import { resetPasswordAction } from "@/auth/actions";
import { inspectTokenForRequest } from "@/auth/token-inspection";
import {
  AuthShell,
  PasswordRequirements,
} from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { StatusBanner } from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

function errorMessage(error?: string) {
  if (!error) return null;
  if (error === "password") return "The password fields must match.";
  return error;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const params = await searchParams;
  const error = errorMessage(params.error);
  const inspection = params.token
    ? await inspectTokenForRequest({
        kind: "reset",
        token: params.token,
        headers: await headers(),
      })
    : { status: "invalid" as const };
  const canShowForm = Boolean(params.token && inspection.status === "valid");

  return (
    <AuthShell
      description="Create a new password for your Openers account."
      footer={
        <Link className="ui-link" href="/login">
          Return to sign in
        </Link>
      }
      title="Choose a new password"
    >
      {error ? <StatusBanner tone="danger">{error}</StatusBanner> : null}
      {canShowForm ? (
        <form action={resetPasswordAction} className="auth-form">
          <input name="token" type="hidden" value={params.token} />
          <PasswordRequirements />
          <label className="ui-label">
            New password
            <input
              aria-describedby="password-requirements"
              autoComplete="new-password"
              className="ui-input"
              maxLength={256}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="ui-label">
            Confirm password
            <input
              aria-describedby="password-requirements"
              autoComplete="new-password"
              className="ui-input"
              maxLength={256}
              minLength={12}
              name="confirmation"
              required
              type="password"
            />
          </label>
          <SubmitButton
            className="auth-form__submit"
            pendingLabel="Changing password"
          >
            Change password
          </SubmitButton>
        </form>
      ) : (
        <StatusBanner tone="danger">
          This reset link is no longer valid. Request a new link to continue.
        </StatusBanner>
      )}
    </AuthShell>
  );
}
