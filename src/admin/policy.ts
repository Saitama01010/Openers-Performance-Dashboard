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
      "imports.deactivate",
      "imports.delete",
      "imports.restore",
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
    name: "Coaching",
    permissions: [
      "coaching.view_team",
      "coaching.create_team",
      "coaching.view_company",
      "coaching.create_company",
    ],
  },
  {
    name: "Flags",
    permissions: [
      "flags.view_own",
      "flags.view_team",
      "flags.view_company",
    ],
  },
  {
    name: "Commissions",
    permissions: [
      "commissions.view_own",
      "commissions.view_team",
      "commissions.view_company",
      "commissions.export_team",
      "commissions.export_company",
    ],
  },
  {
    name: "Role dashboards",
    permissions: [
      "dashboard.view_own",
      "dashboard.view_team",
      "dashboard.view_company",
      "dashboard.export_team",
      "dashboard.export_company",
    ],
  },
  {
    name: "Performance operations",
    permissions: [
      "targets.manage",
      "rubrics.manage",
      "coaching.submit_rubric_team",
      "coaching.publish_team",
      "shadowing.manage_team",
      "flags.raise_team_case",
      "flags.update_team_case",
      "transfers.request_team",
      "transfers.approve_company",
      "users.create_team_agent",
      "users.deactivate_team_agent",
      "users.terminate_team_agent",
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

export const OVERRIDABLE_PERMISSION_GROUPS = [
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
      "imports.deactivate",
      "imports.delete",
      "imports.restore",
      "imports.company",
      "imports.team",
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
  "imports.deactivate": "Deactivate active imports and resolve their dataset scopes",
  "imports.delete": "Permanently delete imports, including resolved active imports",
  "imports.restore": "Restore valid historical import versions",
  "imports.company": "Import company-wide dialer data",
  "imports.team": "Import dialer data for assigned teams",
  "metrics.view_own": "View own metrics",
  "metrics.view_team": "View assigned-team metrics",
  "metrics.view_company": "View company-wide metrics",
  "metrics.self": "View own metrics",
  "metrics.team": "View assigned-team metrics",
  "metrics.company": "View company-wide metrics",
  "coaching.view_team": "View coaching for assigned active teams",
  "coaching.create_team": "Create coaching for assigned active teams",
  "coaching.view_company": "View organization-wide coaching",
  "coaching.create_company": "Create organization-wide coaching",
  "flags.view_own": "View own performance and transfer flags",
  "flags.view_team": "View flags for assigned active teams",
  "flags.view_company": "View organization-wide flags",
  "commissions.view_own": "View own monthly commissions",
  "commissions.view_team": "View assigned-team monthly commissions",
  "commissions.view_company": "View organization-wide monthly commissions",
  "commissions.export_team": "Export assigned-team monthly commissions",
  "commissions.export_company": "Export organization-wide monthly commissions",
  "dashboard.view_own": "View the personal role dashboard",
  "dashboard.view_team": "View assigned-team dashboard metrics",
  "dashboard.view_company": "View company-wide dashboard metrics",
  "dashboard.export_team": "Export assigned-team dashboard reporting",
  "dashboard.export_company": "Export company-wide dashboard reporting",
  "targets.manage": "Manage effective-dated targets and tenure thresholds",
  "rubrics.manage": "Manage coaching rubric templates",
  "coaching.submit_rubric_team": "Submit team coaching rubric reports",
  "coaching.publish_team": "Finalize and publish team coaching reports",
  "shadowing.manage_team": "Manage assigned-team shadowing",
  "flags.raise_team_case": "Raise assigned-team manual flag cases",
  "flags.update_team_case": "Update assigned-team manual flag cases",
  "transfers.request_team": "Request assigned-team agent transfers",
  "transfers.approve_company": "Approve and apply company transfer requests",
  "users.create_team_agent": "Create agents in assigned teams",
  "users.deactivate_team_agent": "Deactivate agents in assigned teams",
  "users.terminate_team_agent": "Terminate agents in assigned teams",
  "leaderboard.view": "View leaderboards",
  "leaderboards.view": "View leaderboards",
  "audit.view": "View audit logs",
  "audit.view_company": "View company-wide audit logs",
  "integrations.manage": "Manage integrations",
  "commissions.manage": "Manage commissions",
  "flags.manage": "Manage feature flags",
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_DESCRIPTIONS);
export const OVERRIDABLE_PERMISSION_KEYS = OVERRIDABLE_PERMISSION_GROUPS.flatMap(
  (group) => [...group.permissions],
);

export const PERMISSION_PRESENTATION: Record<
  (typeof OVERRIDABLE_PERMISSION_KEYS)[number],
  { label: string; description: string }
> = {
  "teams.view": {
    label: "View teams",
    description: "View team details and current memberships.",
  },
  "teams.create": {
    label: "Create teams",
    description: "Create a new team.",
  },
  "teams.update": {
    label: "Edit team details",
    description: "Rename teams and update team details.",
  },
  "teams.deactivate": {
    label: "Deactivate teams",
    description: "Deactivate or reactivate teams.",
  },
  "teams.assign_manager": {
    label: "Assign team managers",
    description: "Choose the manager responsible for a team.",
  },
  "teams.assign_agents": {
    label: "Add or remove team members",
    description: "Move agents into or out of teams.",
  },
  "imports.preview": {
    label: "Preview imported files",
    description: "Upload and validate an operational import.",
  },
  "imports.confirm": {
    label: "Confirm and save imports",
    description: "Commit a validated operational import.",
  },
  "imports.view_history": {
    label: "View import history",
    description: "Review previous operational imports.",
  },
  "imports.view_errors": {
    label: "View import errors",
    description: "Review validation and confirmation errors.",
  },
  "imports.deactivate": {
    label: "Deactivate active imports",
    description:
      "Remove an active import from dashboard calculations and choose its replacement.",
  },
  "imports.delete": {
    label: "Permanently delete imports",
    description:
      "Permanently remove import records, stored files, and owned rows after resolving active data.",
  },
  "imports.restore": {
    label: "Restore historical imports",
    description: "Activate a valid historical version for the same dataset scope.",
  },
  "imports.company": {
    label: "Import company-wide data",
    description: "Import operational data across the company.",
  },
  "imports.team": {
    label: "Import team data",
    description: "Import operational data for assigned teams.",
  },
};

export const ADMIN_ONLY_PERMISSIONS = new Set([
  "users.manage_permissions",
  "users.assign_role",
  "integrations.manage",
  "audit.view",
  "audit.view_company",
  "metrics.view_company",
  "metrics.company",
  "coaching.view_company",
  "coaching.create_company",
  "flags.view_company",
  "commissions.view_company",
  "commissions.export_company",
  "dashboard.view_company",
  "dashboard.export_company",
  "targets.manage",
  "rubrics.manage",
  "transfers.approve_company",
  "imports.deactivate",
  "imports.delete",
  "imports.restore",
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
    "coaching.view_team",
    "coaching.create_team",
    "flags.view_team",
    "commissions.view_team",
    "commissions.export_team",
    "dashboard.view_team",
    "dashboard.export_team",
    "coaching.submit_rubric_team",
    "coaching.publish_team",
    "shadowing.manage_team",
    "flags.raise_team_case",
    "flags.update_team_case",
    "transfers.request_team",
    "users.create_team_agent",
    "users.deactivate_team_agent",
    "users.terminate_team_agent",
  ],
  agent: [
    "metrics.view_own",
    "metrics.self",
    "leaderboard.view",
    "leaderboards.view",
    "flags.view_own",
    "commissions.view_own",
    "dashboard.view_own",
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
  const validKeys = new Set<string>(OVERRIDABLE_PERMISSION_KEYS);
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
  targetStatus: "invited" | "active" | "deactivated" | "revoked" | "deleted";
  activeAdminCount: number;
  nextRole?: Role;
  nextStatus?: "invited" | "active" | "deactivated" | "revoked" | "deleted";
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

