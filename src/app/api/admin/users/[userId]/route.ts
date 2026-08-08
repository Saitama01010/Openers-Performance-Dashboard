import { revalidatePath } from "next/cache";

import {
  getAdminUserDetails,
  moveUserToTeam,
  permanentlyDeleteUser,
  updateAdminUser,
  updateUserShift,
  updateUserEmail,
  updateUserPrimaryDialerName,
} from "@/admin/data";
import { assertValidRole } from "@/admin/policy";
import { formatAuditEvent } from "@/admin/audit-format";
import { assertTrustedMutationOrigin } from "@/auth/request-security";
import { getCurrentUser } from "@/auth/session";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const SUPPORTED_FIELDS = new Set(["email", "dialerName", "teamId", "shift", "role"]);
const SAFE_ERRORS = new Set([
  "Another user already owns this dialer name.",
  "Another user already owns this email address.",
  "Dialer name is required.",
  "Dialer name must be 255 characters or fewer.",
  "Enter a valid email address.",
  "Select an active team.",
  "Shift must be 80 characters or fewer.",
  "Team can only be changed for agents and managers.",
  "Team was not found.",
  "Untrusted request origin.",
  "User was not found.",
  "You cannot permanently delete your own account.",
  "You cannot demote your own admin role.",
  "Select a team before changing this user to manager.",
  "Select a team before changing this user to agent.",
  "Assign a dialer name before changing this user to agent.",
  "Invalid role.",
  "The final active admin cannot be changed.",
]);

type InlineField = "email" | "dialerName" | "teamId" | "shift" | "role";

function errorResponse(error: unknown, fallback: string) {
  const message =
    error instanceof Error && SAFE_ERRORS.has(error.message)
      ? error.message
      : fallback;
  const status =
    message === "User was not found."
      ? 404
      : message === "Untrusted request origin."
        ? 403
        : message.includes("already owns")
          ? 409
          : 400;

  return Response.json({ error: message }, { status, headers: HEADERS });
}

function parsePatchBody(body: unknown): {
  field: InlineField;
  value: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Send one supported field and value.");
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== "field" ||
    keys[1] !== "value" ||
    typeof record.field !== "string" ||
    !SUPPORTED_FIELDS.has(record.field) ||
    typeof record.value !== "string"
  ) {
    throw new Error("Send one supported field and value.");
  }

  return {
    field: record.field as InlineField,
    value: record.value,
  };
}

function revalidateAdminUserPaths(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/agents");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/performance");
  revalidatePath("/teams/performance");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
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

  const { userId } = await context.params;
  const details = await getAdminUserDetails(actor, userId);
  if (!details) {
    return Response.json(
      { error: "User was not found." },
      { status: 404, headers: HEADERS },
    );
  }

  const primaryMapping =
    details.mappings.find((mapping) => mapping.active && mapping.isPrimary) ??
    null;

  return Response.json(
    {
      user: {
        id: details.profile.id,
        name: details.profile.name,
        email: details.profile.email,
        role: details.profile.role,
        shift: details.profile.shift,
        accountStatus: details.profile.accountStatus,
        passwordState: details.profile.passwordState,
        createdAt: details.profile.createdAt.toISOString(),
        updatedAt: details.profile.updatedAt.toISOString(),
        lastLoginAt: details.profile.lastLoginAt?.toISOString() ?? null,
        americanName: primaryMapping?.sourceAgentName ?? null,
        team: details.activeMembership?.teamName ?? null,
        invitationStatus: details.invitationStatus,
        activeSessionCount: Number(details.activeSessionCount),
      },
      overrides: details.overrides.map((override) => ({
        permissionKey: override.permissionKey,
        allowed: override.allowed,
      })),
      activity: details.audits.slice(0, 5).map((audit) => ({
        id: audit.id,
        action: formatAuditEvent(audit.action, audit.metadata).title,
        createdAt: audit.createdAt.toISOString(),
      })),
    },
    { headers: HEADERS },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
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
    const { userId } = await context.params;
    const { field, value } = parsePatchBody(await request.json());
    const result =
      field === "email"
        ? await updateUserEmail(actor, { userId, email: value })
        : field === "dialerName"
          ? await updateUserPrimaryDialerName(actor, {
              userId,
              dialerName: value,
            })
          : field === "shift"
            ? await updateUserShift(actor, { userId, shift: value })
            : field === "teamId"
              ? await moveUserToTeam(actor, { userId, teamId: value })
              : await updateRole(actor, userId, value);

    if (result.changed) {
      revalidateAdminUserPaths(userId);
    }

    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Send one supported field and value."
    ) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: HEADERS },
      );
    }
    return errorResponse(error, "User update failed.");
  }
}

async function updateRole(
  actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  userId: string,
  roleValue: string,
) {
  assertValidRole(roleValue);
  const details = await getAdminUserDetails(actor, userId);
  if (!details) throw new Error("User was not found.");

  await updateAdminUser(actor, {
    userId,
    name: details.profile.name,
    email: details.profile.email ?? "",
    role: roleValue,
    teamId: details.activeMembership?.teamId,
    shift: details.profile.shift ?? undefined,
    permissionOverrides: details.overrides.map((override) => ({
      permissionKey: override.permissionKey,
      value: override.allowed ? "allow" : "deny",
    })),
  });

  return { field: "role", value: roleValue, changed: details.profile.role !== roleValue };
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
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
    const { userId } = await context.params;
    await permanentlyDeleteUser(actor, { userId });
    revalidateAdminUserPaths(userId);
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error, "User deletion failed.");
  }
}
