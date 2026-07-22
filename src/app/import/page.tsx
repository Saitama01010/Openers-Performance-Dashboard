import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { previewImportAction } from "@/import/actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    duplicate?: string;
    hash?: string;
    summary?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect("/login");
  }

  if (user.role === "agent") {
    redirect("/dashboard");
  }

  const summary = params.summary
    ? (JSON.parse(decodeURIComponent(params.summary)) as Record<string, number>)
    : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted">Dialer CSV workflow</p>
            <h1 className="text-2xl font-semibold">Import Preview</h1>
          </div>
          <Link className="text-sm font-medium" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-6">
        <form
          action={previewImportAction}
          className="rounded-lg border border-border bg-surface p-5"
        >
          <label className="block text-sm font-medium">
            Dialer CSV
            <input
              accept=".csv,text/csv"
              className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              name="file"
              required
              type="file"
            />
          </label>
          <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Preview import
          </button>
        </form>

        {params.error ? (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Upload a CSV file before previewing.
          </p>
        ) : null}

        {summary ? (
          <section className="mt-6 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Preview summary</h2>
                <p className="mt-1 break-all font-mono text-xs text-muted">
                  SHA-256: {params.hash}
                </p>
              </div>
              {params.duplicate === "true" ? (
                <span className="rounded-md border border-danger/40 px-2 py-1 text-xs font-semibold text-danger">
                  Duplicate file blocked
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {Object.entries(summary).map(([label, value]) => (
                <div className="rounded-md border border-border p-3" key={label}>
                  <p className="text-xs uppercase text-muted">
                    {label.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 font-mono text-2xl">{value}</p>
                </div>
              ))}
            </div>
            <button
              className="mt-5 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={params.duplicate === "true"}
            >
              Confirm import
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
