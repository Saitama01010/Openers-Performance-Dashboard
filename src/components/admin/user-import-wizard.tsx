"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { TemporaryPasswordControls } from "@/components/admin/temporary-password-controls";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Badge } from "@/components/ui/base-badge";
import styles from "./users-access.module.css";

type Role = "admin" | "manager" | "agent";
type Team = { id: string; name: string; active: boolean };
type PreviewRow = {
  rowNumber: number;
  realName: string;
  americanName: string;
  shift: string;
  email: string;
  role: Role | null;
  teamId: string | null;
  teamName: string | null;
  errors: string[];
  warnings: string[];
  validForAssignment: boolean;
};
type Preview = {
  headers: string[];
  rows: PreviewRow[];
  ignoredEmptyRows: number;
  fatalErrors: string[];
};
type Assignment = {
  rowNumber: number;
  selected: boolean;
  role: Role | null;
  teamId: string | null;
};
type ImportResult = {
  outcomes: {
    rowNumber: number;
    userId?: string;
    status: "created" | "skipped" | "failed";
    reason?: string;
  }[];
  summary: { created: number; skipped: number; failed: number };
};
type ValidationFilter = "all" | "valid" | "blocked" | "invalid";

const STEPS = [
  "Upload CSV",
  "Validate users",
  "Assign roles & teams",
  "Review & publish",
  "Results",
];

function roleNeedsTeam(role: Role | null) {
  return role === "agent" || role === "manager";
}

function isExistingUser(row: PreviewRow) {
  return row.errors.some(
    (error) => error.includes("already exists") || error.includes("already assigned"),
  );
}

