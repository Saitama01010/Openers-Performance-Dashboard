import { getCurrentUser } from "@/auth/session";
import { getImportFile, ImportConfirmationError } from "@/import/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const actor = await getCurrentUser();

  if (!actor) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { batchId } = await params;

  try {
    const file = await getImportFile(actor, batchId);

    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    const encodedFileName = encodeURIComponent(
      file.fileName.replaceAll(/[\r\n]/g, "_"),
    );

    return new Response(file.rawFileContent, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFileName}`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Import-SHA256": file.fileHash,
      },
    });
  } catch (error) {
    if (
      error instanceof ImportConfirmationError &&
      error.code === "forbidden"
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    throw error;
  }
}
