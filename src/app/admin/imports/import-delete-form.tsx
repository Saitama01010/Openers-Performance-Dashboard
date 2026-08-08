"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

import styles from "@/app/admin/imports/import-history.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { deleteImportAction } from "@/import/actions";
import type { ImportDeletionAssessment } from "@/import/delete-service";

type ImportDeleteFormProps = {
  assessment: ImportDeletionAssessment;
  batchId: string;
  compactTrigger?: boolean;
  fileName?: string;
  reportingPeriod?: string;
  returnPage?: number;
  returnQuery?: string;
  status?: string;
  triggerClassName?: string;
};

function PermanentDeleteButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className={className ?? "ui-button ui-button--danger"}
      disabled={pending}
      type="submit"
    >
      <span className="ui-button__label">
        {pending ? "Deleting permanently…" : "Permanently delete"}
      </span>
      {pending ? (
        <span aria-live="polite" className="ui-button__pending">
          <span aria-hidden="true" className="ui-spinner" />
        </span>
      ) : null}
    </button>
  );
}

export function ImportDeleteForm({
  assessment,
  batchId,
  compactTrigger = false,
  fileName = "This import",
  reportingPeriod = "N/A",
  returnPage,
  returnQuery,
  status = "Unavailable",
  triggerClassName,
}: ImportDeleteFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmation = assessment.requiresActiveResolution
    ? "DELETE ACTIVE IMPORT"
    : "DELETE IMPORT";

  function openDialog() {
    if (!assessment.allowed) return;
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  return (
    <form action={deleteImportAction}>
      <input name="batchId" type="hidden" value={batchId} />
      <input name="confirmation" type="hidden" value={confirmation} />
      <input
        name="reason"
        type="hidden"
        value="Confirmed by administrator in Import History."
      />
      {returnPage ? (
        <input name="returnPage" type="hidden" value={returnPage} />
      ) : null}
      {returnQuery ? (
        <input name="returnQuery" type="hidden" value={returnQuery} />
      ) : null}
      <button
        className={triggerClassName ?? `ui-button ui-button--danger${compactTrigger ? " ui-button--compact" : ""}`}
        disabled={!assessment.allowed}
        onClick={openDialog}
        ref={triggerRef}
        title={assessment.reason ?? "Permanently delete this import"}
        type="button"
      >
        Permanently Delete
      </button>

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`${styles.confirmDialog} import-delete-dialog`}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className={styles.dialogHeading}>
          <span className={styles.dialogIcon} aria-hidden="true">
            <DashboardIcon name="info" />
          </span>
          <div>
            <p className={styles.dialogEyebrow}>Irreversible action</p>
            <h2 id={titleId}>Permanently delete this import?</h2>
          </div>
        </div>
        <p className={styles.dialogDescription} id={descriptionId}>
          This permanently removes the import&apos;s exclusively owned records and
          stored CSV according to the existing retention rules. It cannot be undone.
        </p>
        <dl className={styles.dialogIdentity}>
          <div><dt>File</dt><dd>{fileName}</dd></div>
          <div><dt>Batch ID</dt><dd>{batchId}</dd></div>
          <div><dt>Reporting period</dt><dd>{reportingPeriod}</dd></div>
          <div><dt>Current status</dt><dd>{status}</dd></div>
        </dl>
        {assessment.requiresActiveResolution ? (
          <p className={styles.deleteWarning} role="alert">
            This import is active. The backend will activate the previous valid
            published version for each exact dataset scope when available. If no
            valid fallback exists, that scope will have no active dataset.
          </p>
        ) : null}
        <label className={styles.deleteAcknowledgement}>
          <input name="acknowledgePermanentDeletion" required type="checkbox" />
          <span>I understand that permanent deletion cannot be undone.</span>
        </label>
        <div className={styles.dialogActions}>
          <button
            autoFocus
            className={styles.secondaryButton}
            onClick={closeDialog}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <PermanentDeleteButton className={styles.dangerButton} />
        </div>
      </dialog>
    </form>
  );
}
