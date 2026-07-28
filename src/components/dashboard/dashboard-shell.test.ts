import { describe, expect, it } from "vitest";

import { navigationForRole } from "@/components/dashboard/dashboard-navigation-config";

function destinations(role: "admin" | "agent" | "manager") {
  return navigationForRole(role, "profile-1").flatMap((group) =>
    group.items.map((item) => item.href),
  );
}

describe("dashboard shell navigation by role", () => {
  it("shows only self-service performance routes to agents", () => {
    expect(destinations("agent")).toEqual([
      "/dashboard",
      "/performance",
      "/agents/profile-1",
    ]);
  });

  it("shows scoped analysis and imports, but no administration, to managers", () => {
    expect(destinations("manager")).toEqual([
      "/dashboard",
      "/performance",
      "/agents",
      "/teams/performance",
      "/import",
    ]);
  });

  it("shows workspace and administration routes to administrators", () => {
    const adminDestinations = destinations("admin");

    expect(adminDestinations).toContain("/import");
    expect(adminDestinations).toContain("/admin/users");
    expect(adminDestinations).toContain("/admin/permissions");
    expect(adminDestinations).toContain("/admin/audit");
  });
});
