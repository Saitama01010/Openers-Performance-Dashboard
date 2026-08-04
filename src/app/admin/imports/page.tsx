import Link from "next/link";

import { ActiveImportDialog } from "@/app/admin/imports/active-import-dialog";
import { ImportDeleteForm } from "@/app/admin/imports/import-delete-form";
import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { getActiveImportLifecycleOptions } from "@/import/active-lifecycle";
import { listImportHistory } from "@/import/service";
import {
  humanizeIdentifier,
  importStatusLabel,
  importTypeLabel,
} from "@/presentation/labels";

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
    error?: string;
    page?: string;
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
  const lifecycleEntries = await Promise.all(
    history.rows
      .filter((row) => row.activeVersionCount > 0)
      .map(async (row) => [
        row.id,
        await getActiveImportLifecycleOptions(actor, row.id),
      ] as const),
  );
  const lifecycleByBatchId = new Map(lifecycleEntries);

  return (
    <section className="dashboard-page">
      <PageHeader
        actions={
          <Link className="ui-button ui-button--primary" href="/import">
            Upload CSV
          </Link>
        }
        description="Review every permanent CSV record, publish drafts, and restore valid historical dataset versions."
        eyebrow="Administrator only"
        title="Import history"
      />

      {params.error ? (
        <StatusBanner tone="danger">
          Import deletion failed: {humanizeIdentifier(params.error)}.
        </StatusBanner>
      ) : null}

      <section className="ui-card">
        <TableScroll label="Import history">
          <table className="ui-table import-history-table">
            <caption>Permanent dialer CSV import history</caption>
            <thead>
              <tr>
                <th scope="col">Uploaded Date</th>
                <th scope="col">Type</th>
                <th scope="col">Reporting Period</th>
                <th scope="col">Uploaded By</th>
                <th scope="col">Status</th>
                <th scope="col">Published</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  description="Upload a CSV to create the first permanent import record."
                  title="No imports"
                />
              ) : (
                history.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="import-history-table__date">
                      {fmt(row.uploadedAt)}
                    </td>
                    <td>
                      <span className="block">
                        {importTypeLabel(row.importType)}
                      </span>
                      <span className="block text-xs capitalize text-muted">
                        {row.granularity}
                      </span>
                    </td>
                    <td>
                      {reportingPeriod(
                        row.reportingStartDate,
                        row.reportingEndDate,
                      )}
                    </td>
                    <td>{row.uploadedBy}</td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>
                        {importStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="import-history-table__date">{fmt(row.publishedAt)}</td>
                    <td className="import-history-table__actions">
                      <div className="import-history-actions">
                        <Link
                          className="ui-button ui-button--secondary ui-button--compact"
                          href={`/admin/imports/${row.id}`}
                        >
                          View Details
                        </Link>
                        {lifecycleByBatchId.get(row.id)?.canDeactivate ? (
                          <ActiveImportDialog
                            batchId={row.id}
                            compactTrigger
                            dialer={row.dialerId ?? "Default"}
                            fileName={row.fileName}
                            importType={row.importType}
                            lifecycle={lifecycleByBatchId.get(row.id)!}
                            reportingPeriod={reportingPeriod(
                              row.reportingStartDate,
                              row.reportingEndDate,
                            )}
                            returnPage={history.page}
                            rowCount={row.rowCount}
                            status={row.status}
                            team={row.teams.join(", ") || "Company"}
                            triggerLabel="Deactivate"
                            uploadDate={fmt(row.uploadedAt)}
                          />
                        ) : null}
                        <ImportDeleteForm
                          assessment={row.deletion}
                          batchId={row.id}
                          compactTrigger
                          returnPage={history.page}
                        />
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
