import Link from "next/link";
import { redirect } from "next/navigation";

import { ImportHistoryWorkspace } from "@/app/admin/imports/import-history-workspace";
import styles from "@/app/admin/imports/import-history.module.css";
import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { PageHeader, StatusBanner } from "@/components/dashboard/dashboard-primitives";
import { getActiveImportLifecycleOptions } from "@/import/active-lifecycle";
import {
  listImportHistory,
  type ImportHistoryFilters,
} from "@/import/service";
import { humanizeIdentifier } from "@/presentation/labels";

export const dynamic = "force-dynamic";

const ranges = new Set<NonNullable<ImportHistoryFilters["dateRange"]>>([
  "7d",
  "30d",
  "90d",
  "year",
  "all",
]);
const sorts = new Set<NonNullable<ImportHistoryFilters["sort"]>>([
  "uploadedAt",
  "fileName",
  "reportingPeriod",
  "status",
]);

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deactivated?: string;
    deleted?: string;
    error?: string;
    fallback?: string;
    noActive?: string;
    order?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    range?: string;
    restored?: string;
    sort?: string;
    status?: string;
    type?: string;
    uploader?: string;
  }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const pageSizeValue = positiveInteger(params.pageSize, 25);
  const pageSize = [10, 25, 50, 100].includes(pageSizeValue)
    ? pageSizeValue
    : 25;
  const filters = {
    search: params.q?.trim() ?? "",
    status: params.status ?? "",
    importType: params.type ?? "",
    uploadedById: params.uploader ?? "",
    dateRange: ranges.has(params.range as NonNullable<ImportHistoryFilters["dateRange"]>)
      ? (params.range as NonNullable<ImportHistoryFilters["dateRange"]>)
      : "all",
    sort: sorts.has(params.sort as NonNullable<ImportHistoryFilters["sort"]>)
      ? (params.sort as NonNullable<ImportHistoryFilters["sort"]>)
      : "uploadedAt",
    order: params.order === "asc" ? "asc" : "desc",
  } satisfies ImportHistoryFilters & {
    dateRange: NonNullable<ImportHistoryFilters["dateRange"]>;
    order: NonNullable<ImportHistoryFilters["order"]>;
    sort: NonNullable<ImportHistoryFilters["sort"]>;
  };
  const history = await listImportHistory(actor, {
    ...filters,
    page: positiveInteger(params.page, 1),
    pageSize,
  });
  const lifecycleEntries = await Promise.all(
    history.rows
      .filter((row) => row.activeVersionCount > 0)
      .map(async (row) => [
        row.id,
        await getActiveImportLifecycleOptions(actor, row.id),
      ] as const),
  );

  return (
    <section className={`${styles.historyPage} dashboard-page`}>
      <PageHeader
        actions={
          <Link className={styles.uploadButton} href="/import">
            <DashboardIcon name="import" />
            Upload CSV
          </Link>
        }
        description="Review all past imports, their status, and manage active datasets."
        eyebrow="Data operations"
        title="Import history"
      />

      {params.error ? (
        <StatusBanner tone="danger">
          The Import History action failed: {humanizeIdentifier(params.error)}.
          Review the selected version and try again.
        </StatusBanner>
      ) : null}
      {params.deactivated ? (
        <StatusBanner tone="success">
          The active import was deactivated and its affected dataset scopes were
          resolved transactionally.
        </StatusBanner>
      ) : null}
      {params.restored ? (
        <StatusBanner tone="success">
          The selected historical import was restored and now powers its valid
          dataset scopes.
        </StatusBanner>
      ) : null}
      {params.deleted ? (
        <StatusBanner tone="success">
          {params.deleted} was permanently deleted.
          {params.fallback
            ? ` ${params.fallback} is now the active fallback.`
            : params.noActive
              ? " No previous valid version was available, so the affected scope has no active dataset."
              : ""}
        </StatusBanner>
      ) : null}

      <ImportHistoryWorkspace
        facets={history.facets}
        filters={filters}
        lifecycleEntries={lifecycleEntries}
        page={history.page}
        pageSize={history.pageSize}
        rows={history.rows}
        summary={history.summary}
        total={history.total}
      />
    </section>
  );
}
