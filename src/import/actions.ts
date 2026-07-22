"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { assertPermission } from "@/auth/permissions";
import {
  confirmDialerImportBatch,
  createDialerPreviewBatch,
} from "@/import/service";

const MAX_CSV_BYTES = 10 * 1024 * 1024;
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
    file.size > MAX_CSV_BYTES ||
    file.name.length > 255 ||
    !file.name.toLowerCase().endsWith(".csv") ||
    !ALLOWED_CSV_TYPES.has(file.type.toLowerCase())
  ) {
    redirect("/import?error=file");
  }

  const content = await file.text();
  const { batchId } = await createDialerPreviewBatch({
    actor: user,
    source: "dialer",
    fileName: file.name,
    fileContent: content,
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

  try {
    await confirmDialerImportBatch({ actor: user, batchId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    redirect(`/import?preview=${batchId}&confirmError=${encodeURIComponent(message)}`);
  }

  redirect(`/import?confirmed=${batchId}`);
}
