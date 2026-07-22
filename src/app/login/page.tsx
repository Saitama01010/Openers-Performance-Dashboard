import { redirect } from "next/navigation";
import Link from "next/link";

import { loginAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string; reset?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Openers Dashboard</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with a seeded local user to review performance.
        </p>
        {params.error ? (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Invalid email or password.
          </p>
        ) : null}
        {params.setup === "complete" ? (
          <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Account setup complete. Sign in with your new password.
          </p>
        ) : null}
        {params.reset === "complete" ? (
          <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Password changed. Sign in again on all devices.
          </p>
        ) : null}
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            Sign in
          </button>
        </form>
        <Link
          className="mt-4 block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      </section>
    </main>
  );
}
