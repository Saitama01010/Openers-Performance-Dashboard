"use client";

import { useMemo, useState } from "react";

import { TemporaryPasswordControls } from "@/components/admin/temporary-password-controls";

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

const STEPS = [
  "Upload",
  "Validate users",
  "Assign roles and teams",
  "Confirm import",
  "Results",
];

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

  const rowByNumber = useMemo(
    () => new Map(preview?.rows.map((row) => [row.rowNumber, row]) ?? []),
    [preview],
  );
  const selected = assignments.filter((assignment) => assignment.selected);
  const ready = selected.filter(
    (assignment) =>
      assignment.role &&
      assignment.teamId &&
      rowByNumber.get(assignment.rowNumber)?.validForAssignment,
  );

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
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Admin only</p>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Import users from CSV</h2>
            <span className="group relative inline-flex">
              <button
                aria-describedby="csv-header-requirements-tooltip"
                aria-label="CSV header requirements"
                className="flex size-5 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                type="button"
              >
                ?
              </button>
              <span
                className="pointer-events-none invisible absolute left-0 top-full z-20 mt-2 w-80 rounded-md border border-border bg-surface p-3 text-xs font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                id="csv-header-requirements-tooltip"
                role="tooltip"
              >
                Required CSV headers: Real Name, American Name, Shift, Email.
                The header names are not case-sensitive, but all four columns
                must be included.
                <span className="mt-2 block font-mono">
                  Example: Real Name,American Name,Shift,Email
                </span>
              </span>
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Up to 500 rows and 1 MB. Required headers: Real Name, American Name,
            Shift, Email.
          </p>
        </div>
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps">
          {STEPS.map((label, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${
                index === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted"
              }`}
              key={label}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <form action={upload} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-72 flex-1 text-sm font-medium">
            User CSV
            <input
              accept=".csv,text/csv"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              name="file"
              required
              type="file"
            />
          </label>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Validating…" : "Upload and validate"}
          </button>
        </form>
      ) : null}

      {step === 1 && preview ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label="Rows" value={preview.rows.length} />
            <Summary
              label="Valid for assignment"
              value={preview.rows.filter((row) => row.validForAssignment).length}
            />
            <Summary
              label="Blocked"
              value={preview.rows.filter((row) => !row.validForAssignment).length}
            />
            <Summary label="Empty rows ignored" value={preview.ignoredEmptyRows} />
          </div>
          {preview.fatalErrors.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-danger">
              {preview.fatalErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : (
            <>
              <ValidationPreviewTable preview={preview} />
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
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
          <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background p-3">
            <select
              aria-label="Bulk role"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              onChange={(event) => setBulkRole(event.target.value as Role)}
              value={bulkRole}
            >
              <option value="agent">Agent</option>
              <option value="manager">Team Manager</option>
              <option value="admin">Administrator</option>
            </select>
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
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
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
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
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
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
              className="rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
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
              className="rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
        <div className="mt-5 space-y-4">
          <p className="text-sm">
            {ready.length} users are ready. Temporary passwords will be
            generated only after confirmation. No invitation emails will be
            sent.
          </p>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={confirm}
            type="button"
          >
            {busy ? "Importing…" : "Confirm import"}
          </button>
        </div>
      ) : null}

      {step === 4 && preview && result ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Created" value={result.summary.created} />
            <Summary label="Skipped" value={result.summary.skipped} />
            <Summary label="Failed" value={result.summary.failed} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-3 py-2">Real Name</th>
                  <th className="px-3 py-2">American Name</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {result.outcomes.map((outcome) => {
                  const row = rowByNumber.get(outcome.rowNumber);
                  const assignment = assignments.find(
                    (item) => item.rowNumber === outcome.rowNumber,
                  );
                  return (
                    <tr className="border-t border-border align-top" key={outcome.rowNumber}>
                      <td className="px-3 py-2">{row?.realName}</td>
                      <td className="px-3 py-2">{row?.americanName}</td>
                      <td className="px-3 py-2">{row?.shift}</td>
                      <td className="px-3 py-2">{row?.email}</td>
                      <td className="px-3 py-2 capitalize">{assignment?.role ?? "—"}</td>
                      <td className="px-3 py-2">
                        {teams.find((team) => team.id === assignment?.teamId)?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="capitalize">{outcome.status}</span>
                        {outcome.reason ? (
                          <p className="mt-1 text-xs text-danger">{outcome.reason}</p>
                        ) : null}
                      </td>
                      <td className="min-w-72 px-3 py-2">
                        {outcome.userId ? (
                          <TemporaryPasswordControls
                            available
                            userId={outcome.userId}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ValidationPreviewTable({ preview }: { preview: Preview }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
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
          {preview.rows.map((row) => (
            <tr className="border-t border-border align-top" key={row.rowNumber}>
              <td className="px-3 py-2">{row.rowNumber}</td>
              <td className="px-3 py-2">{row.realName || "—"}</td>
              <td className="px-3 py-2">{row.americanName || "—"}</td>
              <td className="px-3 py-2">{row.shift || "—"}</td>
              <td className="px-3 py-2">{row.email || "—"}</td>
              <td
                className={`px-3 py-2 ${
                  row.validForAssignment ? "text-primary" : "text-danger"
                }`}
              >
                {row.validForAssignment ? "Valid for assignment" : "Blocked"}
              </td>
              <td className="max-w-80 px-3 py-2 text-muted">
                {[...row.errors, ...row.warnings].join(" ") ||
                  "No validation issues."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
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
          {preview.rows.map((row) => {
            const assignment = assignments.find(
              (item) => item.rowNumber === row.rowNumber,
            )!;
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
                    className="rounded-md border border-border bg-background px-2 py-1"
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
                    className="rounded-md border border-border bg-background px-2 py-1"
                    disabled={!row.validForAssignment}
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
                  <p className={row.errors.length ? "text-danger" : "text-primary"}>
                    {row.errors.length ? "Blocked" : "Ready for assignment"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {[...row.errors, ...row.warnings].join(" ") || "No validation issues."}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
