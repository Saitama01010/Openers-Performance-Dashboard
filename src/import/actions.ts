"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { assertPermission } from "@/auth/permissions";
import {
  confirmDialerImportBatch,
  createDialerPreviewBatch,
  ImportConfirmationError,
  listImportHistory,
  rejectDialerImportBatch,
  restoreDialerImportBatch,
  rollbackDialerImportBatch,
} from "@/import/service";
import { MAX_DIALER_CSV_BYTES } from "@/import/config";
import {
  deleteDialerImportBatch,
  ImportDeletionError,
} from "@/import/delete-service";
import {
  ActiveImportLifecycleError,
  type ActiveImportResolution,
  deactivateDialerImportBatch,
} from "@/import/active-lifecycle";

const ALLOWED_CSV_TYPES = new Set([
  "",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
]);

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

  if (
    file.size === 0 ||
    file.size > MAX_DIALER_CSV_BYTES ||
    file.name.length > 255 ||
    !file.name.toLowerCase().endsWith(".csv") ||
    !ALLOWED_CSV_TYPES.has(file.type.toLowerCase())
  ) {
    redirect("/import?error=file");
  }

  const reportingDate = formData.get("reportingDate");

  if (typeof reportingDate !== "string" || reportingDate.length === 0) {
    redirect("/import?error=agent_hours_reporting_date");
  }

  const content = Buffer.from(await file.arrayBuffer());
  let batchId: string;

  try {
    const created = await createDialerPreviewBatch({
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

  if (typeof batchId !== "string" || batchId.length === 0) {
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

    console.error("[dialer import confirmation failed]", {
      actorId: user.id,
      batchId,
      code: confirmError,
      message: error instanceof Error ? error.message : "Unknown import error.",
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

  if (typeof batchId !== "string" || typeof reason !== "string") {
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

function importResolutionFromForm(
  formData: FormData,
): ActiveImportResolution | null {
  const mode = formData.get("resolutionMode");
  const fallbackBatchId = formData.get("fallbackBatchId");

  if (!["previous", "selected", "none"].includes(String(mode))) {
    return null;
  }

  return {
    mode: mode as ActiveImportResolution["mode"],
    fallbackBatchId:
      typeof fallbackBatchId === "string" ? fallbackBatchId : null,
  };
}

export async function deactivateImportAction(formData: FormData) {
  const user = await requireAdminMutation(null);
  const returnPage = requestedHistoryPage(formData);
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");
  const resolution = importResolutionFromForm(formData);

  if (
    typeof batchId !== "string" ||
    typeof reason !== "string" ||
    !resolution
  ) {
    redirect(
      returnPage
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
      returnPage
        ? importHistoryHref(returnPage, code)
        : `/admin/imports/${batchId}?error=${code}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(
    returnPage
      ? importHistoryHref(returnPage)
      : `/admin/imports/${batchId}?deactivated=true`,
  );
}

export async function rollbackImportAction(formData: FormData) {
  const user = await requireAdminMutation("imports.restore");
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");

  if (typeof batchId !== "string" || typeof reason !== "string") {
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
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");

  if (typeof batchId !== "string" || typeof reason !== "string") {
    redirect("/admin/imports?error=restore");
  }

  try {
    await restoreDialerImportBatch({ actor: user, batchId, reason });
  } catch (error) {
    const code =
      error instanceof ImportConfirmationError ? error.code : "restore_failed";
    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?restored=true`);
}

export async function deleteImportAction(formData: FormData) {
  const user = await requireAdminMutation(null);
  const returnPage = requestedHistoryPage(formData);
  const batchId = formData.get("batchId");
  const confirmation = formData.get("confirmation");
  const reason = formData.get("reason");

  if (
    typeof batchId !== "string" ||
    typeof confirmation !== "string" ||
    typeof reason !== "string"
  ) {
    redirect(
      returnPage
        ? importHistoryHref(returnPage, "delete_input_invalid")
        : "/admin/imports?error=delete_input_invalid",
    );
  }

  try {
    await deleteDialerImportBatch({
      actor: user,
      batchId,
      confirmation,
      reason,
    });
  } catch (error) {
    const code =
      error instanceof ImportDeletionError ? error.code : "delete_failed";

    console.error("[dialer import deletion failed]", {
      actorId: user.id,
      batchId,
      code,
      message:
        error instanceof Error ? error.message : "Unknown deletion error.",
    });

    if (returnPage || code === "import_not_found") {
      redirect(importHistoryHref(returnPage ?? 1, code));
    }

    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  revalidatePath("/dashboard");
  if (returnPage) {
    const history = await listImportHistory(user, { page: returnPage });
    const lastPage = Math.max(1, Math.ceil(history.total / history.pageSize));
    redirect(importHistoryHref(Math.min(returnPage, lastPage)));
  }
  redirect("/admin/imports");
}
