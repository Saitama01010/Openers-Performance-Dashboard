import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("login redesign interface contract", () => {
  it("keeps the existing server-side authentication boundary", () => {
    const page = source("src/app/login/page.tsx");
    const action = source("src/auth/actions.ts");

    expect(page).toContain("getCurrentUser()");
    expect(page).toContain('redirect("/dashboard")');
    expect(page).toContain("action={loginAction}");
    expect(action).toContain("authenticateCredentials(email, password)");
    expect(action).toContain("createSession(result.profile)");
  });

  it("uses the supplied logo and the approved operational copy", () => {
    const shell = source("src/components/auth/login-shell.tsx");

    expect(shell).toContain('/brand/openers-performance-logo.png');
    expect(shell).toContain("Operational");
    expect(shell).toContain("performance, with");
    expect(shell).toContain("the data trail intact.");
    expect(shell).toContain("Role-scoped performance");
    expect(shell).toContain("Active import versioning");
    expect(shell).toContain("Auditable administration");
  });

  it("keeps the complete official mark visible at desktop and mobile sizes", () => {
    const styles = source("src/components/auth/login.module.css");

    expect(styles).toContain("inset: -2.58rem auto auto -3.25rem");
    expect(styles).toContain("inset: -1.6rem auto auto -2.03rem");
    expect(styles).not.toContain("inset: -2.9rem auto auto -3.25rem");
    expect(styles).not.toContain("inset: -1.82rem auto auto -2.03rem");
  });

  it("keeps login controls accessible and does not fake remember-me semantics", () => {
    const page = source("src/app/login/page.tsx");
    const controls = source("src/components/auth/login-controls.tsx");

    expect(page).toContain('autoComplete="email"');
    expect(page).toContain('htmlFor="login-email"');
    expect(page).toContain("maxLength={255}");
    expect(controls).toContain('autoComplete="current-password"');
    expect(controls).toContain('htmlFor="login-password"');
    expect(controls).toContain("maxLength={256}");
    expect(controls).toContain('type={visible ? "text" : "password"}');
    expect(controls).toContain('aria-label={visible ? "Hide password" : "Show password"}');
    expect(controls).toContain('disabled={pending}');
    expect(controls).toContain('pending ? "Signing in..." : children');
    expect(page).not.toContain("Remember me");
  });

  it("provides responsive mobile targets and reduced-motion behavior", () => {
    const styles = source("src/components/auth/login.module.css");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 820px)"));

    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
    expect(mobile).toContain("grid-template-columns: 1fr");
    expect(mobile).toContain("min-height: 44px");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
