"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { assertPermission } from "@/auth/permissions";
import {
  confirmDialerImportBatch,
  createDialerPreviewBatch,
  ImportConfirmationError,
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
    redirect("/import?error=reporting_date");
  }

  const content = Buffer.from(await file.arrayBuffer());
  const { batchId } = await createDialerPreviewBatch({
    actor: user,
    source: "dialer",
    fileName: file.name,
    fileContent: content,
    selectedReportingDate: reportingDate,
  });

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

  const warningOverrideReason = formData.get("warningOverrideReason");

  try {
    await confirmDialerImportBatch({
      actor: user,
      batchId,
      warningOverrideReason:
        typeof warningOverrideReason === "string"
          ? warningOverrideReason
          : undefined,
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
  const batchId = formData.get("batchId");
  const reason = formData.get("reason");
  const resolution = importResolutionFromForm(formData);

  if (
    typeof batchId !== "string" ||
    typeof reason !== "string" ||
    !resolution
  ) {
    redirect("/admin/imports?error=deactivation_input_invalid");
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
    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?deactivated=true`);
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
  const batchId = formData.get("batchId");
  const confirmation = formData.get("confirmation");
  const reason = formData.get("reason");

  if (
    typeof batchId !== "string" ||
    typeof confirmation !== "string" ||
    typeof reason !== "string"
  ) {
    redirect("/admin/imports?error=delete_input_invalid");
  }

  let storageCleanupPending = false;

  try {
    const result = await deleteDialerImportBatch({
      actor: user,
      batchId,
      confirmation,
      reason,
    });
    storageCleanupPending = result.storageCleanupPending;
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

    if (code === "import_not_found") {
      redirect(`/admin/imports?error=${code}`);
    }

    redirect(`/admin/imports/${batchId}?error=${code}`);
  }

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batchId}`);
  revalidatePath("/dashboard");
  redirect(
    `/admin/imports?deleted=true${
      storageCleanupPending ? "&storageCleanup=pending" : ""
    }`,
  );
}
