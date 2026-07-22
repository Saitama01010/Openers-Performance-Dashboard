import { redirect } from "next/navigation";

import { loginAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              name="email"
              type="email"
              defaultValue="admin@example.com"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              name="password"
              type="password"
              defaultValue="Password123!"
              required
            />
          </label>
          <button className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