export function UserImportWizard({ teams }: { teams: Team[] }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bulkRole, setBulkRole] = useState<Role>("agent");
  const [bulkTeam, setBulkTeam] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationFilter, setValidationFilter] = useState<ValidationFilter>("all");

  const rowByNumber = useMemo(
    () => new Map(preview?.rows.map((row) => [row.rowNumber, row]) ?? []),
    [preview],
  );
  const selected = assignments.filter((assignment) => assignment.selected);
  const ready = selected.filter(
    (assignment) =>
      assignment.role &&
      (!roleNeedsTeam(assignment.role) || assignment.teamId) &&
      rowByNumber.get(assignment.rowNumber)?.validForAssignment,
  );
  const validRows = preview?.rows.filter((row) => row.validForAssignment) ?? [];
  const blockedRows = preview?.rows.filter(isExistingUser) ?? [];
  const invalidRows = preview?.rows.filter(
    (row) => !row.validForAssignment && !isExistingUser(row),
  ) ?? [];

  async function upload(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users/import/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        batchId?: string | null;
        preview?: Preview;
        error?: string;
      };
      if (!response.ok || !payload.preview) {
        throw new Error(payload.error ?? "CSV preview failed.");
      }
      setPreview(payload.preview);
      setBatchId(payload.batchId ?? null);
      setAssignments(
        payload.preview.rows.map((row) => ({
          rowNumber: row.rowNumber,
          selected: row.validForAssignment,
          role: row.role,
          teamId: row.teamId,
        })),
      );
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV preview failed.");
    } finally {
      setBusy(false);
    }
  }

  function uploadDroppedFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file to continue.");
      return;
    }
    setSelectedFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    void upload(formData);
  }

  function patchRows(
    predicate: (assignment: Assignment) => boolean,
    patch: Partial<Assignment>,
  ) {
    setAssignments((current) =>
      current.map((assignment) =>
        predicate(assignment) ? { ...assignment, ...patch } : assignment,
      ),
    );
  }

  async function confirm() {
    if (!batchId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, assignments }),
      });
      const payload = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Import failed.");
      setResult(payload);
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.wizard}>
      <div className={styles.wizardHeader}>
        <div>
          <p className={styles.eyebrow}>Administration · User provisioning</p>
          <h2 className={styles.sectionTitle}>Import users from CSV</h2>
          <p className={styles.sectionCopy}>Upload, validate every row, assign authoritative roles and teams, then publish only eligible users.</p>
        </div>
        {step > 0 && step < 4 ? <button className={styles.buttonSecondary} onClick={() => setStep(Math.max(0, step - 1))} type="button">Back</button> : null}
      </div>
        <ol className={styles.steps} aria-label="Import steps">
          {STEPS.map((label, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className={index === step ? styles.stepActive : index < step ? styles.stepComplete : styles.step}
              key={label}
              title={stepDescription(index)}
            >
              <span className={styles.stepNumber}>{index < step ? "✓" : index + 1}</span> {label}
            </li>
          ))}
        </ol>

      {error ? (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <form action={upload} className={styles.uploadGrid}>
          <div style={{ display: "grid", gap: 10 }}>
          <label
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files[0];
              if (file) uploadDroppedFile(file);
            }}
          >
            <span className={styles.kpiIcon} style={{ position: "static", margin: "0 auto 10px" }}><DashboardIcon name="import" /></span>
            <strong>Drag and drop your CSV file here</strong>
            <span className={styles.sectionCopy}>or use the file picker</span>
            <input
              accept=".csv,text/csv"
              className={styles.control}
              name="file"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)}
              required
              type="file"
            />
            <span aria-live="polite" className={styles.sectionCopy}>{selectedFileName ? `Selected: ${selectedFileName}` : "CSV up to 5MB"}</span>
          </label>
          <button
            className={styles.button}
            disabled={busy}
          >
            {busy ? "Validating…" : "Upload and validate"}
          </button>
          </div>
          <aside className={styles.requirements}>
            <h3>Required CSV headers</h3>
            <p>Your CSV must include exactly these supported columns:</p>
            <ul><li>Real Name</li><li>American Name</li><li>Shift</li><li>Email</li></ul>
            <p>Header names are case-insensitive. Every row is revalidated on the server before publishing.</p>
            <a className={styles.buttonGhost} download="openers-user-import-template.csv" href="data:text/csv;charset=utf-8,Real%20Name%2CAmerican%20Name%2CShift%2CEmail%0A">Download CSV template</a>
          </aside>
        </form>
      ) : null}

      {step === 1 && preview ? (
        <div className="mt-5 space-y-4">
          <div className={styles.summaryGrid}>
            <Summary active={validationFilter === "all"} detail="All non-empty rows found in this CSV." label="Total rows" onActivate={() => setValidationFilter("all")} total={preview.rows.length} value={preview.rows.length} />
            <Summary active={validationFilter === "valid"} detail="Complete rows that can receive role and team assignments." label="Valid users" onActivate={() => setValidationFilter("valid")} total={preview.rows.length} value={validRows.length} />
            <Summary active={validationFilter === "blocked"} detail="Rows matching an existing email or American Name. No new user will be created." label="Blocked existing" onActivate={() => setValidationFilter("blocked")} total={preview.rows.length} value={blockedRows.length} />
            <Summary active={validationFilter === "invalid"} detail="Rows missing required data or failing validation. Correct and re-upload them." label="Missing / invalid" onActivate={() => setValidationFilter("invalid")} total={preview.rows.length} value={invalidRows.length} />
            <Summary active={validationFilter === "valid"} detail="Valid rows currently eligible for assignment." label="Ready to publish" onActivate={() => setValidationFilter("valid")} total={preview.rows.length} value={validRows.length} />
          </div>
          {preview.fatalErrors.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-danger">
              {preview.fatalErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : (
            <>
              <ValidationPreviewTable filter={validationFilter} key={validationFilter} preview={preview} />
              <button
                className={styles.button}
                onClick={() => setStep(2)}
                type="button"
              >
                Assign roles and teams
              </button>
            </>
          )}
        </div>
      ) : null}

      {step === 2 && preview ? (
        <div className="mt-5 space-y-4">
          <div className={styles.assignmentBar}>
            <select
              aria-label="Bulk role"
              className={styles.control}
              onChange={(event) => setBulkRole(event.target.value as Role)}
              value={bulkRole}
            >
              <option value="agent">Agent</option>
              <option value="manager">Team Manager</option>
              <option value="admin">Administrator</option>
            </select>
            <button
              className={styles.buttonSecondary}
              onClick={() =>
                patchRows((assignment) => assignment.selected, {
                  role: bulkRole,
                })
              }
              type="button"
            >
              Assign role to selected
            </button>
            <button
              className={styles.buttonSecondary}
              onClick={() =>
                patchRows(
                  (assignment) =>
                    Boolean(rowByNumber.get(assignment.rowNumber)?.validForAssignment),
                  { role: bulkRole },
                )
              }
              type="button"
            >
              Assign role to all valid
            </button>
            <select
              aria-label="Bulk team"
              className={styles.control}
              onChange={(event) => setBulkTeam(event.target.value)}
              value={bulkTeam}
            >
              <option value="">Choose team</option>
              {teams
                .filter((team) => team.active)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>
            <button
              className={styles.buttonSecondary}
              disabled={!bulkTeam}
              onClick={() =>
                patchRows((assignment) => assignment.selected, {
                  teamId: bulkTeam,
                })
              }
              type="button"
            >
              Assign team to selected
            </button>
            <button
              className={styles.buttonSecondary}
              disabled={!bulkTeam}
              onClick={() =>
                patchRows(
                  (assignment) =>
                    Boolean(rowByNumber.get(assignment.rowNumber)?.validForAssignment),
                  { teamId: bulkTeam },
                )
              }
              type="button"
            >
              Assign team to all valid
            </button>
          </div>
          <AssignmentTable
            assignments={assignments}
            preview={preview}
            setAssignments={setAssignments}
            teams={teams}
          />
          <div className="flex justify-end">
            <button
              className={styles.button}
              disabled={ready.length === 0 || ready.length !== selected.length}
              onClick={() => setStep(3)}
              type="button"
            >
              Review {ready.length} selected users
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={`${styles.reviewPanel} mt-5 space-y-4`}>
          <h3 className={styles.sectionTitle}>Review &amp; publish</h3>
          <p className="text-sm"><strong>{ready.length}</strong> valid users will be created. <strong>{blockedRows.length}</strong> blocked and <strong>{invalidRows.length}</strong> invalid rows will not be created.</p>
          <p className={styles.sectionCopy}>Only valid users will be created. Temporary passwords are generated after confirmation. Invitation emails are not sent automatically.</p>
          <button
            className={styles.button}
            disabled={busy}
            onClick={confirm}
            type="button"
          >
            {busy ? "Publishing…" : `Publish valid users (${ready.length})`}
          </button>
        </div>
      ) : null}

      {step === 4 && preview && result ? (
        <div className="mt-5 space-y-4">
          <div className={styles.summaryGrid}>
            <Summary label="Created" value={result.summary.created} />
            <Summary label="Skipped" value={result.summary.skipped} />
            <Summary label="Failed" value={result.summary.failed} />
          </div>
          <Link className={styles.buttonSecondary} href="/admin/users">Back to Users &amp; Access</Link>
          <ResultTable assignments={assignments} preview={preview} result={result} teams={teams} />
        </div>
      ) : null}
    </section>
  );
}

