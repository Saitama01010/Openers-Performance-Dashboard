import Link from "next/link";

import { ImportDeleteForm } from "@/app/admin/imports/import-delete-form";
import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { listImportHistory } from "@/import/service";

export const dynamic = "force-dynamic";

function statusTone(
  status: string,
): "danger" | "neutral" | "success" | "warning" {
  if (status === "active") return "success";
  if (["failed", "validation_failed", "rejected"].includes(status)) {
    return "danger";
  }
  if (["ready_to_publish", "draft", "processing", "uploaded"].includes(status)) {
    return "warning";
  }
  return "neutral";
}

function fmt(value: Date | null) {
  return value?.toLocaleString("en-US") ?? "-";
}

function reportingPeriod(start: string | null, end: string | null) {
  if (!start) return "-";
  return end && end !== start ? `${start} – ${end}` : start;
}

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
    error?: string;
    page?: string;
    storageCleanup?: string;
  }>;
}) {
  const actor = await getCurrentUser();

  if (!actor || actor.role !== "admin") {
    return null;
  }

  const params = await searchParams;
  const requestedPage = Number(params.page ?? "1");
  const history = await listImportHistory(actor, {
    page: Number.isInteger(requestedPage) ? requestedPage : 1,
  });
  const totalPages = Math.max(1, Math.ceil(history.total / history.pageSize));

  return (
    <section className="dashboard-page">
      <PageHeader
        actions={
          <Link className="ui-button" href="/import">
            Upload CSV
          </Link>
        }
        description="Review every permanent CSV record, publish drafts, and restore valid historical dataset versions."
        eyebrow="Administrator only"
        title="Import history"
      />

      {params.deleted ? (
        <StatusBanner tone="success">
          The import and its exclusively owned rows were permanently deleted,
          shared records were preserved, and the deletion audit event remains.
        </StatusBanner>
      ) : null}
      {params.storageCleanup === "pending" ? (
        <StatusBanner tone="warning">
          Database deletion completed, but external stored-file cleanup is
          pending. The provider and file location were retained in the durable
          audit event for operational retry.
        </StatusBanner>
      ) : null}
      {params.error ? (
        <StatusBanner tone="danger">
          Import deletion failed: {params.error.replaceAll("_", " ")}.
        </StatusBanner>
      ) : null}

      <section className="ui-card">
        <TableScroll label="Import history">
          <table className="ui-table">
            <caption>Permanent dialer CSV import history</caption>
            <thead>
              <tr>
                <th scope="col">Uploaded</th>
                <th scope="col">File</th>
                <th scope="col">Type</th>
                <th scope="col">Reporting period</th>
                <th scope="col">Team</th>
                <th scope="col">Uploaded by</th>
                <th scope="col">Rows</th>
                <th scope="col">Matched</th>
                <th scope="col">Unmatched</th>
                <th scope="col">Status</th>
                <th scope="col">Published</th>
                <th scope="col">Active</th>
                <th scope="col">Rollback</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={14}
                  description="Upload a CSV to create the first permanent import record."
                  title="No imports"
                />
              ) : (
                history.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{fmt(row.uploadedAt)}</td>
                    <td>
                      <span className="block font-medium">{row.fileName}</span>
                      <span className="block font-mono text-xs text-muted">
                        {row.fileHash.slice(0, 12)}…
                      </span>
                      <span className="block text-xs text-muted">
                        {row.fileSizeBytes.toLocaleString("en-US")} stored bytes
                      </span>
                    </td>
                    <td>{row.importType.replaceAll("_", " ")}</td>
                    <td>
                      {reportingPeriod(
                        row.reportingStartDate,
                        row.reportingEndDate,
                      )}
                    </td>
                    <td>{row.teams.join(", ") || "-"}</td>
                    <td>{row.uploadedBy}</td>
                    <td>
                      <span className="block font-mono">{row.rowCount}</span>
                      <span className="block text-xs text-muted">
                        {row.deletion.counts.totalRecords} cleanup records
                      </span>
                    </td>
                    <td className="font-mono">{row.matchedAgentCount}</td>
                    <td className="font-mono">{row.unmatchedAgentCount}</td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>
                        {row.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                    <td>{fmt(row.publishedAt)}</td>
                    <td>{row.activeVersionCount > 0 ? "Yes" : "No"}</td>
                    <td>{row.rollbackStatus ?? "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="ui-button ui-button--secondary"
                          href={`/admin/imports/${row.id}`}
                        >
                          View details
                        </Link>
                        {[
                          "draft",
                          "validation_failed",
                          "ready_to_publish",
                        ].includes(row.status) ? (
                          <Link
                            className="ui-button ui-button--secondary"
                            href={`/import?preview=${row.id}`}
                          >
                            Review draft
                          </Link>
                        ) : null}
                        <a
                          className="ui-button ui-button--secondary"
                          href={`/api/imports/${row.id}/download`}
                        >
                          Download
                        </a>
                        {row.activeVersionCount > 0 ? (
                          <>
                            <Link
                              className="ui-button ui-button--secondary"
                              href={`/admin/imports/${row.id}#comparison`}
                            >
                              Compare
                            </Link>
                            <Link
                              className="ui-button ui-button--danger"
                              href={`/admin/imports/${row.id}#deactivate-import`}
                            >
                              Deactivate
                            </Link>
                            <Link
                              className="ui-button ui-button--secondary"
                              href={`/admin/imports/${row.id}#deactivate-import`}
                            >
                              Replace active version
                            </Link>
                            <Link
                              className="ui-button ui-button--danger"
                              href={`/admin/imports/${row.id}#permanent-delete`}
                            >
                              Permanently delete
                            </Link>
                          </>
                        ) : (
                          <>
                            {[
                              "deactivated",
                              "superseded",
                              "rolled_back",
                            ].includes(row.status) ? (
                              <Link
                                className="ui-button ui-button--secondary"
                                href={`/admin/imports/${row.id}#restore-import`}
                              >
                                Restore
                              </Link>
                            ) : null}
                            <ImportDeleteForm
                              assessment={row.deletion}
                              batchId={row.id}
                              dialer={row.dialerId ?? "Default"}
                              fileName={row.fileName}
                              importType={row.importType}
                              reportingPeriod={reportingPeriod(
                                row.reportingStartDate,
                                row.reportingEndDate,
                              )}
                              rowCount={row.rowCount}
                              status={row.status}
                              team={row.teams.join(", ") || "Company"}
                              uploadDate={fmt(row.uploadedAt)}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <nav
        aria-label="Import history pagination"
        className="mt-4 flex items-center justify-between"
      >
        <span className="text-sm text-muted">
          Page {history.page} of {totalPages} · {history.total} imports
        </span>
        <div className="flex gap-2">
          {history.page > 1 ? (
            <Link
              className="ui-button ui-button--secondary"
              href={`/admin/imports?page=${history.page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          {history.page < totalPages ? (
            <Link
              className="ui-button ui-button--secondary"
              href={`/admin/imports?page=${history.page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </section>
  );
}
