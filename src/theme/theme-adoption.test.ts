import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const themedModules = [
  "src/app/admin/imports/import-history.module.css",
  "src/app/import/import-page.module.css",
  "src/components/admin/audit-admin.module.css",
  "src/components/admin/teams-admin.module.css",
  "src/components/admin/users-access.module.css",
  "src/components/auth/login.module.css",
  "src/components/dashboard/admin-overview/admin-overview.module.css",
  "src/components/dashboard/agents/agents-page.module.css",
  "src/components/dashboard/coaching/coaching-page.module.css",
  "src/components/dashboard/commissions/commissions-page.module.css",
  "src/components/dashboard/flags/flags-page.module.css",
  "src/components/dashboard/performance/performance-page.module.css",
  "src/components/dashboard/role-dashboard.module.css",
  "src/components/dashboard/team-performance/team-performance.module.css",
  "src/components/leaderboard/leaderboard-page.module.css",
] as const;

describe("site-wide theme adoption", () => {
  it("loads the no-flash script and final theme stylesheet from the root layout", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain("themeInitializationScript");
    expect(layout).toContain('import "./theme.css"');
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("mounts the switch in authenticated and public authentication shells", () => {
    expect(source("src/components/dashboard/dashboard-shell-client.tsx")).toContain("<ThemeToggle />");
    expect(source("src/components/auth/auth-shell.tsx")).toContain('<ThemeToggle className="auth-theme-switch" />');
    expect(source("src/components/auth/login-shell.tsx")).toContain('<ThemeToggle className="auth-theme-switch" />');
  });

  it("implements the accessible animated sun, moon, clouds, and stars", () => {
    const toggle = source("src/components/ui/theme-toggle.tsx");
    const styles = source("src/app/theme.css");
    expect(toggle).toContain("Switch to dark mode");
    expect(toggle).toContain("theme-switch__sun-moon");
    expect(toggle).toContain("theme-switch__cloud");
    expect(toggle).toContain("theme-switch__stars");
    expect(styles).toContain('html[data-theme="dark"]');
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it.each(themedModules)("uses semantic surfaces and foregrounds in %s", (path) => {
    const contents = source(path);
    expect(contents).toMatch(/var\(--(?:surface|background)\)/);
    expect(contents).toContain("var(--foreground)");
    expect(contents).not.toMatch(/background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/i);
  });
});
