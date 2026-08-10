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
import { pageSchema, pageSizeSchema, parseJsonBody, uuidSchema } from "@/http/input";
import { z } from "zod";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const paramsSchema = z.object({ teamId: uuidSchema }).strict();
const querySchema = z.object({
  memberQuery: z.string().max(200).default(""),
  memberPage: pageSchema.default(1),
  memberPageSize: pageSizeSchema.default(25),
}).strict();
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(255) }).strict(),
  z.object({ action: z.literal("status"), active: z.boolean() }).strict(),
  z.object({ action: z.literal("assign-manager"), managerId: uuidSchema }).strict(),
  z.object({ action: z.literal("move-member"), userId: uuidSchema, targetTeamId: uuidSchema }).strict(),
  z.object({ action: z.literal("remove-member"), membershipId: uuidSchema }).strict(),
]);
type TeamMutation = z.infer<typeof mutationSchema>;

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

export async function GET(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401, headers: HEADERS });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: HEADERS });
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) return Response.json({ error: "Invalid team ID." }, { status: 400, headers: HEADERS });
  const { teamId } = parsedParams.data;
  const search = new URL(request.url).searchParams;
  const parsedQuery = querySchema.safeParse({
    memberQuery: search.get("memberQuery") ?? "",
    memberPage: search.get("memberPage") ?? "1",
    memberPageSize: search.get("memberPageSize") ?? "25",
  });
  if (!parsedQuery.success) return Response.json({ error: "Invalid team query." }, { status: 400, headers: HEADERS });
  const details = await getAdminTeamDetails(actor, teamId, {
    ...parsedQuery.data,
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
    const { teamId } = paramsSchema.parse(await context.params);
    const mutation: TeamMutation = await parseJsonBody(request, mutationSchema, 4_096);
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
