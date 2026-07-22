"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  confirmDialerImportBatch,
  createDialerPreviewBatch,
} from "@/import/service";

export async function previewImportAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role === "agent") {
    redirect("/login");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
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
