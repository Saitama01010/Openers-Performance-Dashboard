import type { ScopedAgent, ScopedManager } from "@/agents/scope";
import type { DashboardDateWindow } from "@/dashboard/date-range";
import { addDateKeyDays, normalizeWeekStart } from "@/coaching/week";

export const ONE_TO_ONE_WEEKLY_TARGET = 25;
export const TEAM_COACHING_WEEKLY_TARGET = 1;

export type CoachingParticipantAttribution = {
  sessionId: string;
  coachProfileId: string;
  agentProfileId: string;
  teamIdSnapshot: string | null;
};

export function applicableCoachingWeeks(dateRange: DashboardDateWindow) {
  if (!dateRange.from || !dateRange.to) return null;
  const firstWeek = normalizeWeekStart(dateRange.from);
  const lastWeek = normalizeWeekStart(dateRange.to);
  if (!firstWeek || !lastWeek || firstWeek > lastWeek) {
    throw new Error("Invalid coaching leaderboard date range.");
  }

  let weeks = 0;
  for (
    let weekStart = firstWeek;
    weekStart <= lastWeek;
    weekStart = addDateKeyDays(weekStart, 7)
  ) {
    weeks += 1;
  }
  return weeks;
}

function targetProgress(completed: number, target: number | null) {
  return target === null ? null : Math.min(100, (completed / target) * 100);
}

export function buildCoachingLeaderboardRows(input: {
  managers: readonly ScopedManager[];
  agents: readonly ScopedAgent[];
  participants: readonly CoachingParticipantAttribution[];
  applicableWeeks: number | null;
  teamId?: string;
}) {
  const participantIdsBySession = new Map<string, Set<string>>();
  for (const participant of input.participants) {
    const participantIds = participantIdsBySession.get(participant.sessionId) ?? new Set<string>();
    participantIds.add(participant.agentProfileId);
    participantIdsBySession.set(participant.sessionId, participantIds);
  }

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
    let oneToOneCompleted = 0;
    let teamCoachingCompleted = 0;
    for (const sessionId of sessions) {
      const participantCount = participantIdsBySession.get(sessionId)?.size ?? 0;
      if (participantCount === 1) oneToOneCompleted += 1;
      if (participantCount >= 2) teamCoachingCompleted += 1;
    }
    const oneToOneTarget =
      input.applicableWeeks === null
        ? null
        : input.applicableWeeks * ONE_TO_ONE_WEEKLY_TARGET;
    const teamCoachingTarget =
      input.applicableWeeks === null
        ? null
        : input.applicableWeeks * TEAM_COACHING_WEEKLY_TARGET;
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
      applicableWeeks: input.applicableWeeks,
      oneToOneCompleted,
      oneToOneTarget,
      oneToOnePercentage: targetProgress(oneToOneCompleted, oneToOneTarget),
      teamCoachingCompleted,
      teamCoachingTarget,
      teamCoachingPercentage: targetProgress(
        teamCoachingCompleted,
        teamCoachingTarget,
      ),
      coveragePercentage,
      status,
    };
  });
}
