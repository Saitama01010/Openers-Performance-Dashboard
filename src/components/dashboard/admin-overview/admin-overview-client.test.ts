import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("admin overview presentation contract", () => {
  it("keeps the talent percentage centered inside the donut instead of in the legend flow", () => {
    const component = source("src/components/dashboard/admin-overview/admin-overview-client.tsx");
    const styles = source("src/components/dashboard/admin-overview/admin-overview.module.css");

    expect(component).toContain("centerClassName={styles.donutCenter}");
    expect(styles).toMatch(/\.donutCenter\s*\{[^}]*position:\s*absolute;/);
    expect(styles).not.toMatch(/\.donut\s*>\s*div\s*\{[^}]*position:\s*relative;/);
  });

  it("uses the shared trend visual language without persistent point hover targets", () => {
    const component = source("src/components/dashboard/admin-overview/admin-overview-client.tsx");
    const styles = source("src/components/dashboard/admin-overview/admin-overview.module.css");

    expect(component).toContain("className={styles.trendArea}");
    expect(component).toContain("className={styles.trendLine}");
    expect(component).toContain("className={styles.trendDot}");
    expect(component).not.toContain("onMouseEnter={() => setActive(index)}");
    expect(styles).toMatch(/\.trendLine\s*\{[^}]*pointer-events:\s*none;/);
    expect(styles).toMatch(/\.trendDot\s*\{[^}]*pointer-events:\s*none;/);
  });
});
