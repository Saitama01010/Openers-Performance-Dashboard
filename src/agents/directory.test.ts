import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  listAgents: vi.fn(),
  dashboard: vi.fn(),
  outcomeSource: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/current-actor", () => ({ resolveCurrentActor: mocks.resolveActor }));
vi.mock("@/agents/scope", () => ({
  listScopedActiveAgents: mocks.listAgents,
  uniqueScopedTeams: (agents: Array<{ teams: Array<{ id: string; name: string }> }>) =>
    [...new Map(agents.flatMap((agent) => agent.teams).map((team) => [team.id, team])).values()],
}));
vi.mock("@/dashboard/data", () => ({
  buildDashboardScope: vi.fn(),
  getDashboardData: mocks.dashboard,
}));
vi.mock("@/dashboard/outcome-source", () => ({
  loadRoleDashboardOutcomeSource: mocks.outcomeSource,
  outcomeSnapshot: () => ({
    transfers: { status: "unavailable", value: null },
    closedDeals: { status: "unavailable", value: null },
    transferByAgent: new Map(),
    closedByAgent: new Map(),
  }),
}));

import { resolveAgentDirectoryFilters } from "@/agents/directory-analytics";
import { getAgentDirectoryData } from "@/agents/directory";

const range = { key: "all-time" as const, label: "All Time", comparison: null };
const identities = {
  a: { id: "a", name: "Agent A", americanName: "Amy", teams: [{ id: "east", name: "East" }], managerIds: [] },
  b: { id: "b", name: "Agent B", americanName: "Bea", teams: [{ id: "west", name: "West" }], managerIds: [] },
};

function dashboardRows(ids: string[]) {
  return {
    status: "ACTIVE_IMPORT",
    agentRows: ids.map((id) => ({
      profileId: id,
      accountStatus: "active",
      hasMetrics: true,
      loggedInSeconds: 3600,
      talkSeconds: 900,
      talkPercentage: 25,
    })),
  };
}

describe("agent directory role scope", () => {
  beforeEach(() => {
    mocks.resolveActor.mockImplementation(async (actor) => actor);
    mocks.outcomeSource.mockResolvedValue({ status: "unavailable", message: "Unavailable", timeZone: "Africa/Cairo" });
    mocks.dashboard.mockImplementation(async (actor) => dashboardRows(
      actor.role === "admin" ? ["a", "b"] : actor.role === "manager" && actor.teamIds.length > 0 ? ["a"] : actor.role === "agent" ? [actor.id] : [],
    ));
    mocks.listAgents.mockImplementation(async (actor) =>
      actor.role === "admin"
        ? [identities.a, identities.b]
        : actor.role === "manager"
          ? actor.teamIds.length > 0 ? [identities.a] : []
          : actor.id === "b" ? [identities.b] : [],
    );
  });

  it.each([
    [{ id: "admin", role: "admin", organizationId: "org", teamIds: [] }, ["a", "b"]],
    [{ id: "manager", role: "manager", organizationId: "org", teamIds: ["east"] }, ["a"]],
    [{ id: "manager-empty", role: "manager", organizationId: "org", teamIds: [] }, []],
    [{ id: "b", role: "agent", organizationId: "org", teamIds: [] }, ["b"]],
  ] as const)("keeps %s inside the revalidated server scope", async (actor, expected) => {
    const mutableActor = { ...actor, teamIds: [...actor.teamIds] };
    const data = await getAgentDirectoryData(mutableActor, {
      dateRange: range,
      filters: resolveAgentDirectoryFilters({ data: "all" }),
      includeTrends: false,
    });
    expect(data.rows.map((row) => row.profileId)).toEqual(expected);
    expect(mocks.resolveActor).toHaveBeenCalledWith(mutableActor);
  });
});
