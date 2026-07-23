import type { Role } from "@/auth/authorization";

export const PERMISSION_GROUPS = [
  {
    name: "User management",
    permissions: [
      "users.view",
      "users.create",
      "users.update",
      "users.activate",
      "users.deactivate",
      "users.revoke",
      "users.assign_role",
      "users.assign_team",
      "users.manage_permissions",
      "users.revoke_sessions",
    ],
  },
  {
    name: "Team management",
    permissions: [
      "teams.view",
      "teams.create",
      "teams.update",
      "teams.deactivate",
      "teams.assign_manager",
      "teams.assign_agents",
    ],
  },
  {
    name: "Imports",
    permissions: [
      "imports.preview",
      "imports.confirm",
      "imports.view_history",
      "imports.view_errors",
      "imports.company",
      "imports.team",
    ],
  },
  {
    name: "Metrics",
    permissions: [
      "metrics.view_own",
      "metrics.view_team",
      "metrics.view_company",
      "metrics.self",
      "metrics.team",
      "metrics.company",
    ],
  },
  {
    name: "Other",
    permissions: [
      "leaderboard.view",
      "leaderboards.view",
      "audit.view",
      "audit.view_company",
      "integrations.manage",
      "commissions.manage",
      "flags.manage",
    ],
  },
] as const;

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "users.view": "View users and access state",
  "users.create": "Create invited user accounts",
  "users.update": "Update user profile, team, and access details",
  "users.activate": "Reactivate deactivated users",
  "users.deactivate": "Deactivate active users",
  "users.revoke": "Revoke user access",
  "users.assign_role": "Assign dashboard roles",
  "users.assign_team": "Assign users to teams",
  "users.manage_permissions": "Manage user permission overrides",
  "users.revoke_sessions": "Revoke user sessions",
  "teams.view": "View teams and memberships",
  "teams.create": "Create teams",
  "teams.update": "Rename teams and manage memberships",
  "teams.deactivate": "Deactivate teams",
  "teams.assign_manager": "Assign team managers",
  "teams.assign_agents": "Assign team agents",
  "imports.preview": "Preview dialer imports",
  "imports.confirm": "Confirm dialer imports",
  "imports.view_history": "View import history",
  "imports.view_errors": "View import errors",
  "imports.company": "Import company-wide dialer data",
  "imports.team": "Import dialer data for assigned teams",
  "metrics.view_own": "View own metrics",
  "metrics.view_team": "View assigned-team metrics",
  "metrics.view_company": "View company-wide metrics",
  "metrics.self": "View own metrics",
  "metrics.team": "View assigned-team metrics",
  "metrics.company": "View company-wide metrics",
  "leaderboard.view": "View leaderboards",
  "leaderboards.view": "View leaderboards",
  "audit.view": "View audit logs",
  "audit.view_company": "View company-wide audit logs",
  "integrations.manage": "Manage integrations",
  "commissions.manage": "Manage commissions",
  "flags.manage": "Manage feature flags",
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_DESCRIPTIONS);

export const ADMIN_ONLY_PERMISSIONS = new Set([
  "users.manage_permissions",
  "users.assign_role",
  "integrations.manage",
  "audit.view",
  "audit.view_company",
  "metrics.view_company",
  "metrics.company",
]);

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  admin: ALL_PERMISSION_KEYS,
  manager: [
    "teams.view",
    "imports.preview",
    "imports.confirm",
    "imports.view_history",
    "imports.view_errors",
    "imports.team",
    "metrics.view_team",
    "metrics.team",
    "leaderboard.view",
    "leaderboards.view",
  ],
  agent: [
    "metrics.view_own",
    "metrics.self",
    "leaderboard.view",
    "leaderboards.view",
  ],
};

export type PermissionOverrideInput = {
  permissionKey: string;
  value: "allow" | "deny" | "inherit";
};

export function normalizeDialerIdentity(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function activeMappingKey(source: string, normalizedAgentName: string) {
  return `${source}:${normalizedAgentName}`;
}

export function primaryMappingKey(source: string, profileId: string) {
  return `${source}:${profileId}`;
}

export function roleRequiresTeam(role: Role) {
  return role === "manager" || role === "agent";
}

export function roleRequiresDialerName(role: Role) {
  return role === "agent";
}

export function assertValidRole(role: string): asserts role is Role {
  if (!["admin", "manager", "agent"].includes(role)) {
    throw new Error("Invalid role.");
  }
}

export function canGrantPermissionToRole(permissionKey: string, role: Role) {
  return role === "admin" || !ADMIN_ONLY_PERMISSIONS.has(permissionKey);
}

export function validatePermissionOverrides(
  overrides: PermissionOverrideInput[],
  targetRole: Role,
) {
  const validKeys = new Set(ALL_PERMISSION_KEYS);
  const seen = new Set<string>();

  for (const override of overrides) {
    if (!validKeys.has(override.permissionKey)) {
      throw new Error(`Invalid permission: ${override.permissionKey}`);
    }

    if (seen.has(override.permissionKey)) {
      throw new Error(`Duplicate permission override: ${override.permissionKey}`);
    }

    if (
      override.value === "allow" &&
      !canGrantPermissionToRole(override.permissionKey, targetRole)
    ) {
      throw new Error("Admin-only permissions cannot be granted to non-admin users.");
    }

    seen.add(override.permissionKey);
  }
}

export function assertCanRemoveAdmin(input: {
  targetRole: Role;
  targetStatus: "invited" | "active" | "deactivated" | "revoked";
  activeAdminCount: number;
  nextRole?: Role;
  nextStatus?: "invited" | "active" | "deactivated" | "revoked";
}) {
  const isCurrentlyActiveAdmin =
    input.targetRole === "admin" && input.targetStatus === "active";
  const willRemainActiveAdmin =
    (input.nextRole ?? input.targetRole) === "admin" &&
    (input.nextStatus ?? input.targetStatus) === "active";

  if (
    isCurrentlyActiveAdmin &&
    !willRemainActiveAdmin &&
    input.activeAdminCount <= 1
  ) {
    throw new Error("The final active admin cannot be changed.");
  }
}

