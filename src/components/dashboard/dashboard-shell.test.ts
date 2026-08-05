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
      "/flags",
      "/commissions",
    ]);
  });

  it("shows scoped analysis and imports, but no administration, to managers", () => {
    expect(destinations("manager")).toEqual([
      "/dashboard",
      "/performance",
      "/leaderboard",
      "/agents",
      "/teams/performance",
      "/coaching",
      "/flags",
      "/commissions",
      "/import",
    ]);
  });

  it("shows workspace and administration routes to administrators", () => {
    const adminDestinations = destinations("admin");

    expect(adminDestinations).toContain("/import");
    expect(adminDestinations).toContain("/leaderboard");
    expect(adminDestinations).toContain("/coaching");
    expect(adminDestinations).toContain("/flags");
    expect(adminDestinations).toContain("/commissions");
    expect(adminDestinations).toContain("/admin/users");
    expect(adminDestinations).toContain("/admin/permissions");
    expect(adminDestinations).toContain("/admin/audit");
  });

  it("shows Flags but never Coaching Sessions to agents", () => {
    expect(destinations("agent")).toContain("/flags");
    expect(destinations("agent")).not.toContain("/coaching");
  });

  it("adds Commissions once without removing Coaching Sessions or Flags", () => {
    for (const role of ["admin", "manager", "agent"] as const) {
      expect(destinations(role).filter((href) => href === "/commissions")).toHaveLength(1);
      expect(destinations(role)).toContain("/flags");
    }
    expect(destinations("admin")).toContain("/coaching");
    expect(destinations("manager")).toContain("/coaching");
    expect(destinations("agent")).not.toContain("/coaching");
  });

  it("shows the complete LeaderBoard route to every authenticated role", () => {
    for (const role of ["admin", "manager", "agent"] as const) {
      expect(destinations(role)).toContain("/leaderboard");
    }
  });
});
