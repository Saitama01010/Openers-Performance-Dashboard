import { createUserImportPreview } from "@/admin/user-import-service";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a CSV file.");
    const result = await createUserImportPreview({
      actor,
      fileName: file.name,
      content: await file.text(),
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "CSV preview failed." },
      { status: 400, headers: HEADERS },
    );
  }
}
