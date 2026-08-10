import { createUserImportPreview } from "@/admin/user-import-service";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";
import { MAX_USER_CSV_BYTES } from "@/admin/user-import-csv";
import { assertFormBodySize } from "@/http/input";
import { validateCsvContent, validateCsvUploadMetadata } from "@/import/file-safety";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    assertFormBodySize(request, MAX_USER_CSV_BYTES + 64 * 1024);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a CSV file.");
    validateCsvUploadMetadata(file, MAX_USER_CSV_BYTES);
    const contentBytes = Buffer.from(await file.arrayBuffer());
    validateCsvContent(contentBytes);
    const result = await createUserImportPreview({
      actor,
      fileName: file.name,
      content: contentBytes.toString("utf8"),
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && [
            "Choose a CSV file.",
            "Choose a valid CSV file within the size limit.",
            "The uploaded file is not valid text CSV data.",
            "Request body is too large.",
            "Untrusted request origin.",
          ].includes(error.message)
            ? error.message
            : "CSV preview failed.",
      },
      { status: 400, headers: HEADERS },
    );
  }
}
