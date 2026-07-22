import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { confirmImportAction, previewImportAction } from "@/import/actions";
import { getImportConfirmationBlockReason } from "@/import/dialer";
import { getStoredImportPreview } from "@/import/service";

export const dynamic = "force-dynamic";

const previewLabels = [
  ["totalCsvRows", "Total CSV rows"],
  ["new", "New rows"],
  ["changed", "Changed rows"],
  ["unchanged", "Unchanged rows"],
  ["invalid", "Invalid rows"],
  ["unknown", "Unknown agents"],
  ["out_of_scope", "Out-of-scope agents"],
] as const;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    preview?: string;
    confirmed?: string;
    confirmError?: string;
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

  const storedPreview = params.preview
    ? await getStoredImportPreview({ actor: user, batchId: params.preview })
    : null;
  const preview = storedPreview?.preview ?? null;
  const confirmDisabled = preview
    ? getImportConfirmationBlockReason(preview) !== null
    : true;

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

        {params.confirmError ? (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {decodeURIComponent(params.confirmError)}
          </p>
        ) : null}

        {params.confirmed ? (
          <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Import confirmed.
          </p>
        ) : null}

        {params.preview && !storedPreview ? (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Preview expired or is unavailable. Upload the CSV again.
          </p>
        ) : null}

        {storedPreview && preview ? (
          <section className="mt-6 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Preview summary</h2>
                <p className="mt-1 text-sm text-muted">
                  File:{" "}
                  <span className="font-medium text-foreground">
                    {storedPreview.fileName}
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted">
                  SHA-256: {preview.fileHash}
                </p>
              </div>
              {preview.duplicateFile ? (
                <span className="rounded-md border border-danger/40 px-2 py-1 text-xs font-semibold text-danger">
                  Duplicate file blocked
                </span>
              ) : (
                <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted">
                  Not a duplicate
                </span>
              )}
            </div>

            {preview.missingHeaders.length > 0 ? (
              <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                Missing required headers: {preview.missingHeaders.join(", ")}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {previewLabels.map(([key, label]) => {
                const value =
                  key === "totalCsvRows" ? preview.totalCsvRows : preview.summary[key];

                return (
                  <div className="rounded-md border border-border p-3" key={key}>
                    <p className="text-xs uppercase text-muted">{label}</p>
                    <p className="mt-1 font-mono text-2xl">{value}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase text-muted">Detected headers</p>
                <p className="mt-2 text-sm">
                  {preview.headers.length > 0 ? preview.headers.join(", ") : "None"}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase text-muted">Mapped agents</p>
                <p className="mt-2 text-sm">
                  {preview.mappedAgents.length > 0
                    ? preview.mappedAgents.join(", ")
                    : "None"}
                </p>
              </div>
            </div>

            <form action={confirmImportAction}>
              <input name="batchId" type="hidden" value={storedPreview.batchId} />
              <button
                className="mt-5 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
                disabled={confirmDisabled}
              >
                Confirm import
              </button>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
