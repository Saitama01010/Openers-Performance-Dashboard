"use client";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import styles from "@/app/import/import-page.module.css";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { previewImportAction } from "@/import/actions";
import { MAX_DIALER_CSV_BYTES } from "@/import/config";

const ACCEPTED_CSV_TYPES = new Set([
  "",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return "Choose a file with a .csv extension.";
  }

  if (!ACCEPTED_CSV_TYPES.has(file.type.toLowerCase())) {
    return "This file type is not accepted. Choose a CSV export.";
  }

  if (file.size === 0) {
    return "The selected CSV is empty.";
  }

  if (file.size > MAX_DIALER_CSV_BYTES) {
    return `The selected CSV is larger than ${formatFileSize(MAX_DIALER_CSV_BYTES)}.`;
  }

  if (file.name.length > 255) {
    return "The selected filename is too long.";
  }

  return null;
}

function PreviewButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className={styles.primaryButton}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? (
        <>
          <span aria-hidden="true" className={styles.spinner} />
          Preparing preview
        </>
      ) : (
        <>
          Preview import
          <DashboardIcon name="arrowRight" />
        </>
      )}
    </button>
  );
}

export function ImportUploadForm() {
  const inputId = useId();
  const feedbackId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function assignFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      setError(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    const nextError = validateFile(nextFile);
    setError(nextError);

    if (nextError) {
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    if (inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(nextFile);
      inputRef.current.files = transfer.files;
    }

    setFile(nextFile);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    assignFile(event.dataTransfer.files[0] ?? null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!file || error) {
      event.preventDefault();
      setError(error ?? "Choose a CSV file before preparing the preview.");
    }
  }

  return (
    <section aria-labelledby="upload-heading" className={styles.uploadCard}>
      <form action={previewImportAction} onSubmit={handleSubmit}>
        <h2 id="upload-heading">1. Upload your CSV file</h2>

        <div
          aria-describedby={feedbackId}
          className={`${styles.dropZone}${isDragging ? ` ${styles.dropZoneActive}` : ""}${error ? ` ${styles.dropZoneError}` : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) {
              setIsDragging(false);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
        >
          <input
            accept=".csv,text/csv,text/plain,application/vnd.ms-excel"
            className={styles.fileInput}
            id={inputId}
            name="file"
            onChange={(event) => assignFile(event.currentTarget.files?.[0] ?? null)}
            ref={inputRef}
            required
            type="file"
          />
          <div aria-hidden="true" className={styles.uploadIllustration}>
            <span className={styles.fileSheet}>CSV</span>
            <span className={styles.uploadBubble}>
              <DashboardIcon name="import" />
            </span>
          </div>
          <p className={styles.dropZoneTitle}>
            {isDragging ? "Drop file here" : "Drag and drop your CSV file here"}
          </p>
          <p className={styles.dropZoneSubtitle}>or choose it from your device</p>
          <button
            className={styles.chooseButton}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Choose CSV file
          </button>
          <p className={styles.retentionNote}>
            Your file is retained privately. Dashboard data changes only after
            the reviewed draft is published.
          </p>
        </div>

        <p
          aria-live="polite"
          className={error ? styles.fileError : styles.fileFeedback}
          id={feedbackId}
          role={error ? "alert" : "status"}
        >
          {error ?? (file ? `Selected file: ${file.name}` : "No file selected.")}
        </p>

        <div className={styles.formGrid}>
          <label className={styles.fieldLabel}>
            <span>2. File reporting date</span>
            <span className={styles.inputShell}>
              <input name="reportingDate" required type="date" />
              <DashboardIcon name="calendar" />
            </span>
            <small>
              Choose the date represented by the totals in this CSV. All
              imported agent rows will be assigned to this date.
            </small>
          </label>

          <div className={styles.fieldLabel}>
            <span>3. Agent activity CSV (required)</span>
            <div className={styles.selectedFile}>
              <span className={styles.selectedFileIcon} aria-hidden="true">CSV</span>
              <span className={styles.selectedFileCopy}>
                <strong>{file?.name ?? "No file chosen"}</strong>
                <small>{file ? `CSV · ${formatFileSize(file.size)}` : "Choose a CSV export from your dialer."}</small>
              </span>
              {file ? (
                <span className={styles.fileActions}>
                  <button onClick={() => inputRef.current?.click()} type="button">
                    Replace
                  </button>
                  <button onClick={() => assignFile(null)} type="button">
                    Remove
                  </button>
                </span>
              ) : (
                <button
                  className={styles.inlineChoose}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  Choose file
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className={styles.securityNotice}>
          <DashboardIcon name="permissions" />
          <div>
            <strong>Private &amp; secure</strong>
            <p>
              Uploads are retained as import drafts and are available only
              through authorized dashboard workflows.
            </p>
          </div>
        </aside>

        <div className={styles.uploadActions}>
          <PreviewButton disabled={!file || Boolean(error)} />
        </div>
      </form>
    </section>
  );
}
