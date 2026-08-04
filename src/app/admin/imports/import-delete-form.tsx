"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

import { deleteImportAction } from "@/import/actions";
import type { ImportDeletionAssessment } from "@/import/delete-service";

type ImportDeleteFormProps = {
  assessment: ImportDeletionAssessment;
  batchId: string;
  compactTrigger?: boolean;
  returnPage?: number;
};

function PermanentDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className="ui-button ui-button--danger"
      disabled={pending}
      type="submit"
    >
      <span className="ui-button__label">
        {pending ? "Deleting" : "Yes, delete"}
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
  returnPage,
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
      <button
        className={`ui-button ui-button--danger${compactTrigger ? " ui-button--compact" : ""}`}
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
        className="ui-dialog import-delete-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <h2 className="ui-dialog__title" id={titleId}>
          Delete this import?
        </h2>
        <p className="ui-dialog__description" id={descriptionId}>
          Are you sure you want to permanently delete this import? This action
          cannot be undone.
        </p>
        <div className="ui-dialog__actions">
          <button
            autoFocus
            className="ui-button ui-button--secondary"
            onClick={closeDialog}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <PermanentDeleteButton />
        </div>
      </dialog>
    </form>
  );
}
