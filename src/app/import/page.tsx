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
                CSV files are validated before any records are saved.
              </p>
            </div>
          </div>
          <form action={previewImportAction}>
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
            Upload a CSV file before previewing.
          </StatusBanner>
        ) : null}

        {params.confirmError ? (
          <StatusBanner tone="danger">
            {confirmErrorMessages[params.confirmError] ??
              confirmErrorMessages.confirm_failed}
          </StatusBanner>
        ) : null}

        {params.confirmed ? (
          <StatusBanner tone="success">Import confirmed.</StatusBanner>
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
              Confirm import disabled: preview expired or does not belong to the
              current user.
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
            preview={storedPreview.preview}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
