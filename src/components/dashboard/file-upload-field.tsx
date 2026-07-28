"use client";

import { useId, useState } from "react";

export function FileUploadField({
  accept,
  helperText,
  label,
  name,
  required = false,
}: {
  accept?: string;
  helperText?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const inputId = useId();
  const feedbackId = useId();
  const [fileName, setFileName] = useState("");

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={inputId}>
        {label}{" "}
        {required ? <span className="ui-required">(required)</span> : null}
      </label>
      <input
        accept={accept}
        aria-describedby={feedbackId}
        className="ui-file-input"
        id={inputId}
        name={name}
        onChange={(event) =>
          setFileName(event.currentTarget.files?.[0]?.name ?? "")
        }
        required={required}
        type="file"
      />
      <p aria-live="polite" className="ui-helper" id={feedbackId}>
        {fileName
          ? `Selected file: ${fileName}`
          : helperText}
      </p>
    </div>
  );
}
