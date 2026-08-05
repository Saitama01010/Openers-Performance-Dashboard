import { revalidatePath } from "next/cache";

import { createTeam } from "@/admin/data";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export async function POST(request: Request) {
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
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name !== "string") {
      return Response.json(
        { error: "Team name is required." },
        { status: 400, headers: HEADERS },
      );
    }
    const id = await createTeam(actor, body.name);
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return Response.json({ id }, { status: 201, headers: HEADERS });
  } catch (error) {
    const message =
      error instanceof Error &&
      [
        "A team with this name already exists.",
        "Team name is required.",
        "Untrusted request origin.",
      ].includes(error.message)
        ? error.message
        : "Team creation failed.";
    const status =
      message === "Untrusted request origin."
        ? 403
        : message.includes("already exists")
          ? 409
          : 400;
    return Response.json({ error: message }, { status, headers: HEADERS });
  }
}
