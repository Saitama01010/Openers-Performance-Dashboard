import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const performancePage = readFileSync("src/app/flags/performance/page.tsx", "utf8");
const coachingLeaderboard = readFileSync("src/app/coaching/leaderboard/page.tsx", "utf8");
const coachingComposer = readFileSync("src/components/dashboard/coaching/coaching-session-composer.tsx", "utf8");
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
  it("uses the approved Performance Flag headers and real severity fallback", () => {
    const client = readFileSync("src/components/dashboard/flags/flags-page-client.tsx", "utf8");
    for (const label of ["Agent", "Team", "Talk Time", "Wrap Time", "Pause Time", "Triggered Flag", "Severity", "Action"]) {
      expect(client).toContain(`>${label}<`);
    }
    for (const removed of ["Wrap / Talk Hour", "Wrap Limit", "Net Counted", "Pause / Net Hour", "Pause Limit", "Status"]) {
      expect(client).not.toContain(`>${removed}<`);
    }
    expect(client).toContain("No active flags");
    expect(client).toContain("min per talk hour, above the");
    expect(client).toContain("min per net counted hour, above the");
    expect(client).toContain("No authoritative severity policy is configured");
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

  it("uses the approved Transfer Flag headers and no fake unavailable rows", () => {
    const client = readFileSync("src/components/dashboard/flags/flags-page-client.tsx", "utf8");
    for (const label of ["Agent", "Team", "Closed Deals This Week", "Week Range", "Flag Type", "Severity", "Action"]) {
      expect(client).toContain(`>${label}<`);
    }
    expect(client).not.toContain(">Source Status<");
    expect(client).toContain("Missing-source data was not classified as zero deals");
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

  it("uses an inline four-step composer with persistent paginated selection", () => {
    expect(coachingComposer).not.toContain('aria-modal="true"');
    expect(coachingComposer).toContain("Participants");
    expect(coachingComposer).toContain("Review & confirm");
    expect(coachingComposer).toContain('type="checkbox"');
    expect(coachingComposer).toContain("Select all visible");
    expect(coachingComposer).toContain("new Map(current)");
    expect(coachingComposer).toContain("/api/coaching/participants");
  });

  it("has no read-only Apply filters or week-only inputs on workspace pages", () => {
    for (const page of workspacePages) {
      expect(page).not.toContain("Apply filters");
      expect(page).not.toContain("Week containing");
    }
  });
});
