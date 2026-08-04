import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const performancePage = readFileSync("src/app/flags/performance/page.tsx", "utf8");
const transferPage = readFileSync("src/app/flags/transfers/page.tsx", "utf8");
const coachingLeaderboard = readFileSync("src/app/coaching/leaderboard/page.tsx", "utf8");
const coachingDialog = readFileSync("src/app/coaching/room/new-coaching-session-dialog.tsx", "utf8");
const globalStyles = readFileSync("src/app/globals.css", "utf8");
const workspacePages = [
  "src/app/dashboard/page.tsx",
  "src/app/performance/page.tsx",
  "src/app/leaderboard/page.tsx",
  "src/app/agents/page.tsx",
  "src/app/teams/performance/page.tsx",
  "src/app/coaching/leaderboard/page.tsx",
  "src/app/coaching/room/page.tsx",
  "src/app/coaching/improvement/page.tsx",
  "src/app/flags/performance/page.tsx",
  "src/app/flags/transfers/page.tsx",
].map((path) => readFileSync(path, "utf8"));

describe("coaching and flags UI contract", () => {
  it("uses exactly the requested six Performance Flag headers", () => {
    for (const label of ["Agent", "Team", "Talk Time", "Wrap Time", "Pause Time", "Triggered Flag"]) {
      expect(performancePage).toContain(`>${label}<`);
    }
    for (const removed of ["Week", "Wrap / Talk Hour", "Wrap Limit", "Net Counted", "Pause / Net Hour", "Pause Limit", "Status"]) {
      expect(performancePage).not.toContain(`>${removed}<`);
    }
    expect(performancePage).toContain("No active flags");
    expect(performancePage).toContain("min per talk hour, above the");
    expect(performancePage).toContain("min per net counted hour, above the");
  });

  it("renders Manager and Agent as real single-select controls", () => {
    const page = performancePage;
    const managerFilter = page.slice(
      page.indexOf('label: "Manager"'),
      page.indexOf('label: "Agent"'),
    );
    const agentFilter = page.slice(
      page.indexOf('label: "Agent"'),
      page.indexOf('label: "Wrap flag type"'),
    );

    expect(managerFilter).toContain('label: "All managers"');
    expect(agentFilter).toContain('label: "All agents"');
    expect(managerFilter).not.toContain('kind: "combobox"');
    expect(agentFilter).not.toContain('kind: "combobox"');
    expect(managerFilter).toContain("value: manager.id");
    expect(agentFilter).toContain("value: agent.id");
  });

  it("uses exactly the requested four Transfer Flag headers and no fake unavailable rows", () => {
    for (const label of ["Agent", "Team", "Closed Deals This Week", "Flag Type"]) {
      expect(transferPage).toContain(`>${label}<`);
    }
    expect(transferPage).not.toContain(">Source Status<");
    expect(transferPage).not.toContain(">Week<");
    expect(transferPage).toContain("Missing-source data was not classified as zero deals");
  });

  it("uses exactly six Coaching Leaderboard headers and an accessible progress bar", () => {
    for (const label of ["Manager", "Teams", "Assigned Agents", "Coached Agents", "Sessions Completed", "Coverage"]) {
      expect(coachingLeaderboard).toContain(`>${label}<`);
    }
    expect(coachingLeaderboard).toContain('role="progressbar"');
    expect(coachingLeaderboard).toContain("aria-valuenow");
    expect(coachingLeaderboard).toContain('percentage === null ? "N/A"');
    expect(globalStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalStyles).toContain(".coverage-progress__fill");
    expect(globalStyles).toContain("animation: none");
  });

  it("uses a wide native modal with searchable persistent checkbox selection", () => {
    expect(coachingDialog).toContain('aria-modal="true"');
    expect(coachingDialog).toContain("onCancel");
    expect(coachingDialog).toContain('type="checkbox"');
    expect(coachingDialog).toContain("Select all visible");
    expect(coachingDialog).toContain("Clear selected");
    expect(coachingDialog).toContain("selectedIds");
  });

  it("has no read-only Apply filters or week-only inputs on workspace pages", () => {
    for (const page of workspacePages) {
      expect(page).not.toContain("Apply filters");
      expect(page).not.toContain("Week containing");
    }
  });
});
