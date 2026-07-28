import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { ImportPreviewSummary } from "@/app/import/import-preview-summary";
import { AppShell } from "@/components/dashboard/app-shell";
import { Icon } from "@/components/dashboard/icon";
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
    <AppShell
      eyebrow="Data operations"
      title="Import studio"
      user={user}
    >
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative mb-5 overflow-hidden rounded-[1.4rem] border border-primary/15 bg-gradient-to-br from-[#101f34] to-[#08121f] px-5 py-6 sm:px-7">
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-cyan/75 uppercase">
                Dialer CSV workflow
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                Preview before anything changes.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-strong">
                Validate headers, mappings, and row-level issues before
                confirming performance activity.
              </p>
            </div>
            <Link
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-xs font-semibold text-white transition hover:border-cyan/25"
              href="/dashboard"
            >
              Back to dashboard
              <Icon className="size-4 text-cyan" name="arrow-up-right" />
            </Link>
          </div>
        </section>

        <form
          action={previewImportAction}
          className="dashboard-card p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-cyan">
              <Icon className="size-5" name="import" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Upload performance file
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                CSV only · no data is committed during preview
              </p>
            </div>
          </div>
          <label className="mt-5 block text-xs font-semibold text-muted-strong">
            Dialer CSV
            <input
              accept=".csv,text/csv"
              className="mt-2 block w-full rounded-xl border border-dashed border-border-strong bg-background/55 px-4 py-4 text-sm text-muted-strong file:mr-4 file:rounded-lg file:border-0 file:bg-primary/12 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan hover:border-cyan/30"
              name="file"
              required
              type="file"
            />
          </label>
          <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-strong px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_26px_rgba(22,139,255,.2)] transition hover:-translate-y-0.5">
            <Icon className="size-4" name="sparkles" />
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
    </AppShell>
  );
}
