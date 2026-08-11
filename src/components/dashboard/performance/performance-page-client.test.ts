import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("performance page presentation contract", () => {
  it("keeps Activity States hover stationary and free of shared-state updates", () => {
    const component = source("src/components/dashboard/performance/performance-page-client.tsx");
    const styles = source("src/components/dashboard/performance/performance-page.module.css");
    const activityStates = component.slice(
      component.indexOf("function ActivityStates"),
      component.indexOf("type ColumnKey"),
    );
    const activityStyles = styles.slice(
      styles.indexOf(".activityCard {"),
      styles.indexOf(".tablePanel {"),
    );

    expect(activityStates).not.toContain("onMouseEnter");
    expect(activityStates).not.toContain("onMouseLeave");
    expect(activityStyles).not.toContain("translateY");
  });

  it("does not render N/A anywhere on the Performance page", () => {
    const component = source("src/components/dashboard/performance/performance-page-client.tsx");

    expect(component).not.toContain('"N/A"');
  });
});
