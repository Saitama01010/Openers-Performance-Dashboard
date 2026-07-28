import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { ImportPreviewSummary } from "@/app/import/import-preview-summary";
import { previewImportAction } from "@/import/actions";
import { getImportConfirmationBlockReasons } from "@/import/dialer";
import { getStoredImportPreview } from "@/import/service";

export const dynamic = "force-dynamic";

const confirmErrorMessages: Record<string, string> = {
  confirm_failed: "Import could not be completed. Please refresh the preview and try again.",
  partial_ack_required:
    "Confirm the skipped-row acknowledgement before importing mapped rows.",
  preview_blocked:
    "Import could not be completed because the preview has blocking issues.",
  preview_expired: "Preview expired. Upload the file again.",
};

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
  const disabledReasons = storedPreview
    ? getImportConfirmationBlockReasons(storedPreview.preview)
    : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted">Dialer CSV workflow</p>
            <h1 className="text-2xl font-semibold">Import Preview</h1>
          </div>
          <Link className="text-sm font-medium" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-6">
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
          <p
            autoFocus
            className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
            tabIndex={-1}
          >
            {confirmErrorMessages[params.confirmError] ??
              confirmErrorMessages.confirm_failed}
          </p>
        ) : null}

        {params.confirmed ? (
          <p
            className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
            role="status"
          >
            Import confirmed.
          </p>
        ) : null}

        {params.preview && !storedPreview ? (
          <section className="mt-6 rounded-lg border border-border bg-surface p-5">
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              Confirm import disabled: preview expired or does not belong to the
              current user.
            </p>
            <button
              className="mt-5 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background opacity-50"
              disabled
            >
              Publishing unavailable
            </button>
          </section>
        ) : null}

        {storedPreview ? (
          <ImportPreviewSummary
            batchId={storedPreview.batchId}
            disabledReasons={disabledReasons}
            fileName={storedPreview.fileName}
            preview={storedPreview.preview}
          />
        ) : null}
      </section>
    </main>
  );
}
