"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { logServerError } from "@/lib/logging";
import { assertPermission } from "@/auth/permissions";
import {
  confirmDialerImportBatch,
  enqueueDialerPreviewBatch,
  ImportConfirmationError,
  listImportHistory,
  rejectDialerImportBatch,
  restoreDialerImportBatch,
  rollbackDialerImportBatch,
} from "@/import/service";
import { MAX_DIALER_CSV_BYTES } from "@/import/config";
import { validateCsvContent, validateCsvUploadMetadata } from "@/import/file-safety";
import {
  deleteDialerImportBatch,
  ImportDeletionError,
} from "@/import/delete-service";
import {
  ActiveImportLifecycleError,
  type ActiveImportResolution,
  deactivateDialerImportBatch,
} from "@/import/active-lifecycle";

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.length <= 500;
}

export async function previewImportAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role === "agent") {
    redirect("/login");
  }

  await assertPermission(
    user,
    user.role === "admin" ? "imports.company" : "imports.team",
  );

  const file = formData.get("file");

  if (!(file instanceof File)) {
    redirect("/import?error=file");
  }

  try {
    validateCsvUploadMetadata(file, MAX_DIALER_CSV_BYTES);
  } catch {
    redirect("/import?error=file");
  }

  const reportingDate = formData.get("reportingDate");

  if (typeof reportingDate !== "string" || reportingDate.length === 0) {
    redirect("/import?error=agent_hours_reporting_date");
  }

  const content = Buffer.from(await file.arrayBuffer());
  try {
    validateCsvContent(content);
  } catch {
    redirect("/import?error=file");
  }
  let batchId: string;

  try {
    const created = await enqueueDialerPreviewBatch({
      actor: user,
      source: "dialer",
      fileName: file.name,
      fileContent: content,
      selectedReportingDate: reportingDate,
    });
    batchId = created.batchId;
  } catch (error) {
    if (
      error instanceof ImportConfirmationError &&
      error.code === "invalid_reporting_date"
    ) {
      redirect("/import?error=agent_hours_reporting_date");
    }

    redirect("/import?error=file");
  }

  redirect(`/import?preview=${batchId}`);
}

