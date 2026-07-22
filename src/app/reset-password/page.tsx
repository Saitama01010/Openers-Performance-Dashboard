import Link from "next/link";

import { resetPasswordAction } from "@/auth/actions";

export const dynamic = "force-dynamic";

function errorMessage(error?: string) {
  if (!error) return null;
  if (error === "password") return "Passwords must match.";
  return error;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const error = errorMessage(params.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        {error ? (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {params.token ? (
          <form action={resetPasswordAction} className="mt-6 space-y-4">
            <input name="token" type="hidden" value={params.token} />
            <label className="block text-sm font-medium">
              New password
              <input
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                minLength={12}
                name="password"
                type="password"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                minLength={12}
                name="confirmation"
                type="password"
                required
              />
            </label>
            <button className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              Change password
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-danger">This reset link is invalid.</p>
        )}
        <Link className="mt-4 block text-center text-sm text-primary hover:underline" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
