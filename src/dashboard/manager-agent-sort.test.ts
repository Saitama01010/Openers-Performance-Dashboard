import { describe, expect, it } from "vitest";

import { resolveManagerAgentSort, sortManagerAgentRows } from "@/dashboard/manager-agent-sort";

function row(name: string, overrides: Record<string, unknown> = {}) {
  return {
    agentName: name,
    automaticFlags: { triggeredFlags: [] as string[] },
    coachingPending: 0,
    coverage: { status: "ready" as const, percentage: 80 },
    lowPerformance: { isLowPerformer: false },
    manualFlagCount: 0,
    monthTargetProgress: { status: "tracking" as const, actual: 8, target: 10, percentage: 80, remaining: 2 },
    monthTransfers: { value: 10 },
    team: { name: "East" },
    transferFlagCount: 0,
    transfers: { value: 2 },
    weeklyRank: 2,
    ...overrides,
  };
}

describe("manager agent table sorting", () => {
  it("sorts ascending and descending with stable agent-name tie breaks", () => {
    const rows = [row("Charlie", { transfers: { value: 4 } }), row("Alice"), row("Bob")];
    expect(sortManagerAgentRows(rows, { key: "today", direction: "asc" }).map((item) => item.agentName)).toEqual(["Alice", "Bob", "Charlie"]);
    expect(sortManagerAgentRows(rows, { key: "today", direction: "desc" }).map((item) => item.agentName)).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("keeps unavailable values last in both directions", () => {
    const rows = [row("Unavailable", { coverage: { status: "unavailable" as const } }), row("Ready")];
    expect(sortManagerAgentRows(rows, { key: "coverage", direction: "asc" }).at(-1)?.agentName).toBe("Unavailable");
    expect(sortManagerAgentRows(rows, { key: "coverage", direction: "desc" }).at(-1)?.agentName).toBe("Unavailable");
  });

  it("defaults invalid query values safely", () => {
    expect(resolveManagerAgentSort("unexpected", "sideways")).toEqual({ key: "agent", direction: "asc" });
  });
});