function Summary({ active = false, detail, label, onActivate, total = 0, value }: { active?: boolean; detail?: string; label: string; onActivate?: () => void; total?: number; value: number }) {
  const content = <>
      <p>{label}</p>
      <strong>{value}</strong>
      {total > 0 ? <span className={styles.sectionCopy}>{Math.round((value / total) * 100)}% of CSV</span> : null}
      {detail ? <span className={styles.summaryDetail}>{detail}</span> : null}
    </>;
  return onActivate ? <button aria-pressed={active} className={`${styles.summaryCard} ${active ? styles.summaryCardActive : ""}`} onClick={onActivate} type="button">{content}</button> : <div className={styles.summaryCard}>{content}</div>;
}

function ValidationPreviewTable({ filter, preview }: { filter: ValidationFilter; preview: Preview }) {
  const [page, setPage] = useState(1);
  const filteredRows = preview.rows.filter((row) => filter === "all" || (filter === "valid" && row.validForAssignment) || (filter === "blocked" && isExistingUser(row)) || (filter === "invalid" && !row.validForAssignment && !isExistingUser(row)));
  const visibleRows = pageRows(filteredRows, page);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className="text-left text-muted">
          <tr>
            <th className="px-3 py-2">Row number</th>
            <th className="px-3 py-2">Real Name</th>
            <th className="px-3 py-2">American Name</th>
            <th className="px-3 py-2">Shift</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Validation status</th>
            <th className="px-3 py-2">Validation message</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr className="border-t border-border align-top" key={row.rowNumber}>
              <td className="px-3 py-2">{row.rowNumber}</td>
              <td className="px-3 py-2">{row.realName || "—"}</td>
              <td className="px-3 py-2">{row.americanName || "—"}</td>
              <td className="px-3 py-2">{row.shift || "—"}</td>
              <td className="px-3 py-2">{row.email || "—"}</td>
              <td className="px-3 py-2">{row.validForAssignment ? <Badge appearance="light" size="xs" variant="success">VALID</Badge> : isExistingUser(row) ? <Badge appearance="light" size="xs" title={`${row.errors.join(" ")} No new user will be created.`} variant="destructive">BLOCKED</Badge> : <Badge appearance="light" size="xs" title={row.errors.join(" ")} variant="warning">INVALID</Badge>}</td>
              <td className="max-w-80 px-3 py-2 text-muted">
                {[...row.errors, ...row.warnings].join(" ") ||
                  "No validation issues."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination page={page} setPage={setPage} total={filteredRows.length} />
    </div>
  );
}

