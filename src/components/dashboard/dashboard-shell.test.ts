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
      "/leaderboard",
      "/agents/profile-1",
    ]);
  });

  it("shows scoped analysis and imports, but no administration, to managers", () => {
    expect(destinations("manager")).toEqual([
      "/dashboard",
      "/performance",
      "/leaderboard",
      "/agents",
      "/teams/performance",
      "/import",
    ]);
  });

  it("shows workspace and administration routes to administrators", () => {
    const adminDestinations = destinations("admin");

    expect(adminDestinations).toContain("/import");
    expect(adminDestinations).toContain("/leaderboard");
    expect(adminDestinations).toContain("/admin/users");
    expect(adminDestinations).toContain("/admin/permissions");
    expect(adminDestinations).toContain("/admin/audit");
  });

  it("shows the complete LeaderBoard route to every authenticated role", () => {
    for (const role of ["admin", "manager", "agent"] as const) {
      expect(destinations(role)).toContain("/leaderboard");
    }
  });
});
