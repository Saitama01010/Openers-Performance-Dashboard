"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addDialerMapping,
  assignTeamManager,
  createAdminUser,
  createTeam,
  deactivateDialerMapping,
  editDialerMapping,
  forcePasswordReset,
  ignoreUnmappedDialerName,
  moveAgentToTeam,
  removeTeamMembership,
  renameTeam,
  revokeInvitation,
  revokeUserSessions,
  sendOrResendInvitation,
  setPrimaryDialerMapping,
  setTeamStatus,
  setUserAccountStatus,
  updateAdminUser,
} from "@/admin/data";
import {
  OVERRIDABLE_PERMISSION_KEYS,
  assertValidRole,
  type PermissionOverrideInput,
} from "@/admin/policy";
import type { AdminErrorCode } from "@/admin/messages";
import type { Role } from "@/auth/authorization";
import { getCurrentUser } from "@/auth/session";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function boolField(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function splitAliases(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRole(formData: FormData): Role {
  const role = formString(formData, "role");
  assertValidRole(role);
  return role;
}

function readPermissionOverrides(formData: FormData): PermissionOverrideInput[] {
  return OVERRIDABLE_PERMISSION_KEYS.map((permissionKey) => {
    const raw = formString(formData, `permission:${permissionKey}`);
    const value =
      raw === "allow" || raw === "deny" || raw === "inherit"
        ? raw
        : "inherit";

    return { permissionKey, value };
  });
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/login");
  }

  return user;
}

function redactErrorDetail(value: string) {
  const resendKey = process.env.RESEND_API_KEY;
  let redacted = resendKey ? value.replaceAll(resendKey, "[redacted]") : value;

  redacted = redacted.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted-email]",
  );
  redacted = redacted.replace(
    /\b(token|password|secret|api[_-]?key)\b\s*[:=]\s*['"]?[^'"\s,;)]+/gi,
    "$1=[redacted]",
  );

  return redacted;
}

function logAdminActionError(code: AdminErrorCode, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Admin action failed.";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[admin action failed]", {
    code,
    message: redactErrorDetail(message),
    stack: stack ? redactErrorDetail(stack) : undefined,
  });
}

function errorCodeFor(error: unknown, fallback: AdminErrorCode): AdminErrorCode {
  const message = error instanceof Error ? error.message : "";

  if (message === "The final active admin cannot be changed.") return "final-admin";
  if (message === "Select a team before changing this user to manager.") {
    return "manager-team-required";
  }
  if (message === "Select a team before changing this user to agent.") {
    return "agent-team-required";
  }
  if (message === "Assign a dialer name before changing this user to agent.") {
    return "agent-dialer-required";
  }
  if (message === "You cannot demote your own admin role.") return "self-demotion";

  return fallback;
}

function fail(path: string, error: unknown, code: AdminErrorCode): never {
  const safeCode = errorCodeFor(error, code);

  logAdminActionError(safeCode, error);
  redirect(`${path}?error=${safeCode}`);
}

export async function createUserAction(formData: FormData) {
  const actor = await requireAdmin();
  let target = "/admin/users?ok=user-created";

  try {
    const result = await createAdminUser(actor, {
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      role: readRole(formData),
      teamId: formString(formData, "teamId") || undefined,
      dialerName: formString(formData, "dialerName"),
      shift: formString(formData, "shift"),
      dialerAliases: splitAliases(formString(formData, "dialerAliases")),
      permissionOverrides: readPermissionOverrides(formData),
    });
    target = `/admin/users/${result.profileId}?ok=user-created`;
    revalidatePath("/admin/users");
  } catch (error) {
    fail("/admin/users", error, "user-create");
  }

  redirect(target);
}

export async function updateUserAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await updateAdminUser(actor, {
      userId,
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      role: readRole(formData),
      teamId: formString(formData, "teamId") || undefined,
      shift: formString(formData, "shift"),
      permissionOverrides: readPermissionOverrides(formData),
    });
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "user-update");
  }

  redirect(`/admin/users/${userId}?ok=user-updated`);
}

export async function userStatusAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();
  const status = formString(formData, "status");

  if (!["active", "deactivated", "revoked"].includes(status)) {
    redirect(`/admin/users/${userId}?error=account-status-invalid`);
  }

  if (status !== "active" && !boolField(formData, "confirmStatusChange")) {
    redirect(`/admin/users/${userId}?error=confirm-status-change`);
  }

  try {
    await setUserAccountStatus(actor, {
      userId,
      status: status as "active" | "deactivated" | "revoked",
    });
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "status-update");
  }

  redirect(`/admin/users/${userId}?ok=status-updated`);
}

