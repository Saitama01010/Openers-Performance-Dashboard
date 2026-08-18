import { describe, expect, it } from "vitest";

import { isNavigationItemActive } from "@/components/dashboard/dashboard-navigation";
import { navigationForRole } from "@/components/dashboard/dashboard-navigation-config";

function navigationLabels(role: "admin" | "manager" | "agent") {
  return navigationForRole(role, `${role}-id`).flatMap((section) =>
    section.items.map((item) => item.label),
  );
}

describe("dashboard navigation active state", () => {
  it("marks exact routes as active", () => {
    expect(isNavigationItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavigationItemActive("/import", "/import")).toBe(true);
  });

  it("keeps a parent destination active on nested detail routes", () => {
    expect(
      isNavigationItemActive(
        "/admin/users/00000000-0000-4000-8000-000000000004",
        "/admin/users",
      ),
    ).toBe(true);
    expect(
      isNavigationItemActive("/commissions/history", "/commissions"),
    ).toBe(true);
    expect(
      isNavigationItemActive("/admin/teams/team-1", "/admin/teams"),
    ).toBe(true);
    expect(
      isNavigationItemActive("/admin/imports/batch-1", "/admin/imports"),
    ).toBe(true);
  });

  it("does not match a route with a similar prefix", () => {
    expect(isNavigationItemActive("/admin/users-archive", "/admin/users")).toBe(
      false,
    );
    expect(isNavigationItemActive("/admin/teams", "/admin/users")).toBe(false);
  });

  it("shows operational Imports navigation only to administrators", () => {
    expect(navigationLabels("admin")).toContain("Imports");
    expect(navigationLabels("manager")).not.toContain("Imports");
    expect(navigationLabels("agent")).not.toContain("Imports");
  });
});