function AssignmentTable({
  assignments,
  preview,
  setAssignments,
  teams,
}: {
  assignments: Assignment[];
  preview: Preview;
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
  teams: Team[];
}) {
  const [page, setPage] = useState(1);
  const visibleRows = pageRows(preview.rows, page);
  function update(rowNumber: number, patch: Partial<Assignment>) {
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.rowNumber === rowNumber
          ? { ...assignment, ...patch }
          : assignment,
      ),
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className="text-left text-muted">
          <tr>
            <th className="px-3 py-2">Select</th>
            <th className="px-3 py-2">Real Name</th>
            <th className="px-3 py-2">American Name</th>
            <th className="px-3 py-2">Shift</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2">Validation</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const assignment = assignments.find(
              (item) => item.rowNumber === row.rowNumber,
            )!;
            const assignmentIssues = [
              ...row.errors,
              ...(!assignment.role ? ["Assign a role before import."] : []),
              ...(roleNeedsTeam(assignment.role) && !assignment.teamId
                ? ["Assign a team before import."]
                : []),
            ];
            return (
              <tr className="border-t border-border align-top" key={row.rowNumber}>
                <td className="px-3 py-2">
                  <input
                    aria-label={`Select ${row.realName || `row ${row.rowNumber}`}`}
                    checked={assignment.selected}
                    disabled={!row.validForAssignment}
                    onChange={(event) =>
                      update(row.rowNumber, { selected: event.target.checked })
                    }
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-2">{row.realName || "—"}</td>
                <td className="px-3 py-2">{row.americanName || "—"}</td>
                <td className="px-3 py-2">{row.shift || "—"}</td>
                <td className="px-3 py-2">{row.email || "—"}</td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Role for ${row.realName}`}
                    className={styles.compactControl}
                    disabled={!row.validForAssignment}
                    onChange={(event) =>
                      update(row.rowNumber, {
                        role: (event.target.value || null) as Role | null,
                      })
                    }
                    value={assignment.role ?? ""}
                  >
                    <option value="">Assign role</option>
                    <option value="agent">Agent</option>
                    <option value="manager">Team Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Team for ${row.realName}`}
                    className={styles.compactControl}
                    disabled={!row.validForAssignment || assignment.role === "admin"}
                    onChange={(event) =>
                      update(row.rowNumber, {
                        teamId: event.target.value || null,
                      })
                    }
                    value={assignment.teamId ?? ""}
                  >
                    <option value="">Assign team</option>
                    {teams.map((team) => (
                      <option disabled={!team.active} key={team.id} value={team.id}>
                        {team.name}{team.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="max-w-80 px-3 py-2">
                  <p>{row.validForAssignment ? <Badge appearance="light" size="xs" variant="success">VALID</Badge> : isExistingUser(row) ? <Badge appearance="light" size="xs" variant="destructive">BLOCKED</Badge> : <Badge appearance="light" size="xs" variant="warning">INVALID</Badge>}</p>
                  <p className="mt-1 text-xs text-muted">
                    {assignmentIssues.join(" ") || "Ready to publish."}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <TablePagination page={page} setPage={setPage} total={preview.rows.length} />
    </div>
  );
}

function ResultTable({ assignments, preview, result, teams }: { assignments: Assignment[]; preview: Preview; result: ImportResult; teams: Team[] }) {
  const [page, setPage] = useState(1);
  const rowByNumber = new Map(preview.rows.map((row) => [row.rowNumber, row]));
  const visibleOutcomes = pageRows(result.outcomes, page);
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead><tr><th>Real Name</th><th>American Name</th><th>Shift</th><th>Email</th><th>Role</th><th>Team</th><th>Outcome</th><th>Temporary password</th></tr></thead>
      <tbody>{visibleOutcomes.map((outcome) => {
        const row = rowByNumber.get(outcome.rowNumber);
        const assignment = assignments.find((item) => item.rowNumber === outcome.rowNumber);
        return <tr key={outcome.rowNumber}><td>{row?.realName}</td><td>{row?.americanName}</td><td>{row?.shift}</td><td>{row?.email}</td><td className="capitalize">{assignment?.role ?? "—"}</td><td>{teams.find((team) => team.id === assignment?.teamId)?.name ?? "—"}</td><td><span className="capitalize">{outcome.status}</span>{outcome.reason ? <p className="mt-1 text-xs text-danger">{outcome.reason}</p> : null}</td><td className="min-w-72">{outcome.userId ? <TemporaryPasswordControls available userId={outcome.userId} /> : "—"}</td></tr>;
      })}</tbody>
    </table>
    <TablePagination page={page} setPage={setPage} total={result.outcomes.length} />
  </div>;
}

const TABLE_PAGE_SIZE = 25;
function pageRows<T>(rows: T[], page: number) {
  return rows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
}

function TablePagination({ page, setPage, total }: { page: number; setPage: (page: number) => void; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (currentPage - 1) * TABLE_PAGE_SIZE + 1;
  const last = Math.min(currentPage * TABLE_PAGE_SIZE, total);
  return <div className={styles.tablePager} aria-label="Table pagination"><span>Showing {first}–{last} of {total}</span><div><button aria-label="Previous page" className={styles.pageLink} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">‹</button><span>Page {currentPage} of {pageCount}</span><button aria-label="Next page" className={styles.pageLink} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">›</button></div></div>;
}

function stepDescription(index: number) {
  return [
    "Choose a CSV using the four required headers.",
    "Review every normalized row and its authoritative validation result.",
    "Assign real roles and active teams to eligible users.",
    "Confirm exactly which rows will and will not be created.",
    "Review created, skipped, and failed outcomes.",
  ][index];
}
