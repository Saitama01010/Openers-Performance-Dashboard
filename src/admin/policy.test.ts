import { describe, expect, it } from "vitest";

import {
  ADMIN_ONLY_PERMISSIONS,
  activeMappingKey,
  assertCanRemoveAdmin,
  canGrantPermissionToRole,
  normalizeDialerIdentity,
  primaryMappingKey,
  ROLE_DEFAULT_PERMISSIONS,
  roleRequiresDialerName,
  roleRequiresTeam,
  validatePermissionOverrides,
} from "@/admin/policy";

describe("admin access policy", () => {
  it("grants narrow commission defaults without making them overridable", async () => {
    const { OVERRIDABLE_PERMISSION_KEYS } = await import("@/admin/policy");
    expect(ROLE_DEFAULT_PERMISSIONS.admin).toContain("commissions.export_company");
    expect(ROLE_DEFAULT_PERMISSIONS.manager).toEqual(expect.arrayContaining(["commissions.view_team", "commissions.export_team"]));
    expect(ROLE_DEFAULT_PERMISSIONS.agent).toContain("commissions.view_own");
    expect(OVERRIDABLE_PERMISSION_KEYS.some((key) => key.startsWith("commissions."))).toBe(false);
  });

  it("keeps role-dashboard operations separated by role", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.agent).toEqual(expect.arrayContaining([
      "dashboard.view_own",
      "commissions.view_own",
    ]));
    expect(ROLE_DEFAULT_PERMISSIONS.agent).not.toContain("dashboard.export_team");
    expect(ROLE_DEFAULT_PERMISSIONS.agent).not.toContain("users.create_team_agent");
    expect(ROLE_DEFAULT_PERMISSIONS.agent).not.toContain("transfers.request_team");
    expect(ROLE_DEFAULT_PERMISSIONS.manager).toEqual(expect.arrayContaining([
      "dashboard.view_team",
      "dashboard.export_team",
      "coaching.submit_rubric_team",
      "shadowing.manage_team",
      "flags.raise_team_case",
    ]));
    expect(ROLE_DEFAULT_PERMISSIONS.manager).not.toContain("users.create_team_agent");
    expect(ROLE_DEFAULT_PERMISSIONS.manager).not.toContain("users.deactivate_team_agent");
    expect(ROLE_DEFAULT_PERMISSIONS.manager).not.toContain("users.terminate_team_agent");
    expect(ADMIN_ONLY_PERMISSIONS.has("users.deactivate_team_agent")).toBe(true);
    expect(ADMIN_ONLY_PERMISSIONS.has("users.terminate_team_agent")).toBe(true);
    expect(ADMIN_ONLY_PERMISSIONS.has("users.create_team_agent")).toBe(true);
    expect(ROLE_DEFAULT_PERMISSIONS.admin).toEqual(expect.arrayContaining([
      "dashboard.view_company",
      "dashboard.export_company",
      "targets.manage",
      "rubrics.manage",
    ]));
    for (const permissions of Object.values(ROLE_DEFAULT_PERMISSIONS)) {
      expect(permissions).not.toContain("transfers.request_team");
      expect(permissions).not.toContain("transfers.approve_company");
    }
  });

  it("prevents removing the final active admin", () => {
    expect(() =>
      assertCanRemoveAdmin({
        targetRole: "admin",
        targetStatus: "active",
        activeAdminCount: 1,
        nextStatus: "revoked",
      }),
    ).toThrow("final active admin");

    expect(() =>
      assertCanRemoveAdmin({
        targetRole: "admin",
        targetStatus: "active",
        activeAdminCount: 1,
        nextRole: "manager",
      }),
    ).toThrow("final active admin");
  });

  it("allows admin changes when another active admin remains", () => {
    expect(() =>
      assertCanRemoveAdmin({
        targetRole: "admin",
        targetStatus: "active",
        activeAdminCount: 2,
        nextStatus: "deactivated",
      }),
    ).not.toThrow();
  });

  it("blocks admin-only permission grants to managers and agents", () => {
    expect(canGrantPermissionToRole("users.manage_permissions", "manager")).toBe(false);
    expect(canGrantPermissionToRole("metrics.view_company", "agent")).toBe(false);
    expect(canGrantPermissionToRole("users.deactivate_team_agent", "manager")).toBe(false);
    expect(canGrantPermissionToRole("users.terminate_team_agent", "agent")).toBe(false);
    expect(canGrantPermissionToRole("users.create_team_agent", "manager")).toBe(false);
    expect(canGrantPermissionToRole("users.manage_permissions", "admin")).toBe(true);
    expect(() =>
      validatePermissionOverrides(
        [{ permissionKey: "users.manage_permissions", value: "allow" }],
        "manager",
      ),
    ).toThrow("Invalid permission");
  });

  it("validates permission override keys and duplicates", () => {
    expect(() =>
      validatePermissionOverrides([{ permissionKey: "unknown", value: "deny" }], "admin"),
    ).toThrow("Invalid permission");
    expect(() =>
      validatePermissionOverrides(
        [
          { permissionKey: "teams.view", value: "allow" },
          { permissionKey: "teams.view", value: "deny" },
        ],
        "admin",
      ),
    ).toThrow("Duplicate");
  });

  it("models team and dialer requirements by role", () => {
    expect(roleRequiresTeam("admin")).toBe(false);
    expect(roleRequiresTeam("manager")).toBe(true);
    expect(roleRequiresTeam("agent")).toBe(true);
    expect(roleRequiresDialerName("admin")).toBe(false);
    expect(roleRequiresDialerName("manager")).toBe(false);
    expect(roleRequiresDialerName("agent")).toBe(true);
  });

  it("normalizes dialer identities exactly without fuzzy matching", () => {
    expect(normalizeDialerIdentity(" John   Williams ")).toBe("john williams");
    expect(normalizeDialerIdentity("JOHN WILLIAMS")).toBe("john williams");
    expect(normalizeDialerIdentity("Jon Williams")).toBe("jon Williams".toLowerCase());
    expect(activeMappingKey("dialer", "john williams")).toBe("dialer:john williams");
    expect(primaryMappingKey("dialer", "user-1")).toBe("dialer:user-1");
  });
});

