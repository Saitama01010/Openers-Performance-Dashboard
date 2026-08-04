import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Actor } from "@/auth/authorization";
import type { ScopedAgent, ScopedManager } from "@/agents/scope";
import { buildCoachingCreationPlan } from "@/coaching/service";

const manager: Actor = {
  id: "manager-east",
  role: "manager",
  teamIds: ["east"],
  organizationId: "org-1",
};
const admin: Actor = {
  id: "admin-1",
  role: "admin",
  teamIds: [],
  organizationId: "org-1",
};
const managers: ScopedManager[] = [
  { id: "manager-east", name: "East Manager", teams: [{ id: "east", name: "East" }] },
  { id: "manager-west", name: "West Manager", teams: [{ id: "west", name: "West" }] },
];
const agents: ScopedAgent[] = [
  { id: "agent-east", name: "East Agent", americanName: "East", teams: [{ id: "east", name: "East" }], managerIds: ["manager-east"] },
  { id: "agent-west", name: "West Agent", americanName: "West", teams: [{ id: "west", name: "West" }], managerIds: ["manager-west"] },
];

describe("coaching creation authorization plan", () => {
  it("stores the actual submitter separately from the selected manager coach", () => {
    expect(buildCoachingCreationPlan({ actor: admin, coachProfileId: "manager-east", selectedAgentIds: ["agent-east"], scopedAgents: agents, organizationManagers: managers })).toMatchObject({
      createdByProfileId: "admin-1",
      coachProfileId: "manager-east",
      creditedManagerId: "manager-east",
      participants: [{ agentProfileId: "agent-east", teamIdSnapshot: "east", teamNameSnapshot: "East" }],
    });
  });

  it("allows admin self-coaching for one or multiple organization agents", () => {
    const plan = buildCoachingCreationPlan({ actor: admin, coachProfileId: "admin-1", selectedAgentIds: ["agent-east", "agent-west"], scopedAgents: agents, organizationManagers: managers });
    expect(plan.creditedManagerId).toBeNull();
    expect(plan.participants).toHaveLength(2);
  });

  it("deduplicates repeated participant IDs into one group participant", () => {
    expect(buildCoachingCreationPlan({ actor: manager, coachProfileId: manager.id, selectedAgentIds: ["agent-east", "agent-east"], scopedAgents: [agents[0]], organizationManagers: managers }).participants).toHaveLength(1);
  });

  it("prevents managers from changing the coach", () => {
    expect(() => buildCoachingCreationPlan({ actor: manager, coachProfileId: "manager-west", selectedAgentIds: ["agent-east"], scopedAgents: [agents[0]], organizationManagers: managers })).toThrow("coach selection");
  });

  it("rejects a manager outside the organization and agents outside the credited manager scope", () => {
    expect(() => buildCoachingCreationPlan({ actor: admin, coachProfileId: "foreign-manager", selectedAgentIds: ["agent-east"], scopedAgents: agents, organizationManagers: managers })).toThrow("coach selection");
    expect(() => buildCoachingCreationPlan({ actor: admin, coachProfileId: "manager-east", selectedAgentIds: ["agent-west"], scopedAgents: agents, organizationManagers: managers })).toThrow("not available for coaching");
  });

  it("fails closed for empty selections", () => {
    expect(() => buildCoachingCreationPlan({ actor: admin, coachProfileId: admin.id, selectedAgentIds: [], scopedAgents: agents, organizationManagers: managers })).toThrow("Select at least one agent");
  });
});
