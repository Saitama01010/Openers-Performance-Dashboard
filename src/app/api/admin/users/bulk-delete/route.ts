import { revalidatePath } from "next/cache";

import { parseBulkUserIds } from "@/admin/bulk-user-deletion";
import { permanentlyDeleteUsers } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

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
    const body = (await request.json()) as { userIds?: unknown };
    const userIds = parseBulkUserIds(body?.userIds);
    const result = await permanentlyDeleteUsers(actor, { userIds });

    revalidatePath("/admin/users");
    revalidatePath("/admin/teams");
    for (const userId of result.deletedIds) {
      revalidatePath(`/admin/users/${userId}`);
    }

    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
