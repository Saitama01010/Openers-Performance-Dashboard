import { describe, expect, it } from "vitest";

import type { ScopedAgent, ScopedManager } from "@/agents/scope";
import {
  applicableCoachingWeeks,
  buildCoachingLeaderboardRows,
  ONE_TO_ONE_WEEKLY_TARGET,
  TEAM_COACHING_WEEKLY_TARGET,
} from "@/coaching/leaderboard";

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

function leaderboard(
  participants: Parameters<typeof buildCoachingLeaderboardRows>[0]["participants"],
  options: { applicableWeeks?: number | null; teamId?: string } = {},
) {
  return buildCoachingLeaderboardRows({
    managers: [managers[0]],
    agents,
    participants,
    applicableWeeks:
      options.applicableWeeks === undefined ? 1 : options.applicableWeeks,
    teamId: options.teamId,
  })[0];
}

describe("manager coaching leaderboard attribution", () => {
  it("counts a one-participant session as one 1:1 session and no team session", () => {
    expect(leaderboard([
      { sessionId: "solo", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
    ])).toMatchObject({
      oneToOneCompleted: 1,
      oneToOnePercentage: 4,
      teamCoachingCompleted: 0,
      teamCoachingPercentage: 0,
    });
  });

  it("counts a multiple-participant session once as team coaching, not once per participant", () => {
    expect(leaderboard([
      { sessionId: "group", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "group", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
    ])).toMatchObject({
      sessionsCompleted: 1,
      individualParticipants: 2,
      oneToOneCompleted: 0,
      teamCoachingCompleted: 1,
      teamCoachingPercentage: 100,
    });
  });

  it("counts separate one-participant sessions independently, including repeats for one agent", () => {
    expect(leaderboard([
      { sessionId: "solo-1", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "solo-2", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "solo-3", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
    ])).toMatchObject({
      coachedAgents: 2,
      sessionsCompleted: 3,
      oneToOneCompleted: 3,
      teamCoachingCompleted: 0,
    });
  });

  it("uses independent weekly targets of 25 1:1 sessions and 1 team session", () => {
    expect(ONE_TO_ONE_WEEKLY_TARGET).toBe(25);
    expect(TEAM_COACHING_WEEKLY_TARGET).toBe(1);
    expect(leaderboard([], { applicableWeeks: 1 })).toMatchObject({
      oneToOneTarget: 25,
      teamCoachingTarget: 1,
      oneToOnePercentage: 0,
      teamCoachingPercentage: 0,
    });
    expect(leaderboard([], { applicableWeeks: 3 })).toMatchObject({
      oneToOneTarget: 75,
      teamCoachingTarget: 3,
    });
  });

  it("calculates partial 1:1 weekly progress independently", () => {
    const participants = Array.from({ length: 18 }, (_, index) => ({
      sessionId: `solo-${index}`,
      coachProfileId: "manager-east",
      agentProfileId: "agent-a",
      teamIdSnapshot: "east",
    }));

    expect(leaderboard(participants)).toMatchObject({
      oneToOneCompleted: 18,
      oneToOneTarget: 25,
      oneToOnePercentage: 72,
      teamCoachingCompleted: 0,
      teamCoachingPercentage: 0,
    });
  });

  it("caps percentages at 100% while preserving counts above target", () => {
    const participants = Array.from({ length: 30 }, (_, index) => ({
      sessionId: `solo-${index}`,
      coachProfileId: "manager-east",
      agentProfileId: "agent-a",
      teamIdSnapshot: "east",
    }));
    participants.push(
      { sessionId: "group-1", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "group-1", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
      { sessionId: "group-2", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "group-2", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
    );

    expect(leaderboard(participants)).toMatchObject({
      oneToOneCompleted: 30,
      oneToOneTarget: 25,
      oneToOnePercentage: 100,
      teamCoachingCompleted: 2,
      teamCoachingTarget: 1,
      teamCoachingPercentage: 100,
    });
  });

  it("credits admin-submitted sessions to the selected manager and preserves team filtering", () => {
    const participants = [
      { sessionId: "admin-self", coachProfileId: "admin-1", agentProfileId: "agent-a", teamIdSnapshot: "east" },
      { sessionId: "admin-manager", coachProfileId: "manager-east", agentProfileId: "agent-b", teamIdSnapshot: "east" },
      { sessionId: "wrong-team", coachProfileId: "manager-east", agentProfileId: "agent-a", teamIdSnapshot: "west" },
      { sessionId: "inactive", coachProfileId: "manager-east", agentProfileId: "inactive-agent", teamIdSnapshot: "east" },
    ];

    expect(leaderboard(participants, { teamId: "east" })).toMatchObject({
      coachedAgents: 1,
      sessionsCompleted: 1,
      oneToOneCompleted: 1,
      teamCoachingCompleted: 0,
      coveragePercentage: 50,
    });
  });

  it("reports coverage as N/A for a manager with no assigned active agents", () => {
    expect(
      buildCoachingLeaderboardRows({
        managers: [managers[1]],
        agents,
        participants: [],
        applicableWeeks: 1,
      })[0],
    ).toMatchObject({
      assignedAgents: 0,
      coveragePercentage: null,
      status: "N/A",
      oneToOneTarget: 25,
      teamCoachingTarget: 1,
    });
  });
});

describe("manager coaching weekly target windows", () => {
  it("uses Monday-Sunday buckets without prorating partial weeks", () => {
    expect(applicableCoachingWeeks({ from: "2026-08-03", to: "2026-08-09" })).toBe(1);
    expect(applicableCoachingWeeks({ from: "2026-08-05", to: "2026-08-05" })).toBe(1);
    expect(applicableCoachingWeeks({ from: "2026-08-09", to: "2026-08-10" })).toBe(2);
    expect(applicableCoachingWeeks({ from: "2026-08-01", to: "2026-08-31" })).toBe(6);
  });

  it("leaves all-time scores undefined because there is no bounded weekly denominator", () => {
    expect(applicableCoachingWeeks({})).toBeNull();
    expect(leaderboard([], { applicableWeeks: null })).toMatchObject({
      oneToOneTarget: null,
      teamCoachingTarget: null,
      oneToOnePercentage: null,
      teamCoachingPercentage: null,
    });
  });
});
