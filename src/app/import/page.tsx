import { redirect } from "next/navigation";

import { ImportPreviewSummary } from "@/app/import/import-preview-summary";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FileUploadField } from "@/components/dashboard/file-upload-field";
import {
  PageHeader,
  StatusBanner,
} from "@/components/dashboard/dashboard-primitives";
import { getCurrentUser } from "@/auth/session";
import { previewImportAction } from "@/import/actions";
import { getStoredImportPreview } from "@/import/service";

export const dynamic = "force-dynamic";

const confirmErrorMessages: Record<string, string> = {
  confirm_failed: "Import could not be completed. Please refresh the preview and try again.",
  partial_ack_required:
    "Confirm the skipped-row acknowledgement before importing mapped rows.",
  preview_blocked:
    "Import could not be completed because the preview has blocking issues.",
  preview_expired: "Preview expired. Upload the file again.",
  reason_required: "Enter a reason of at least five characters.",
  stale_draft:
    "The active dataset changed after this review. Review the refreshed comparison and publish again.",
  warning_review_forbidden:
    "Only an administrator can publish a draft that contains warnings.",
  reject_failed: "The draft could not be rejected.",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    preview?: string;
    confirmed?: string;
    confirmError?: string;
    error?: string;
    rejected?: string;
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
  const disabledReasons = storedPreview?.validation.errors ?? [];

  return (
    <DashboardShell user={user}>
      <div className="dashboard-page">
        <PageHeader
          description="Upload a dialer CSV, review every mapped and skipped row, then confirm the import."
          eyebrow="Dialer CSV workflow"
          title="Import preview"
        />

        <section aria-labelledby="upload-heading" className="ui-card ui-card--padded">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title" id="upload-heading">
                Upload source file
              </h2>
              <p className="ui-card__subtitle">
                Every upload is retained privately. Dashboard data changes only
                after the reviewed draft is published.
              </p>
            </div>
          </div>
          <form action={previewImportAction}>
            <label className="ui-label mt-4">
              Reporting date
              <input
                className="ui-input"
                name="reportingDate"
                required
                type="date"
              />
              <span className="ui-helper">
                Used to warn when the CSV contains a different reporting date.
              </span>
            </label>
            <FileUploadField
              accept=".csv,text/csv"
              helperText="Choose a CSV export from your dialer. The filename appears here before preview."
              label="Dialer CSV"
              name="file"
              required
            />
            <SubmitButton className="form-submit" pendingLabel="Preparing preview">
              Preview import
            </SubmitButton>
          </form>
        </section>

        {params.error ? (
          <StatusBanner tone="danger">
            {params.error === "reporting_date"
              ? "Choose the expected reporting date."
              : "Upload a valid CSV file before previewing."}
          </StatusBanner>
        ) : null}

        {params.confirmError ? (
          <StatusBanner tone="danger">
            {confirmErrorMessages[params.confirmError] ??
              confirmErrorMessages.confirm_failed}
          </StatusBanner>
        ) : null}

        {params.confirmed ? (
          <StatusBanner tone="success">
            Import published. The dashboard now reads this active version.
          </StatusBanner>
        ) : null}

        {params.rejected ? (
          <StatusBanner tone="success">
            Draft rejected. Its file and validation history were preserved.
          </StatusBanner>
        ) : null}

        {params.preview && !storedPreview ? (
          <section
            aria-labelledby="expired-preview-heading"
            className="ui-card ui-card--padded"
          >
            <h2 className="ui-card__title" id="expired-preview-heading">
              Preview unavailable
            </h2>
            <StatusBanner tone="danger">
              This draft is unavailable, no longer unpublished, or does not
              belong to the current user.
            </StatusBanner>
            <SubmitButton disabled>
              Confirm import
            </SubmitButton>
          </section>
        ) : null}

        {storedPreview ? (
          <ImportPreviewSummary
            batchId={storedPreview.batchId}
            disabledReasons={disabledReasons}
            fileName={storedPreview.fileName}
            isAdmin={user.role === "admin"}
            preview={storedPreview.preview}
            validation={storedPreview.validation}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
