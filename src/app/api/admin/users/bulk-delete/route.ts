import { revalidatePath } from "next/cache";

import { parseBulkUserIds } from "@/admin/bulk-user-deletion";
import { permanentlyDeleteUsers } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";
import { parseJsonBody, uuidSchema } from "@/http/input";
import { z } from "zod";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;
const bodySchema = z.object({
  userIds: z.array(uuidSchema).min(1).max(100),
}).strict();

const SAFE_ERRORS = new Set([
  "One or more selected user IDs are invalid.",
  "One or more selected users were not found.",
  "Select at least one user.",
  "Select no more than 100 users at a time.",
  "The final active admin cannot be changed.",
  "Untrusted request origin.",
  "You cannot permanently delete your own account.",
]);

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "One or more selected user IDs are invalid." },
      { status: 400, headers: HEADERS },
    );
  }
  const message =
    error instanceof Error && SAFE_ERRORS.has(error.message)
      ? error.message
      : "User deletion failed.";
  const status =
    message === "Untrusted request origin." ? 403
    : message.includes("not found") ? 404
    : 400;
  return Response.json({ error: message }, { status, headers: HEADERS });
}

export async function DELETE(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: HEADERS },
    );
  }
  if (actor.role !== "admin") {
    return Response.json(
      { error: "Administrator access required." },
      { status: 403, headers: HEADERS },
    );
  }

  try {
    assertTrustedMutationOrigin(request);
    const body = await parseJsonBody(request, bodySchema, 8 * 1024);
    const userIds = parseBulkUserIds(body.userIds);
    const result = await permanentlyDeleteUsers(actor, { userIds });

    revalidatePath("/admin/users");
    revalidatePath("/admin/teams");
    revalidatePath("/agents");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/performance");
    revalidatePath("/teams/performance");
    for (const userId of result.deletedIds) {
      revalidatePath(`/admin/users/${userId}`);
    }

    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
