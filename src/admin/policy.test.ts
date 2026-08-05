import { describe, expect, it } from "vitest";

import {
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

