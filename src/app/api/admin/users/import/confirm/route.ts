import { confirmUserImport } from "@/admin/user-import-service";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";
import { parseJsonBody, uuidSchema } from "@/http/input";
import { z } from "zod";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;
const assignmentSchema = z.object({
  rowNumber: z.number().int().min(1).max(500),
  selected: z.boolean(),
  role: z.enum(["admin", "manager", "agent"]).nullable(),
  teamId: uuidSchema.nullable(),
}).strict();
const confirmationSchema = z.object({
  batchId: uuidSchema,
  assignments: z.array(assignmentSchema).min(1).max(500),
}).strict();

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const body = await parseJsonBody(request, confirmationSchema, 128 * 1024);
    const result = await confirmUserImport({
      actor,
      batchId: body.batchId,
      assignments: body.assignments,
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError ||
          (error instanceof Error && ["Invalid JSON body.", "Request body is too large."].includes(error.message))
            ? "Invalid import confirmation."
            : "User import failed.",
      },
      { status: 400, headers: HEADERS },
    );
  }
}
