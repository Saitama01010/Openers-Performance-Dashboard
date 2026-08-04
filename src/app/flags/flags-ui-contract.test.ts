import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const performancePage = readFileSync(
  "src/app/flags/performance/page.tsx",
  "utf8",
);
const transferPage = readFileSync(
  "src/app/flags/transfers/page.tsx",
  "utf8",
);
const flagsLayout = readFileSync("src/app/flags/layout.tsx", "utf8");
const coachingDialog = readFileSync(
  "src/app/coaching/room/new-coaching-session-dialog.tsx",
  "utf8",
);
const tabs = readFileSync(
  "src/components/dashboard/section-tabs.tsx",
  "utf8",
);

describe("coaching and flags UI contract", () => {
  it("exposes both flag tabs and the complete self-service measurements", () => {
    expect(flagsLayout).toContain("Performance Flags");
    expect(flagsLayout).toContain("Transfer Flags");
    for (const label of [
      "Talk time",
      "Wrap time",
      "Wrap minutes / talk hour",
      "Allowed wrap threshold",
      "Net counted time",
      "Pause time",
      "Pause minutes / net hour",
      "Allowed pause threshold",
      "No active flags",
    ]) {
      expect(performancePage).toContain(label);
    }
    expect(transferPage).toContain("Weekly closed deals");
    expect(transferPage).toContain("Closed source health");
    expect(transferPage).toContain("No zero-deal flags were generated");
  });

  it("uses a labelled modal with native Escape cancellation and multi-selection", () => {
    expect(coachingDialog).toContain('aria-modal="true"');
    expect(coachingDialog).toContain("onCancel");
    expect(coachingDialog).toContain("multiple");
    expect(coachingDialog).toContain("New coaching session");
  });

  it("supports arrow, Home, and End keys across nested tabs", () => {
    expect(tabs).toContain("ArrowLeft");
    expect(tabs).toContain("ArrowRight");
    expect(tabs).toContain("Home");
    expect(tabs).toContain("End");
    expect(tabs).toContain('role="tablist"');
  });
});
