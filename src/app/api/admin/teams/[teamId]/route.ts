import { revalidatePath } from "next/cache";

import {
  assignTeamManager,
  moveTeamMember,
  removeTeamMembership,
  renameTeam,
  setTeamStatus,
} from "@/admin/data";
import { getAdminTeamDetails } from "@/admin/teams";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

type TeamMutation =
  | { action: "rename"; name: string }
  | { action: "status"; active: boolean }
  | { action: "assign-manager"; managerId: string }
  | { action: "move-member"; userId: string; targetTeamId: string }
  | { action: "remove-member"; membershipId: string };

function revalidateTeamPaths() {
  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/teams/performance");
  revalidatePath("/dashboard");
}

function errorResponse(error: unknown) {
  const raw = error instanceof Error ? error.message : "Team update failed.";
  const safe = [
    "A team with this name already exists.",
    "Active manager was not found.",
    "Active membership was not found.",
    "Select an active team.",
    "Team name is required.",
    "Team was not found.",
    "Untrusted request origin.",
    "User was not found.",
  ].includes(raw) || raw.startsWith("Move or remove ")
    ? raw
    : "Team update failed.";
  const status = safe === "Untrusted request origin."
    ? 403
    : safe === "Team was not found." || safe === "User was not found."
      ? 404
      : safe.includes("already exists")
        ? 409
        : 400;
  return Response.json({ error: safe }, { status, headers: HEADERS });
}

function parseMutation(body: unknown): TeamMutation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid team update.");
  }
  const record = body as Record<string, unknown>;
  if (record.action === "rename" && typeof record.name === "string") {
    return { action: "rename", name: record.name };
  }
  if (record.action === "status" && typeof record.active === "boolean") {
    return { action: "status", active: record.active };
  }
  if (record.action === "assign-manager" && typeof record.managerId === "string") {
    return { action: "assign-manager", managerId: record.managerId };
  }
  if (record.action === "move-member" && typeof record.userId === "string" && typeof record.targetTeamId === "string") {
    return { action: "move-member", userId: record.userId, targetTeamId: record.targetTeamId };
  }
  if (record.action === "remove-member" && typeof record.membershipId === "string") {
    return { action: "remove-member", membershipId: record.membershipId };
  }
  throw new Error("Invalid team update.");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });
  const { teamId } = await context.params;
  const search = new URL(request.url).searchParams;
  const details = await getAdminTeamDetails(actor, teamId, {
    memberQuery: search.get("memberQuery") ?? "",
    memberPage: Number.parseInt(search.get("memberPage") ?? "1", 10) || 1,
    memberPageSize: Number.parseInt(search.get("memberPageSize") ?? "25", 10) || 25,
  });
  if (!details) return Response.json({ error: "Team was not found." }, { status: 404, headers: HEADERS });
  return Response.json(details, { headers: HEADERS });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });

  try {
    assertTrustedMutationOrigin(request);
    const { teamId } = await context.params;
    const mutation = parseMutation(await request.json());
    if (mutation.action === "rename") {
      await renameTeam(actor, { teamId, name: mutation.name });
    } else if (mutation.action === "status") {
      await setTeamStatus(actor, { teamId, active: mutation.active });
    } else if (mutation.action === "assign-manager") {
      await assignTeamManager(actor, { teamId, managerId: mutation.managerId });
    } else if (mutation.action === "move-member") {
      await moveTeamMember(actor, { userId: mutation.userId, teamId: mutation.targetTeamId });
    } else {
      await removeTeamMembership(actor, mutation.membershipId);
    }
    revalidateTeamPaths();
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
