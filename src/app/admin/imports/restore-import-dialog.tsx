"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

import styles from "@/app/admin/imports/import-history.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { restoreImportAction } from "@/import/actions";

type RestoreImportDialogProps = {
  batchId: string;
  fileName: string;
  reportingPeriod: string;
  returnQuery?: string;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerRole?: "menuitem";
};

function RestoreButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className={styles.primaryButton}
      disabled={pending}
      type="submit"
    >
      {pending ? "Restoring version…" : "Restore version"}
    </button>
  );
}

export function RestoreImportDialog({
  batchId,
  fileName,
  reportingPeriod,
  returnQuery,
  triggerClassName,
  triggerLabel = "Restore",
  triggerRole,
}: RestoreImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  function openDialog() {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  return (
    <form action={restoreImportAction} role={triggerRole ? "none" : undefined}>
      <input name="batchId" type="hidden" value={batchId} />
      {returnQuery ? (
        <input name="returnQuery" type="hidden" value={returnQuery} />
      ) : null}
      <button
        className={triggerClassName ?? styles.secondaryButton}
        onClick={openDialog}
        ref={triggerRef}
        role={triggerRole}
        type="button"
      >
        {triggerLabel}
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={styles.confirmDialog}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className={styles.dialogHeading}>
          <span className={styles.dialogIcon} aria-hidden="true">
            <DashboardIcon name="freshness" />
          </span>
          <div>
            <p className={styles.dialogEyebrow}>Historical dataset</p>
            <h2 id={titleId}>Restore this import?</h2>
          </div>
        </div>
        <p className={styles.dialogDescription} id={descriptionId}>
          This makes the valid versions from this import active for their exact
          dataset scopes. Later imports remain preserved in history.
        </p>
        <dl className={styles.dialogIdentity}>
          <div><dt>File</dt><dd>{fileName}</dd></div>
          <div><dt>Reporting period</dt><dd>{reportingPeriod}</dd></div>
          <div><dt>Batch ID</dt><dd>{batchId}</dd></div>
        </dl>
        <label className={styles.dialogField}>
          Restore reason
          <textarea minLength={5} name="reason" required />
          <span>Briefly document why this historical dataset is approved again.</span>
        </label>
        <div className={styles.dialogActions}>
          <button
            className={styles.secondaryButton}
            onClick={closeDialog}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <RestoreButton />
        </div>
      </dialog>
    </form>
  );
}
