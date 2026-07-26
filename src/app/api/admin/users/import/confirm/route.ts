import { confirmUserImport } from "@/admin/user-import-service";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const body = (await request.json()) as {
      batchId?: unknown;
      assignments?: unknown;
    };
    if (typeof body.batchId !== "string" || !Array.isArray(body.assignments)) {
      throw new Error("Invalid import confirmation.");
    }
    const assignments = body.assignments.map((value) => {
      if (!value || typeof value !== "object") throw new Error("Invalid row assignment.");
      const row = value as Record<string, unknown>;
      if (
        !Number.isInteger(row.rowNumber) ||
        typeof row.selected !== "boolean" ||
        !(
          row.role === null ||
          row.role === "admin" ||
          row.role === "manager" ||
          row.role === "agent"
        ) ||
        !(row.teamId === null || typeof row.teamId === "string")
      ) {
        throw new Error("Invalid row assignment.");
      }
      return {
        rowNumber: row.rowNumber as number,
        selected: row.selected,
        role: row.role as "admin" | "manager" | "agent" | null,
        teamId: row.teamId as string | null,
      };
    });
    const result = await confirmUserImport({
      actor,
      batchId: body.batchId,
      assignments,
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "User import failed." },
      { status: 400, headers: HEADERS },
    );
  }
}
