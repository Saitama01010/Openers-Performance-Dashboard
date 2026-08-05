import { describe, expect, it } from "vitest";

import type { ScopedAgent, ScopedManager } from "@/agents/scope";
import { buildCoachingLeaderboardRows } from "@/coaching/leaderboard";

const managers: ScopedManager[] = [
  {
    id: "manager-east",
    name: "East Manager",
    teams: [{ id: "east", name: "East" }],
  },
  { id: "manager-empty", name: "Empty Manager", teams: [] },
];
const agents: ScopedAgent[] = [
  {
    id: "agent-a",
    name: "Agent A",
    americanName: null,
    teams: [{ id: "east", name: "East" }],
    managerIds: ["manager-east"],
  },
  {
    id: "agent-b",
    name: "Agent B",
    americanName: null,
    teams: [{ id: "east", name: "East" }],
    managerIds: ["manager-east"],
  },
];

describe("manager coaching leaderboard attribution", () => {
  it("credits every group participant once for coverage and keeps repeat sessions distinct", () => {
    const rows = buildCoachingLeaderboardRows({
      managers,
      agents,
      participants: [
        { sessionId: "group", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
        { sessionId: "group", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
        { sessionId: "repeat", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      ],
    });

    expect(rows[0]).toMatchObject({
      assignedAgents: 2,
      coachedAgents: 2,
      sessionsCompleted: 2,
      individualParticipants: 3,
      coveragePercentage: 100,
      status: "Complete",
    });
  });

  it("excludes administrator-self sessions but credits admin-submitted manager sessions", () => {
    const rows = buildCoachingLeaderboardRows({
      managers: [managers[0]],
      agents,
      participants: [
        { sessionId: "admin-self", coachProfileId: "admin-1", agentProfileId: "agent-a", teamIdSnapshot: "east" },
        { sessionId: "admin-manager", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
      ],
    });

    expect(rows[0]).toMatchObject({
      coachedAgents: 1,
      sessionsCompleted: 1,
      individualParticipants: 1,
      coveragePercentage: 50,
    });
  });

  it("reports N/A for a manager with no assigned active agents", () => {
    expect(
      buildCoachingLeaderboardRows({
        managers: [managers[1]],
        agents,
        participants: [],
      })[0],
    ).toMatchObject({
      assignedAgents: 0,
      coveragePercentage: null,
      status: "N/A",
    });
  });

  it("does not count inactive or out-of-scope participants", () => {
    const rows = buildCoachingLeaderboardRows({
      managers: [managers[0]],
      agents,
      participants: [
        { sessionId: "old", coachProfileId: "manager-east", agentProfileId: "inactive-agent", teamIdSnapshot: "east" },
        { sessionId: "wrong-team", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "west" },
      ],
      teamId: "east",
    });

    expect(rows[0]).toMatchObject({
      coachedAgents: 0,
      sessionsCompleted: 0,
      individualParticipants: 0,
    });
  });
});
