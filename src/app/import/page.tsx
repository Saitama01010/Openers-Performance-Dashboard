import { redirect } from "next/navigation";

import { ImportPreviewSummary } from "@/app/import/import-preview-summary";
import { ImportProcessingStatus } from "@/app/import/import-processing-status";
import { ImportUploadForm } from "@/app/import/import-upload-form";
import styles from "@/app/import/import-page.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  PageHeader,
  StatusBanner,
} from "@/components/dashboard/dashboard-primitives";
import { getCurrentUser } from "@/auth/session";
import {
  AGENT_HOURS_DAILY_HEADERS,
  HOURLY_DIALER_HEADERS,
} from "@/import/dialer";
import { getImportProcessingStatus, getStoredImportPreview } from "@/import/service";

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

const headerLabels: Record<string, string> = {
  agent: "Agent",
  calls: "Calls",
  date: "Date",
  hour: "Hour",
  idle_seconds: "Idle (sec)",
  logged_in_seconds: "Logged In (sec)",
  net_seconds: "Net (sec)",
  paused_seconds: "Paused (sec)",
  ready_seconds: "Ready (sec)",
  ringing_seconds: "Ringing (sec)",
  system_pause_seconds: "System Pause (sec)",
  talk_seconds: "Talk (sec)",
  untracked_seconds: "Untracked (sec)",
  wrap_seconds: "Wrap (sec)",
};

function ImportStepper() {
  const steps = [
    ["Upload", "Add your CSV file"],
    ["Review", "Validate and map data"],
    ["Publish", "Confirm and publish"],
  ] as const;

  return (
    <ol aria-label="Import progress" className={styles.stepper}>
      {steps.map(([title, description], index) => (
        <li
          aria-current={index === 0 ? "step" : undefined}
          className={styles.step}
          key={title}
        >
          <span className={styles.stepNumber}>{index + 1}</span>
          <span className={styles.stepCopy}>
            <strong>{title}</strong>
            <span>{description}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function HeaderList({ headers }: { headers: readonly string[] }) {
  return (
    <ul className={styles.headerList}>
      {headers.map((header) => (
        <li key={header}>
          <span aria-hidden="true" className={styles.guideCheck}>✓</span>
          <code>{headerLabels[header] ?? header}</code>
        </li>
      ))}
    </ul>
  );
}

function ImportGuide() {
  return (
    <aside aria-labelledby="import-guide-heading" className={styles.guide}>
      <div className={styles.guideHeading}>
        <DashboardIcon name="info" />
        <h2 id="import-guide-heading">Import guide</h2>
      </div>

      <section className={styles.guideSection}>
        <h3>Accepted file type</h3>
        <p className={styles.fileTypeLine}>
          <span>CSV</span>
          Comma-separated values (.csv)
        </p>
        <p className={styles.guideMuted}>UTF-8 encoding recommended</p>
      </section>

      <section className={styles.guideSection}>
        <h3>Daily Agent Hours headers</h3>
        <HeaderList headers={AGENT_HOURS_DAILY_HEADERS} />
        <details className={styles.hourlyDetails}>
          <summary>View hourly CSV headers</summary>
          <HeaderList headers={HOURLY_DIALER_HEADERS} />
        </details>
      </section>

      <section className={styles.guideSection}>
        <h3>Import tips</h3>
        <ul className={styles.tipList}>
          <li><span aria-hidden="true">✓</span>Export directly from your dialer.</li>
          <li><span aria-hidden="true">✓</span>Keep agent names consistent with dashboard mappings.</li>
          <li><span aria-hidden="true">✓</span>Review mapped, skipped, and invalid rows.</li>
          <li><span aria-hidden="true">✓</span>Dashboard data changes only after publishing.</li>
        </ul>
      </section>
    </aside>
  );
}

function Feedback({
  confirmError,
  confirmed,
  error,
  rejected,
}: {
  confirmError?: string;
  confirmed?: string;
  error?: string;
  rejected?: string;
}) {
  return (
    <div aria-live="polite" className={styles.feedbackStack}>
      {error ? (
        <StatusBanner tone="danger">
          {error === "agent_hours_reporting_date"
            ? "Choose the reporting date represented by this Agent Hours file."
            : "Upload a valid CSV file before previewing."}
        </StatusBanner>
      ) : null}
      {confirmError ? (
        <StatusBanner tone="danger">
          {confirmErrorMessages[confirmError] ?? confirmErrorMessages.confirm_failed}
        </StatusBanner>
      ) : null}
      {confirmed ? (
        <StatusBanner tone="success">
          Import published. The dashboard now reads this active version.
        </StatusBanner>
      ) : null}
      {rejected ? (
        <StatusBanner tone="success">
          Draft rejected. Its file and validation history were preserved.
        </StatusBanner>
      ) : null}
    </div>
  );
}

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

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const storedPreview = params.preview
    ? await getStoredImportPreview({ actor: user, batchId: params.preview })
    : null;
  const processingStatus = params.preview && !storedPreview
    ? await getImportProcessingStatus({ actor: user, batchId: params.preview })
    : null;
  const disabledReasons = storedPreview?.validation.errors ?? [];

  return (
    <DashboardShell user={user}>
      <main className={`dashboard-page ${styles.importPage}`}>
        {storedPreview ? (
          <>
            <Feedback confirmError={params.confirmError} />
            <ImportPreviewSummary
              batchId={storedPreview.batchId}
              createdAt={storedPreview.createdAt.toISOString()}
              disabledReasons={disabledReasons}
              fileName={storedPreview.fileName}
              isAdmin={user.role === "admin"}
              preview={storedPreview.preview}
              status={storedPreview.status}
              validation={storedPreview.validation}
            />
          </>
        ) : (
          <>
            <PageHeader
              description="Upload an agent activity CSV, review mapped and skipped rows, then publish the validated draft."
              eyebrow="Data operations"
              title="Import agent activity"
            />
            <ImportStepper />
            <Feedback
              confirmError={params.confirmError}
              confirmed={params.confirmed}
              error={params.error}
              rejected={params.rejected}
            />
            {processingStatus && ["queued", "processing", "failed", "cancelled"].includes(processingStatus.status) ? (
              <ImportProcessingStatus
                failureReason={processingStatus.failureReason}
                status={processingStatus.status as "queued" | "processing" | "failed" | "cancelled"}
              />
            ) : params.preview ? (
              <StatusBanner tone="danger">
                This draft is unavailable, no longer unpublished, or does not
                belong to the current user. Upload the file again to create a
                fresh preview.
              </StatusBanner>
            ) : null}
            <div className={styles.uploadLayout}>
              <ImportUploadForm />
              <ImportGuide />
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
