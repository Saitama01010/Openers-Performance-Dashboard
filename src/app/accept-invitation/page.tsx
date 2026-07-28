import Link from "next/link";

import { acceptInvitationAction } from "@/auth/actions";
import { inspectInvitationToken } from "@/auth/service";
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

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const params = await searchParams;
  const error = errorMessage(params.error);
  const inspection = params.token
    ? await inspectInvitationToken(params.token)
    : { status: "invalid" as const };
  const canShowForm = Boolean(params.token && inspection.status === "valid");

  return (
    <AuthShell
      description="Set a permanent password to activate your assigned workspace account."
      footer={
        <Link className="ui-link" href="/login">
          Return to sign in
        </Link>
      }
      title="Complete account setup"
    >
      {error ? <StatusBanner tone="danger">{error}</StatusBanner> : null}
      {canShowForm ? (
        <form action={acceptInvitationAction} className="auth-form">
          <input name="token" type="hidden" value={params.token} />
          <PasswordRequirements />
          <label className="ui-label">
            Password
            <input
              aria-describedby="password-requirements"
              autoComplete="new-password"
              className="ui-input"
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
              minLength={12}
              name="confirmation"
              required
              type="password"
            />
          </label>
          <SubmitButton
            className="auth-form__submit"
            pendingLabel="Activating account"
          >
            Activate account
          </SubmitButton>
        </form>
      ) : (
        <StatusBanner tone="danger">
          This invitation link is no longer valid. Ask an administrator for a
          new invitation.
        </StatusBanner>
      )}
    </AuthShell>
  );
}