export async function confirmImportAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role === "agent") {
    redirect("/login");
  }

  await assertPermission(
    user,
    user.role === "admin" ? "imports.company" : "imports.team",
  );

  const batchId = formData.get("batchId");

  if (!validId(batchId)) {
    redirect("/import?error=preview");
  }

  try {
    await confirmDialerImportBatch({
      actor: user,
      batchId,
    });
  } catch (error) {
    const confirmError =
      error instanceof ImportConfirmationError
        ? error.code
        : "confirm_failed";

    logServerError({
      action: "import.confirm",
      actorId: user.id,
      entityId: batchId,
      category: confirmError,
      error,
    });

    redirect(`/import?preview=${batchId}&confirmError=${confirmError}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/import");
  revalidatePath("/admin/imports");
  redirect(`/import?confirmed=${batchId}`);
}

export async function rejectImportAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role === "agent") {
    redirect("/login");
  }

  await assertPermission(
    user,
    user.role === "admin" ? "imports.company" : "imports.team",
  );

  const batchId = formData.get("batchId");
  const reason = formData.get("reason");

  if (!validId(batchId) || !validReason(reason)) {
    redirect("/import?error=preview");
  }

  try {
    await rejectDialerImportBatch({ actor: user, batchId, reason });
  } catch (error) {
    const code =
      error instanceof ImportConfirmationError ? error.code : "reject_failed";
    redirect(`/import?preview=${batchId}&confirmError=${code}`);
  }

  revalidatePath("/import");
  revalidatePath("/admin/imports");
  redirect("/import?rejected=true");
}

async function requireAdminMutation(
  permissionKey: "imports.company" | "imports.restore" | null = "imports.company",
) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  if (permissionKey) {
    await assertPermission(user, permissionKey);
  }
  return user;
}

function requestedHistoryPage(formData: FormData) {
  const value = Number(formData.get("returnPage"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function importHistoryHref(page: number, error?: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/admin/imports?${query}` : "/admin/imports";
}

const HISTORY_QUERY_KEYS = new Set([
  "q",
  "status",
  "type",
  "uploader",
  "range",
  "sort",
  "order",
  "page",
  "pageSize",
]);

function requestedHistoryQuery(formData: FormData) {
  const value = formData.get("returnQuery");
  if (typeof value !== "string" || value.length > 1_000) return null;
  const requested = new URLSearchParams(value);
  const safe = new URLSearchParams();
  for (const [key, entry] of requested) {
    if (HISTORY_QUERY_KEYS.has(key) && entry.length <= 200) safe.set(key, entry);
  }
  return safe;
}

function importHistoryQueryHref(
  query: URLSearchParams,
  additions: Record<string, string | null | undefined> = {},
) {
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(additions)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const value = params.toString();
  return value ? `/admin/imports?${value}` : "/admin/imports";
}

function historyListInput(query: URLSearchParams) {
  const page = Number(query.get("page") ?? "1");
  const pageSize = Number(query.get("pageSize") ?? "25");
  const range = query.get("range");
  const sort = query.get("sort");
  return {
    search: query.get("q") ?? undefined,
    status: query.get("status") ?? undefined,
    importType: query.get("type") ?? undefined,
    uploadedById: query.get("uploader") ?? undefined,
    dateRange: ["7d", "30d", "90d", "year", "all"].includes(String(range))
      ? (range as "7d" | "30d" | "90d" | "year" | "all")
      : "all",
    sort: ["uploadedAt", "fileName", "reportingPeriod", "status"].includes(
      String(sort),
    )
      ? (sort as "uploadedAt" | "fileName" | "reportingPeriod" | "status")
      : "uploadedAt",
    order: query.get("order") === "asc" ? ("asc" as const) : ("desc" as const),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [10, 25, 50, 100].includes(pageSize) ? pageSize : 25,
  };
}

function importResolutionFromForm(
  formData: FormData,
): ActiveImportResolution | null {
  const mode = formData.get("resolutionMode");
  const fallbackBatchId = formData.get("fallbackBatchId");

  if (!["previous", "selected", "none"].includes(String(mode))) {
    return null;
  }
  if (mode === "selected" && !validId(fallbackBatchId)) return null;

  return {
    mode: mode as ActiveImportResolution["mode"],
    fallbackBatchId:
      validId(fallbackBatchId) ? fallbackBatchId : null,
  };
}

export async function deactivateImportAction(formData: FormData) {
  const user = await requireAdminMutation(null);
  const returnPage = requestedHistoryPage(formData);
  const returnQuery = requestedHistoryQuery(formData);
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");
  const resolution = importResolutionFromForm(formData);

  if (
    !validId(batchId) ||
    !validReason(reason) ||
    !resolution
  ) {
    redirect(
      returnQuery
        ? importHistoryQueryHref(returnQuery, { error: "deactivation_input_invalid" })
        : returnPage
        ? importHistoryHref(returnPage, "deactivation_input_invalid")
        : "/admin/imports?error=deactivation_input_invalid",
    );
  }

  try {
    await deactivateDialerImportBatch({
      actor: user,
      batchId,
      reason,
      resolution,
    });
  } catch (error) {
    const code =
      error instanceof ActiveImportLifecycleError
        ? error.code
        : "deactivation_failed";
    redirect(
      returnQuery
        ? importHistoryQueryHref(returnQuery, { error: code })
        : returnPage
        ? importHistoryHref(returnPage, code)
        : `/admin/imports/${batchId}?error=${code}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(
    returnQuery
      ? importHistoryQueryHref(returnQuery, { deactivated: "true", error: null })
      : returnPage
      ? importHistoryHref(returnPage)
      : `/admin/imports/${batchId}?deactivated=true`,
  );
}

export async function rollbackImportAction(formData: FormData) {
  const user = await requireAdminMutation("imports.restore");
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");

  if (!validId(batchId) || !validReason(reason)) {
    redirect("/admin/imports?error=rollback");
  }

  try {
    await rollbackDialerImportBatch({ actor: user, batchId, reason });
  } catch (error) {
    const code =
      error instanceof ImportConfirmationError ? error.code : "rollback_failed";
    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?rolledBack=true`);
}

export async function restoreImportAction(formData: FormData) {
  const user = await requireAdminMutation("imports.restore");
  const returnQuery = requestedHistoryQuery(formData);
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");

  if (!validId(batchId) || !validReason(reason)) {
    redirect(
      returnQuery
        ? importHistoryQueryHref(returnQuery, { error: "restore_input_invalid" })
        : "/admin/imports?error=restore",
    );
  }

  try {
    await restoreDialerImportBatch({ actor: user, batchId, reason });
  } catch (error) {
    const code =
      error instanceof ImportConfirmationError ? error.code : "restore_failed";
    redirect(
      returnQuery
        ? importHistoryQueryHref(returnQuery, { error: code })
        : `/admin/imports/${batchId}?error=${code}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(
    returnQuery
      ? importHistoryQueryHref(returnQuery, { restored: "true", error: null })
      : `/admin/imports/${batchId}?restored=true`,
  );
}

export async function deleteImportAction(formData: FormData) {
  const user = await requireAdminMutation(null);
  const returnPage = requestedHistoryPage(formData);
  const returnQuery = requestedHistoryQuery(formData);
  const batchId = formData.get("batchId");
  const confirmation = formData.get("confirmation");
  const reason = formData.get("reason");

  if (
    !validId(batchId) ||
    typeof confirmation !== "string" ||
    !validReason(reason)
  ) {
    redirect(
      returnQuery
        ? importHistoryQueryHref(returnQuery, { error: "delete_input_invalid" })
        : returnPage
        ? importHistoryHref(returnPage, "delete_input_invalid")
        : "/admin/imports?error=delete_input_invalid",
    );
  }

  let result: Awaited<ReturnType<typeof deleteDialerImportBatch>>;
  try {
    result = await deleteDialerImportBatch({
      actor: user,
      batchId,
      confirmation,
      reason,
    });
  } catch (error) {
    const code =
      error instanceof ImportDeletionError ? error.code : "delete_failed";

    logServerError({
      action: "import.delete",
      actorId: user.id,
      entityId: batchId,
      category: code,
      error,
    });

    if (returnQuery) {
      redirect(importHistoryQueryHref(returnQuery, { error: code }));
    }

    if (returnPage || code === "import_not_found") {
      redirect(importHistoryHref(returnPage ?? 1, code));
    }

    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  revalidatePath("/dashboard");
  if (returnQuery) {
    const input = historyListInput(returnQuery);
    const history = await listImportHistory(user, input);
    const lastPage = Math.max(1, Math.ceil(history.total / history.pageSize));
    if (input.page > lastPage) {
      returnQuery.set("page", String(lastPage));
    }
    const fallbackNames = Array.from(
      new Set(result.automaticallyActivatedFallbacks.map((item) => item.fileName)),
    );
    redirect(
      importHistoryQueryHref(returnQuery, {
        deleted: result.deletedFileName,
        error: null,
        fallback:
          fallbackNames.length === 1
            ? fallbackNames[0]
            : fallbackNames.length > 1
              ? `${fallbackNames.length} previous imports`
              : null,
        noActive: result.noActiveVersionSelected ? "true" : null,
      }),
    );
  }
  if (returnPage) {
    const history = await listImportHistory(user, { page: returnPage });
    const lastPage = Math.max(1, Math.ceil(history.total / history.pageSize));
    redirect(importHistoryHref(Math.min(returnPage, lastPage)));
  }
  redirect("/admin/imports");
}
