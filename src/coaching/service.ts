import "server-only";

import type { Actor } from "@/auth/authorization";
import { assertCoachingCreateAccess } from "@/auth/feature-access";
import type { ScopedAgent, ScopedManager } from "@/agents/scope";
import {
  listOrganizationActiveManagers,
  listScopedActiveAgents,
} from "@/agents/scope";
import type { CoachingCategory } from "@/coaching/domain";
import { COACHING_NOTE_MAX_LENGTH } from "@/coaching/domain";
import { isValidDateKey } from "@/coaching/week";
import { getDb } from "@/db";
import {
  auditLogs,
  coachingSessionParticipants,
  coachingSessions,
} from "@/db/schema";
import { getEnv } from "@/env";
import { newId } from "@/lib/ids";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";

export type CoachingCreationParticipant = {
  agentProfileId: string;
  teamIdSnapshot: string | null;
  teamNameSnapshot: string;
};

export function buildCoachingCreationPlan(input: {
  actor: Actor;
  coachProfileId: string;
  selectedAgentIds: readonly string[];
  scopedAgents: readonly ScopedAgent[];
  organizationManagers: readonly ScopedManager[];
}) {
  if (input.actor.role === "agent") throw new Error("Forbidden");
  const agentIds = Array.from(new Set(input.selectedAgentIds));
  if (agentIds.length === 0) throw new Error("Select at least one agent.");

  const selectedCoachIsAdmin =
    input.actor.role === "admin" && input.coachProfileId === input.actor.id;
  const selectedManager = input.organizationManagers.find(
    (manager) => manager.id === input.coachProfileId,
  );
  if (input.actor.role === "manager" && input.coachProfileId !== input.actor.id) {
    throw new Error("The coach selection is not available.");
  }
  if (input.actor.role === "admin" && !selectedCoachIsAdmin && !selectedManager) {
    throw new Error("The coach selection is not available.");
  }

  const agentsById = new Map(input.scopedAgents.map((agent) => [agent.id, agent]));
  const participants = agentIds.map((agentId): CoachingCreationParticipant => {
    const agent = agentsById.get(agentId);
    if (!agent) {
      throw new Error("One or more selected agents are not available for coaching.");
    }

    const team = selectedCoachIsAdmin
      ? agent.teams[0] ?? null
      : agent.teams.find((candidate) =>
          agent.managerIds.includes(input.coachProfileId) &&
          (selectedManager?.teams.some((item) => item.id === candidate.id) ??
            input.actor.teamIds.includes(candidate.id)),
        ) ?? null;
    if (!selectedCoachIsAdmin && !team) {
      throw new Error("One or more selected agents are not available for coaching.");
    }

    return {
      agentProfileId: agent.id,
      teamIdSnapshot: team?.id ?? null,
      teamNameSnapshot: team?.name ?? "Unassigned",
    };
  });

  return {
    createdByProfileId: input.actor.id,
    coachProfileId: input.coachProfileId,
    participants,
    creditedManagerId: selectedManager?.id ?? null,
  };
}

export async function createCoachingSession(
  actor: Actor,
  input: {
    agentProfileIds: readonly string[];
    category: CoachingCategory;
    coachProfileId: string;
    note?: string | null;
    sessionDate: string;
  },
) {
  await assertCoachingCreateAccess(actor);
  const note = input.note?.trim() || null;
  if (note && note.length > COACHING_NOTE_MAX_LENGTH) {
    throw new Error(`Coaching note must be ${COACHING_NOTE_MAX_LENGTH} characters or fewer.`);
  }
  if (!isValidDateKey(input.sessionDate)) {
    throw new Error("Enter a valid coaching date.");
  }
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  if (input.sessionDate > dateKeyInTimeZone(new Date(), timeZone)) {
    throw new Error("Coaching date cannot be in the future.");
  }

  const [scopedAgents, organizationManagers] = await Promise.all([
    listScopedActiveAgents(actor),
    listOrganizationActiveManagers(actor),
  ]);
  const plan = buildCoachingCreationPlan({
    actor,
    coachProfileId: input.coachProfileId,
    selectedAgentIds: input.agentProfileIds,
    scopedAgents,
    organizationManagers,
  });
  const sessionId = newId();

  await getDb().transaction(async (tx) => {
    await tx.insert(coachingSessions).values({
      id: sessionId,
      organizationId: actorOrganizationId(actor),
      createdByProfileId: plan.createdByProfileId,
      coachProfileId: plan.coachProfileId,
      category: input.category,
      note,
      sessionDate: input.sessionDate,
    });
    await tx.insert(coachingSessionParticipants).values(
      plan.participants.map((participant) => ({
        id: newId(),
        sessionId,
        ...participant,
      })),
    );
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "coaching.session_created",
      entityType: "coaching_session",
      entityId: sessionId,
      metadata: {
        category: input.category,
        sessionDate: input.sessionDate,
        participantCount: plan.participants.length,
        participantIds: plan.participants.map(
          (participant) => participant.agentProfileId,
        ),
        createdByProfileId: plan.createdByProfileId,
        coachProfileId: plan.coachProfileId,
        managerId: plan.creditedManagerId,
      },
    });
  });

  return { sessionId, participantCount: plan.participants.length };
}
