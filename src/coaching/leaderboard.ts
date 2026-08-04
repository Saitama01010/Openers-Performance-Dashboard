import type { ScopedAgent, ScopedManager } from "@/agents/scope";

export type CoachingParticipantAttribution = {
  sessionId: string;
  coachProfileId: string;
  agentProfileId: string;
  teamIdSnapshot: string | null;
};

export function buildCoachingLeaderboardRows(input: {
  managers: readonly ScopedManager[];
  agents: readonly ScopedAgent[];
  participants: readonly CoachingParticipantAttribution[];
  teamId?: string;
}) {
  return input.managers.map((manager) => {
    const effectiveTeams = manager.teams.filter(
      (team) => !input.teamId || team.id === input.teamId,
    );
    const effectiveTeamIds = new Set(effectiveTeams.map((team) => team.id));
    const assignedIds = new Set(
      input.agents
        .filter((agent) =>
          agent.teams.some((team) => effectiveTeamIds.has(team.id)),
        )
        .map((agent) => agent.id),
    );
    const managerParticipants = input.participants.filter(
      (participant) =>
        participant.coachProfileId === manager.id &&
        assignedIds.has(participant.agentProfileId) &&
        (!input.teamId || participant.teamIdSnapshot === input.teamId),
    );
    const coachedIds = new Set(
      managerParticipants.map((participant) => participant.agentProfileId),
    );
    const sessions = new Set(
      managerParticipants.map((participant) => participant.sessionId),
    );
    const assignedAgents = assignedIds.size;
    const coachedAgents = coachedIds.size;
    const coveragePercentage =
      assignedAgents > 0
        ? Math.min(100, Math.max(0, (coachedAgents / assignedAgents) * 100))
        : null;
    const status =
      coveragePercentage === null
        ? ("N/A" as const)
        : coveragePercentage === 100
          ? ("Complete" as const)
          : coveragePercentage > 0
            ? ("In progress" as const)
            : ("Not started" as const);

    return {
      managerId: manager.id,
      managerName: manager.name,
      teamNames: effectiveTeams.map((team) => team.name),
      assignedAgents,
      coachedAgents,
      missingAgents: Math.max(0, assignedAgents - coachedAgents),
      sessionsCompleted: sessions.size,
      individualParticipants: managerParticipants.length,
      coveragePercentage,
      status,
    };
  });
}
