import Link from "next/link";

import { forgotPasswordAction } from "@/auth/actions";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Reset password</h1>
        {params.sent === "1" ? (
          <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            If the account is eligible, a reset link has been sent.
          </p>
        ) : (
          <form action={forgotPasswordAction} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                name="email"
                type="email"
                required
              />
            </label>
            <button className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              Send reset link
            </button>
          </form>
        )}
        <Link className="mt-4 block text-center text-sm text-primary hover:underline" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