export async function invitationAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();
  const action = formString(formData, "invitationAction");

  try {
    if (action === "revoke") {
      await revokeInvitation(actor, userId);
    } else {
      await sendOrResendInvitation(actor, userId);
    }
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "invitation-delivery");
  }

  redirect(`/admin/users/${userId}?ok=invitation-updated`);
}

export async function forcePasswordResetAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();
  let warning = "";

  try {
    const result = await forcePasswordReset(actor, {
      userId,
      revokeSessions: boolField(formData, "revokeSessions"),
    });
    warning = result.ok ? "" : "&warning=email";
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "password-reset");
  }

  redirect(`/admin/users/${userId}?ok=password-reset-forced${warning}`);
}

export async function revokeSessionsAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await revokeUserSessions(actor, {
      userId,
      includeCurrentSession: boolField(formData, "includeCurrentSession"),
    });
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "session-revocation");
  }

  redirect(`/admin/users/${userId}?ok=sessions-revoked`);
}

export async function addDialerMappingAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await addDialerMapping(actor, {
      userId,
      sourceAgentName: formString(formData, "sourceAgentName"),
      makePrimary: boolField(formData, "makePrimary"),
    });
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "mapping-update");
  }

  redirect(`/admin/users/${userId}?ok=mapping-added`);
}

export async function mapUnknownDialerNameAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formString(formData, "userId");

  try {
    await addDialerMapping(actor, {
      userId,
      sourceAgentName: formString(formData, "sourceAgentName"),
      makePrimary: false,
    });
    revalidatePath("/admin/users");
  } catch (error) {
    fail("/admin/users", error, "mapping-update");
  }

  redirect("/admin/users?ok=unknown-mapped");
}

export async function ignoreUnknownDialerNameAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await ignoreUnmappedDialerName(actor, {
      dialerName: formString(formData, "sourceAgentName"),
      reason: formString(formData, "reason"),
    });
    revalidatePath("/admin/users");
  } catch (error) {
    fail("/admin/users", error, "ignore-action");
  }

  redirect("/admin/users?ok=unknown-ignored");
}

export async function deactivateDialerMappingAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await deactivateDialerMapping(actor, formString(formData, "mappingId"));
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "mapping-update");
  }

  redirect(`/admin/users/${userId}?ok=mapping-deactivated`);
}

export async function editDialerMappingAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await editDialerMapping(actor, {
      mappingId: formString(formData, "mappingId"),
      sourceAgentName: formString(formData, "sourceAgentName"),
    });
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "mapping-update");
  }

  redirect(`/admin/users/${userId}?ok=mapping-edited`);
}

export async function setPrimaryDialerMappingAction(userId: string, formData: FormData) {
  const actor = await requireAdmin();

  try {
    await setPrimaryDialerMapping(actor, formString(formData, "mappingId"));
    revalidatePath(`/admin/users/${userId}`);
  } catch (error) {
    fail(`/admin/users/${userId}`, error, "mapping-update");
  }

  redirect(`/admin/users/${userId}?ok=primary-mapping-updated`);
}

export async function createTeamAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await createTeam(actor, formString(formData, "name"));
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "team-create");
  }

  redirect("/admin/teams?ok=team-created");
}

export async function renameTeamAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await renameTeam(actor, {
      teamId: formString(formData, "teamId"),
      name: formString(formData, "name"),
    });
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "team-rename");
  }

  redirect("/admin/teams?ok=team-renamed");
}

export async function setTeamStatusAction(formData: FormData) {
  const actor = await requireAdmin();

  if (formString(formData, "active") === "false" && !boolField(formData, "confirmTeamStatus")) {
    redirect(`/admin/teams?error=confirm-team-status`);
  }

  try {
    await setTeamStatus(actor, {
      teamId: formString(formData, "teamId"),
      active: formString(formData, "active") === "true",
    });
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "team-status");
  }

  redirect("/admin/teams?ok=team-status-updated");
}

export async function assignTeamManagerAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await assignTeamManager(actor, {
      teamId: formString(formData, "teamId"),
      managerId: formString(formData, "managerId"),
    });
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "manager-assignment");
  }

  redirect("/admin/teams?ok=manager-assigned");
}

export async function moveAgentToTeamAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await moveAgentToTeam(actor, {
      teamId: formString(formData, "teamId"),
      agentId: formString(formData, "agentId"),
    });
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "agent-move");
  }

  redirect("/admin/teams?ok=agent-moved");
}

export async function removeTeamMembershipAction(formData: FormData) {
  const actor = await requireAdmin();

  try {
    await removeTeamMembership(actor, formString(formData, "membershipId"));
    revalidatePath("/admin/teams");
  } catch (error) {
    fail("/admin/teams", error, "membership-removal");
  }

  redirect("/admin/teams?ok=membership-removed");
}
