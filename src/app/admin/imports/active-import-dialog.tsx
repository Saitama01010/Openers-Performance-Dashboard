"use client";

import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { deactivateImportAction } from "@/import/actions";
import {
  importStatusLabel,
  importTypeLabel,
} from "@/presentation/labels";
import type { ActiveImportLifecycleOptions } from "@/import/active-lifecycle";

type ImportIdentity = {
  batchId: string;
  dialer: string;
  fileName: string;
  importType: string;
  reportingPeriod: string;
  rowCount: number;
  status: string;
  team: string;
  uploadDate: string;
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export type ActiveImportDialogProps = ImportIdentity & {
  lifecycle: ActiveImportLifecycleOptions;
  compactTrigger?: boolean;
  returnPage?: number;
  triggerLabel?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className="ui-button ui-button--danger"
      disabled={pending}
      type="submit"
    >
      {pending ? "Deactivating import" : "Deactivate import"}
    </button>
  );
}

export function ResolutionFields({
  lifecycle,
  mode,
  onModeChange,
}: {
  lifecycle: ActiveImportLifecycleOptions;
  mode: "previous" | "selected" | "none";
  onModeChange: (mode: "previous" | "selected" | "none") => void;
}) {
  const groupId = useId();

  return (
    <fieldset className="mt-5">
      <legend className="ui-label">What should replace this import?</legend>
      <div className="mt-2 grid gap-3">
        <label className="flex items-start gap-3">
          <input
            checked={mode === "previous"}
            disabled={!lifecycle.previousAvailable}
            name="resolutionMode"
            onChange={() => onModeChange("previous")}
            type="radio"
            value="previous"
          />
          <span>
            <span className="block font-medium">
              Restore the previous valid version
            </span>
            <span className="block text-xs text-muted">
              {lifecycle.previousAvailable
                ? "The latest valid historical version for every exact dataset scope will be activated."
                : "A complete previous version is not available for every affected scope."}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            checked={mode === "selected"}
            disabled={lifecycle.fallbackOptions.length === 0}
            name="resolutionMode"
            onChange={() => onModeChange("selected")}
            type="radio"
            value="selected"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              Select another historical version
            </span>
            <select
              aria-label="Historical replacement import"
              className="ui-input mt-2"
              disabled={mode !== "selected"}
              id={groupId}
              name="fallbackBatchId"
              required={mode === "selected"}
            >
              <option value="">Select an import</option>
              {lifecycle.fallbackOptions.map((option) => (
                <option key={option.batchId} value={option.batchId}>
                  {option.fileName} · {option.uploadedAt.toLocaleString("en-US")} ·{" "}
                  {option.versionCount} scope
                  {option.versionCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            checked={mode === "none"}
            name="resolutionMode"
            onChange={() => onModeChange("none")}
            type="radio"
            value="none"
          />
          <span>
            <span className="block font-medium">Leave no active import</span>
            <span className="block text-xs text-muted">
              The dashboard will show an explicit unavailable-data state for
              these scopes.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

export function ImportIdentityDetails({
  dialer,
  fileName,
  importType,
  lifecycle,
  reportingPeriod,
  rowCount,
  status,
  team,
  uploadDate,
}: Omit<ActiveImportDialogProps, "batchId">) {
  return (
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
        <dt className="text-xs uppercase text-muted">Current status</dt>
        <dd>{importStatusLabel(status)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted">Parsed rows</dt>
        <dd className="font-mono">{rowCount.toLocaleString("en-US")}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted">Dashboard totals</dt>
        <dd className="font-mono">
          {lifecycle.totals.calls.toLocaleString("en-US")} calls ·{" "}
          {formatDuration(lifecycle.totals.loggedInSeconds)} login ·{" "}
          {formatDuration(lifecycle.totals.talkSeconds)} talk ·{" "}
          {formatDuration(lifecycle.totals.wrapSeconds)} wrap
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted">Affected scopes</dt>
        <dd className="font-mono">{lifecycle.activeVersionCount}</dd>
      </div>
    </dl>
  );
}

export function ActiveImportDialog(props: ActiveImportDialogProps) {
  const [mode, setMode] = useState<"previous" | "selected" | "none">(
    props.lifecycle.previousAvailable ? "previous" : "none",
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  return (
    <form action={deactivateImportAction}>
      <input name="batchId" type="hidden" value={props.batchId} />
      {props.returnPage ? (
        <input name="returnPage" type="hidden" value={props.returnPage} />
      ) : null}
      <button
        className={`ui-button ui-button--danger${props.compactTrigger ? " ui-button--compact" : ""}`}
        disabled={!props.lifecycle.canDeactivate}
        onClick={() => dialogRef.current?.showModal()}
        ref={triggerRef}
        type="button"
      >
        {props.triggerLabel ?? "Deactivate import"}
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="ui-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        ref={dialogRef}
      >
        <h2 className="ui-dialog__title" id={titleId}>
          Deactivate this active import?
        </h2>
        <p className="ui-dialog__description" id={descriptionId}>
          Its data will immediately stop appearing on the dashboard for this
          dataset scope. Choose whether to restore another version or leave
          this dataset without active data.
        </p>
        <ImportIdentityDetails {...props} />
        <ResolutionFields
          lifecycle={props.lifecycle}
          mode={mode}
          onModeChange={setMode}
        />
        <label className="ui-label mt-5">
          Deactivation reason
          <textarea
            className="ui-input min-h-24"
            minLength={5}
            name="reason"
            required
          />
        </label>
        <div className="ui-dialog__actions">
          <button
            className="ui-button ui-button--secondary"
            onClick={closeDialog}
            type="button"
          >
            Cancel
          </button>
          <SubmitButton />
        </div>
      </dialog>
    </form>
  );
}
