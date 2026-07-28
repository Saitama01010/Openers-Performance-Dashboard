"use client";

import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteImportAction } from "@/import/actions";
import {
  importStatusLabel,
  importTypeLabel,
} from "@/presentation/labels";
import type { ImportDeletionAssessment } from "@/import/delete-service";
import type { ActiveImportLifecycleOptions } from "@/import/active-lifecycle";

type ImportDeleteFormProps = {
  assessment: ImportDeletionAssessment;
  batchId: string;
  dialer: string;
  fileName: string;
  importType: string;
  lifecycle?: ActiveImportLifecycleOptions;
  reportingPeriod: string;
  rowCount: number;
  status: string;
  team: string;
  uploadDate: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString("en-US")} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PermanentDeleteButton({
  confirmation,
  requiredConfirmation,
}: {
  confirmation: string;
  requiredConfirmation: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className="ui-button ui-button--danger"
      disabled={confirmation !== requiredConfirmation || pending}
      type="submit"
    >
      <span className="ui-button__label">
        {pending ? "Deleting import" : "Permanently delete"}
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
  dialer,
  fileName,
  importType,
  lifecycle,
  reportingPeriod,
  rowCount,
  status,
  team,
  uploadDate,
}: ImportDeleteFormProps) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmationId = useId();
  const reasonId = useId();
  const active = assessment.requiresActiveResolution;
  const requiredConfirmation = active
    ? "DELETE ACTIVE IMPORT"
    : "DELETE IMPORT";

  function openDialog() {
    if (!assessment.allowed || (active && !lifecycle)) return;
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
      <button
        className="ui-button ui-button--danger"
        disabled={!assessment.allowed || (active && !lifecycle)}
        onClick={openDialog}
        ref={triggerRef}
        title={assessment.reason ?? "Permanently delete this import"}
        type="button"
      >
        Delete
      </button>
      {!assessment.allowed && assessment.reason ? (
        <p className="mt-1 max-w-64 text-xs text-muted">
          {assessment.reason}
        </p>
      ) : null}

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          setConfirmation("");
          triggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <div className="ui-dialog__content">
          <div className="ui-dialog__icon" aria-hidden="true">
            !
          </div>
          <div className="min-w-0">
            <h2 className="ui-dialog__title" id={titleId}>
              Permanently delete this import?
            </h2>
            <p className="ui-dialog__description" id={descriptionId}>
              {active
                ? lifecycle?.automaticFallbacks.length
                  ? "The import will be permanently deleted. Its immediately previous valid version will automatically become active and appear on the dashboard. This action cannot be undone."
                  : "The import will be permanently deleted. No previous valid import exists, so this dataset will have no active import after deletion. This action cannot be undone."
                : "This import will be permanently deleted. The current active dashboard version will not change. This action cannot be undone."}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted">File</dt>
            <dd className="break-all font-medium">{fileName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Uploaded</dt>
            <dd>{uploadDate}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Reporting period</dt>
            <dd>{reportingPeriod}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Team</dt>
            <dd>{team}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Dialer</dt>
            <dd>{dialer}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Import type</dt>
            <dd>{importTypeLabel(importType)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Status</dt>
            <dd>{importStatusLabel(status)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Parsed metric rows</dt>
            <dd className="font-mono">{rowCount.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Original CSV stored</dt>
            <dd>
              {assessment.storedFilePresent
                ? `Yes (${assessment.storedFileProvider})`
                : "No or already missing"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">
              Estimated records removed
            </dt>
            <dd className="font-mono">
              {assessment.counts.totalRecords.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Owned metric rows</dt>
            <dd className="font-mono">
              {Math.max(
                0,
                assessment.counts.metricRows -
                  assessment.sharedMetricRowCount,
              ).toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">
              Shared records retained
            </dt>
            <dd className="font-mono">
              {assessment.sharedMetricRowCount.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">
              Staging and validation rows
            </dt>
            <dd className="font-mono">
              {(
                assessment.counts.stagingRows +
                assessment.counts.validationRows
              ).toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">
              Approximate raw-file release
            </dt>
            <dd>{formatBytes(assessment.approximateStorageBytes)}</dd>
          </div>
        </dl>

        {active && lifecycle ? (
          <section className="mt-5 rounded-lg border border-border p-4">
            <h3 className="font-medium">Automatic fallback</h3>
            <p className="mt-1 text-sm text-muted">
              Current version
              {lifecycle.activeVersions.length === 1 ? "" : "s"}:{" "}
              {lifecycle.activeVersions
                .map((version) => `v${version.versionNumber}`)
                .join(", ")}
            </p>
            {lifecycle.automaticFallbacks.length > 0 ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {lifecycle.automaticFallbacks.map((fallback) => (
                  <li key={fallback.scopeKey}>
                    <span className="font-medium">
                      Version {fallback.versionNumber} · {fallback.fileName}
                    </span>
                    <span className="block text-xs text-muted">
                      {(
                        fallback.publishedAt ?? fallback.uploadedAt
                      ).toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No previous valid import exists. This dataset will have no
                active import after deletion.
              </p>
            )}
          </section>
        ) : null}

        <label className="ui-label mt-5" htmlFor={reasonId}>
          Deletion reason
        </label>
        <textarea
          className="ui-input min-h-24"
          id={reasonId}
          minLength={5}
          name="reason"
          required
        />

        <label className="ui-label mt-4" htmlFor={confirmationId}>
          Type {requiredConfirmation} to confirm
        </label>
        <input
          autoComplete="off"
          className="ui-input font-mono"
          id={confirmationId}
          name="confirmation"
          onChange={(event) => setConfirmation(event.target.value)}
          required
          spellCheck={false}
          value={confirmation}
        />

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
          <PermanentDeleteButton
            confirmation={confirmation}
            requiredConfirmation={requiredConfirmation}
          />
        </div>
      </dialog>
    </form>
  );
}
