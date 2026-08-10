import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      expect(
        destinations(role).filter((href) => href === "/commissions"),
      ).toHaveLength(1);
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

  it("uses the official logo and preserves the secure logout action", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/dashboard-shell-client.tsx"),
      "utf8",
    );

    expect(shell).toContain('/brand/openers-performance-logo.png');
    expect(shell).toContain('loading="eager"');
    expect(shell).toContain("action={logoutAction}");
    expect(shell).toContain("title={user.name}");
    expect(shell).toContain('aria-label={`Sign out ${user.name}`}');
  });

  it("fits the complete official mark inside the sidebar lockup", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const logo = styles.slice(
      styles.indexOf(".dashboard-brand__image {"),
      styles.indexOf(".dashboard-brand__name,"),
    );

    expect(logo).toContain("height: 6rem");
    expect(logo).toContain("inset: -1.33rem auto auto -1.65rem");
    expect(logo).toContain("width: 6rem");
  });

  it("gives the sidebar identity and sign-out action separate rows", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const profile = styles.slice(
      styles.indexOf(".dashboard-profile {"),
      styles.indexOf(".dashboard-workspace"),
    );

    expect(profile).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(profile).toContain("grid-column: 1 / -1");
    expect(profile).toContain("width: 100%");
  });

  it("keeps the redesigned rail scoped to sidebar selectors", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const sidebar = styles.slice(
      styles.indexOf(".dashboard-sidebar"),
      styles.indexOf(".dashboard-workspace"),
    );

    expect(sidebar).toContain("min-height: 2.5rem");
    expect(sidebar).toContain("background: var(--primary)");
    expect(sidebar).toContain("outline: 3px solid #81a3ff");
    expect(styles).toContain("grid-template-columns: 14rem minmax(0, 1fr)");
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).toContain("min-height: 2.75rem");
  });
});
