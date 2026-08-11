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

const retiredLightOnlyLiterals = [
  "#fbfdff",
  "#fbfcff",
  "#f4f7fb",
  "#f1f5fa",
  "#edf1f6",
  "#e7ecf3",
  "#e5ebf3",
  "#d8e1ef",
  "#1765ff",
  "#1769ef",
  "#1854c4",
  "#79540d",
  "#7d5b13",
  "#0d7d42",
  "#c93643",
] as const;

function luminance(hex: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

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
    for (const retired of retiredLightOnlyLiterals) {
      expect(contents.toLowerCase()).not.toContain(retired);
    }
  });

  it("keeps dark foreground and semantic pairs at WCAG AA contrast", () => {
    const pairs = [
      ["#f0f4fb", "#111d30"],
      ["#b2bfd0", "#111d30"],
      ["#84aaff", "#1b3157"],
      ["#ff938c", "#43252c"],
      ["#63ddb0", "#173a31"],
      ["#ffd083", "#3d301b"],
      ["#c4a7ff", "#30264d"],
      ["#ffb270", "#402b20"],
      ["#72dce6", "#17363b"],
      ["#ff9bbb", "#412535"],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
