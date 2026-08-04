import Link from "next/link";
import { notFound } from "next/navigation";

import { ImportDeleteForm } from "@/app/admin/imports/import-delete-form";
import { ActiveImportDialog } from "@/app/admin/imports/active-import-dialog";
import {
  restoreImportAction,
  rollbackImportAction,
} from "@/import/actions";
import { getCurrentUser } from "@/auth/session";
import {
  ConfirmSubmitButton,
  SubmitButton,
} from "@/components/dashboard/action-controls";
import {
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { formatDurationSeconds, formatNumber } from "@/import/format";
import { getImportDetails } from "@/import/service";
import { getActiveImportLifecycleOptions } from "@/import/active-lifecycle";
import {
  humanizeIdentifier,
  importStatusLabel,
  matchingStatusLabel,
  validationStatusLabel,
} from "@/presentation/labels";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value?.toLocaleString("en-US") ?? "-";
}

export default async function AdminImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{
    error?: string;
    deactivated?: string;
    restored?: string;
    rolledBack?: string;
  }>;
}) {
  const actor = await getCurrentUser();

  if (!actor || actor.role !== "admin") {
    return null;
  }

  const { batchId } = await params;
  const query = await searchParams;
  const [details, lifecycle] = await Promise.all([
    getImportDetails(actor, batchId),
    getActiveImportLifecycleOptions(actor, batchId),
  ]);

  if (!details) {
    notFound();
  }

  const { batch, comparison, deletion, rows, versions } = details;
  const isFullyActive =
    versions.length > 0 &&
    versions.every((version) => version.activeVersionId === version.id);
  const isRestorable =
    versions.length > 0 &&
    versions.every((version) =>
      ["active", "deactivated", "superseded", "rolled_back"].includes(
        version.status,
      ),
    );
  const reportRows = rows.filter(
    (row) =>
      row.validationStatus !== "valid" || row.matchingStatus !== "mapped",
  );
  const teamNames = Array.from(
    new Set(versions.map((version) => version.teamName ?? "Company")),
  ).sort();
  const reportingPeriod =
    batch.reportingStartDate &&
    batch.reportingEndDate &&
    batch.reportingStartDate !== batch.reportingEndDate
      ? `${batch.reportingStartDate} – ${batch.reportingEndDate}`
      : (batch.reportingStartDate ?? batch.reportingEndDate ?? "-");

  return (
    <section className="dashboard-page">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className="ui-button ui-button--secondary"
              href="/admin/imports"
            >
              Import history
            </Link>
            <a
              className="ui-button ui-button--secondary"
              href={`/api/imports/${batch.id}/download`}
            >
              Download original
            </a>
            {[
              "draft",
              "validation_failed",
              "ready_to_publish",
            ].includes(batch.status) ? (
              <Link
                className="ui-button ui-button--primary"
                href={`/import?preview=${batch.id}`}
              >
                Review draft
              </Link>
            ) : null}
          </div>
        }
        description="Validation, comparison, active-scope, and rollback information for this immutable upload."
        eyebrow="Import history"
        title={batch.fileName}
      />

      {query.error ? (
        <StatusBanner tone="danger">
          The requested version change failed:{" "}
          {humanizeIdentifier(query.error)}.
        </StatusBanner>
      ) : null}
      {query.rolledBack ? (
        <StatusBanner tone="success">
          The latest import was rolled back and its previous versions are active.
        </StatusBanner>
      ) : null}
      {query.deactivated ? (
        <StatusBanner tone="success">
          The import was deactivated and the affected dashboard scopes were
          resolved transactionally.
        </StatusBanner>
      ) : null}
      {query.restored ? (
        <StatusBanner tone="success">
          The selected historical versions were restored.
        </StatusBanner>
      ) : null}

      <section className="ui-card ui-card--padded">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-muted">Status</p>
            <StatusBadge tone={isFullyActive ? "success" : "neutral"}>
              {importStatusLabel(batch.status)}
            </StatusBadge>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Uploaded</p>
            <p>{fmt(batch.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Published</p>
            <p>{fmt(batch.publishedAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Reporting period</p>
            <p>
              {batch.reportingStartDate ?? "-"} –{" "}
              {batch.reportingEndDate ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Granularity</p>
            <p className="capitalize">{batch.granularity}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">
              File reporting date
            </p>
            <p>{batch.selectedReportingDate ?? "Not applicable"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Rows</p>
            <p className="font-mono">{formatNumber(batch.rowCount)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Matched agents</p>
            <p className="font-mono">
              {formatNumber(batch.matchedAgentCount)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Unmatched agents</p>
            <p className="font-mono">
              {formatNumber(batch.unmatchedAgentCount)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">File size</p>
            <p className="font-mono">
              {formatNumber(batch.fileSizeBytes)} bytes
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Dialer</p>
            <p>{batch.dialerId ?? "Default"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Original CSV stored</p>
            <p>
              {deletion.storedFilePresent
                ? `Yes (${deletion.storedFileProvider})`
                : "No or already missing"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">
              Estimated cleanup records
            </p>
            <p className="font-mono">
              {formatNumber(deletion.counts.totalRecords)}
            </p>
          </div>
        </div>
        <p className="mt-4 break-all font-mono text-xs text-muted">
          SHA-256: {batch.fileHash}
        </p>
      </section>

      <section className="ui-card ui-card--padded mt-5">
        <h2 className="ui-card__title">Validation report</h2>
        {(batch.validationErrors ?? []).length > 0 ? (
          <StatusBanner tone="danger">
            <ul className="list-inside list-disc">
              {(batch.validationErrors ?? []).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </StatusBanner>
        ) : null}
        {(batch.validationWarnings ?? []).length > 0 ? (
          <StatusBanner tone="warning">
            <ul className="list-inside list-disc">
              {(batch.validationWarnings ?? []).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </StatusBanner>
        ) : null}
        {(batch.validationNotices ?? []).length > 0 ? (
          <StatusBanner tone="info">
            <ul className="list-inside list-disc">
              {(batch.validationNotices ?? []).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </StatusBanner>
        ) : null}
        {reportRows.length > 0 ? (
          <TableScroll label="Rows with validation or matching findings">
            <table className="ui-table">
              <caption>Rows with validation or matching findings</caption>
              <thead>
                <tr>
                  <th scope="col">CSV row</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Matching</th>
                  <th scope="col">Validation</th>
                  <th scope="col">Messages</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.slice(0, 250).map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="font-mono">{row.rowNumber}</td>
                    <td>{row.sourceAgentName}</td>
                    <td>{matchingStatusLabel(row.matchingStatus)}</td>
                    <td>{validationStatusLabel(row.validationStatus)}</td>
                    <td>
                      {[
                        ...(row.validationMessages ?? []),
                        ...(row.warningMessages ?? []),
                      ].join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No row-level validation or matching findings.
          </p>
        )}
      </section>

      {comparison ? (
        <section className="ui-card ui-card--padded mt-5" id="comparison">
          <h2 className="ui-card__title">Comparison with previous active data</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted">Agents</p>
              <p className="font-mono">
                {comparison.currentAgentCount} → {comparison.matchedAgentCount}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Calls</p>
              <p className="font-mono">
                {formatNumber(comparison.calls.before)} →{" "}
                {formatNumber(comparison.calls.after)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Login time</p>
              <p className="font-mono">
                {formatDurationSeconds(comparison.loggedInSeconds.before).hms}
                {" → "}
                {formatDurationSeconds(comparison.loggedInSeconds.after).hms}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Talk time</p>
              <p className="font-mono">
                {formatDurationSeconds(comparison.talkSeconds.before).hms}
                {" → "}
                {formatDurationSeconds(comparison.talkSeconds.after).hms}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted">New agents</p>
              <p>{comparison.newAgents.join(", ") || "None"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Missing agents</p>
              <p>{comparison.missingAgents.join(", ") || "None"}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="ui-card ui-card--padded mt-5">
        <h2 className="ui-card__title">Dataset versions</h2>
        <TableScroll label="Dataset versions in this import">
          <table className="ui-table">
            <caption>Team and date dataset versions</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Granularity</th>
                <th scope="col">Team</th>
                <th scope="col">Version</th>
                <th scope="col">Rows</th>
                <th scope="col">Calls</th>
                <th scope="col">Login</th>
                <th scope="col">Talk</th>
                <th scope="col">Wrap</th>
                <th scope="col">State</th>
                <th scope="col">Active pointer</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.reportingDate}</td>
                  <td className="capitalize">{version.granularity}</td>
                  <td>{version.teamName ?? "Company"}</td>
                  <td className="font-mono">{version.versionNumber}</td>
                  <td className="font-mono">{version.rowCount}</td>
                  <td className="font-mono">{version.totalCalls}</td>
                  <td className="font-mono">
                    {formatDurationSeconds(version.totalLoggedInSeconds).hms}
                  </td>
                  <td className="font-mono">
                    {formatDurationSeconds(version.totalTalkSeconds).hms}
                  </td>
                  <td className="font-mono">
                    {formatDurationSeconds(version.totalWrapSeconds).hms}
                  </td>
                  <td>{importStatusLabel(version.status)}</td>
                  <td>
                    {version.activeVersionId === version.id ? "Active" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {isFullyActive ? (
        <section
          className="ui-card ui-card--padded mt-5"
          id="deactivate-import"
        >
          <h2 className="ui-card__title">Deactivate active import</h2>
          <p className="ui-card__subtitle">
            Remove this import from live calculations without deleting its
            database records or stored CSV.
          </p>
          <div className="mt-4">
            <ActiveImportDialog
              batchId={batch.id}
              dialer={batch.dialerId ?? "Default"}
              fileName={batch.fileName}
              importType={batch.importType}
              lifecycle={lifecycle}
              reportingPeriod={reportingPeriod}
              rowCount={batch.rowCount}
              status={batch.status}
              team={teamNames.join(", ") || "Company"}
              uploadDate={fmt(batch.createdAt)}
            />
          </div>
        </section>
      ) : null}

      {isFullyActive ? (
        <form action={rollbackImportAction} className="ui-card ui-card--padded mt-5">
          <input name="batchId" type="hidden" value={batch.id} />
          <h2 className="ui-card__title">Undo latest import</h2>
          <p className="ui-card__subtitle">
            Reactivate each scope&apos;s previous valid version without deleting
            this upload.
          </p>
          <label className="ui-label mt-4">
            Rollback reason
            <textarea
              className="ui-input min-h-24"
              minLength={5}
              name="reason"
              required
            />
          </label>
          <ConfirmSubmitButton
            className="mt-3"
            confirmLabel="Roll back import"
            description="This transaction changes every active pointer in this import back to its previous valid version."
            pendingLabel="Rolling back"
            title="Undo latest import?"
          >
            Undo latest import
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {!isFullyActive && isRestorable ? (
        <form
          action={restoreImportAction}
          className="ui-card ui-card--padded mt-5"
          id="restore-import"
        >
          <input name="batchId" type="hidden" value={batch.id} />
          <h2 className="ui-card__title">Restore historical version</h2>
          <p className="ui-card__subtitle">
            Make this import&apos;s valid team/date versions active again. Later
            versions remain preserved.
          </p>
          <label className="ui-label mt-4">
            Restore reason
            <textarea
              className="ui-input min-h-24"
              minLength={5}
              name="reason"
              required
            />
          </label>
          <ConfirmSubmitButton
            className="mt-3"
            confirmLabel="Restore version"
            description="This transaction replaces the current active pointers only for the exact scopes represented by this historical import."
            pendingLabel="Restoring"
            title="Restore historical version?"
          >
            Restore historical version
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {!isFullyActive && !isRestorable ? (
        <div className="mt-5">
          <SubmitButton disabled>Restore unavailable</SubmitButton>
        </div>
      ) : null}

      <section className="ui-card ui-card--padded mt-5" id="permanent-delete">
        <h2 className="ui-card__title">Permanent deletion</h2>
        <p className="ui-card__subtitle">
          Delete only this import&apos;s exclusively owned records and stored
          CSV. Active data, shared aliases, users, teams, and audit history are
          preserved.
        </p>
        <div className="mt-4">
          <ImportDeleteForm
            assessment={deletion}
            batchId={batch.id}
          />
        </div>
      </section>
    </section>
  );
}
