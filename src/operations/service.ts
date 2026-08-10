import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { listScopedActiveAgents } from "@/agents/scope";
import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor, type CurrentActor } from "@/auth/current-actor";
import { assertPermission } from "@/auth/permissions";
import { getDb } from "@/db";
import {
  auditLogs,
  coachingSessionParticipants,
  coachingSessions,
  manualFlagCaseEvents,
  manualFlagCases,
  profiles,
  shadowingSessions,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  assertManualFlagTransition,
  shadowingDisplayStatus,
  type ManualFlagStatus,
} from "@/operations/domain";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

async function currentAgentContext(actor: Actor, agentProfileId: string) {
  const rows = await getDb()
    .select({
      agentProfileId: profiles.id,
      agentName: profiles.name,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(profiles)
    .innerJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, profiles.id),
        eq(teamMemberships.role, "agent"),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .innerJoin(teams, and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)))
    .where(
      and(
        eq(profiles.id, agentProfileId),
        eq(profiles.organizationId, actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
        actor.role === "manager"
          ? actor.teamIds.length > 0
            ? inArray(teamMemberships.teamId, actor.teamIds)
            : eq(teamMemberships.id, "__empty_manager_scope__")
          : actor.role === "agent"
            ? eq(profiles.id, actor.id)
            : undefined,
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
  return rows[0];
}

export async function createShadowingSession(actor: Actor, input: {
  agentProfileId: string;
  scheduledDate: string;
  objective: string;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(actor, actor.role === "admin" ? "coaching.create_company" : "shadowing.manage_team");
  const agent = await currentAgentContext(actor, input.agentProfileId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) throw new Error("A valid scheduled date is required.");
  const id = newId();
  await getDb().transaction(async (tx) => {
    await tx.insert(shadowingSessions).values({
      id, organizationId: actorOrganizationId(actor), agentProfileId: agent.agentProfileId,
      teamIdSnapshot: agent.teamId, assignedLeaderId: actor.id,
      scheduledDate: input.scheduledDate, objective: requiredText(input.objective, "Objective"),
      status: "scheduled", createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "shadowing.created",
      entityType: "shadowing_session", entityId: id,
      metadata: { agentProfileId: agent.agentProfileId, teamId: agent.teamId },
    });
  });
  return id;
}

export async function completeShadowingSession(actor: Actor, input: {
  sessionId: string;
  internalNotes?: string;
  publishedOutcome?: string;
  followUpAction?: string;
  publishToAgent: boolean;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(actor, actor.role === "admin" ? "coaching.create_company" : "shadowing.manage_team");
  await getDb().transaction(async (tx) => {
    const [session] = await tx.select().from(shadowingSessions)
      .where(and(eq(shadowingSessions.id, input.sessionId), eq(shadowingSessions.organizationId, actorOrganizationId(actor))))
      .limit(1).for("update");
    if (!session) throw new Error("Shadowing session was not found.");
    await currentAgentContext(actor, session.agentProfileId);
    if (session.status !== "scheduled") throw new Error("Only scheduled shadowing can be completed.");
    await tx.update(shadowingSessions).set({
      status: "completed", completedAt: new Date(),
      internalNotes: input.internalNotes?.trim() || null,
      publishedOutcome: input.publishedOutcome?.trim() || null,
      followUpAction: input.followUpAction?.trim() || null,
      publishedToAgent: input.publishToAgent,
    }).where(eq(shadowingSessions.id, input.sessionId));
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "shadowing.completed",
      entityType: "shadowing_session", entityId: input.sessionId,
      metadata: { publishedToAgent: input.publishToAgent },
    });
  });
}

export async function listShadowingSessions(actor: Actor, timeZone = "Africa/Cairo") {
  return listShadowingSessionsForCurrentActor(await resolveCurrentActor(actor), timeZone);
}

export async function listShadowingSessionsForCurrentActor(
  actor: CurrentActor,
  timeZone = "Africa/Cairo",
) {
  if (actor.role === "manager" && actor.teamIds.length === 0) return [];
  const currentManagerAgentIds = actor.role === "manager"
    ? (await listScopedActiveAgents(actor)).map((agent) => agent.id)
    : null;
  if (actor.role === "manager" && currentManagerAgentIds?.length === 0) return [];
  const rows = await getDb()
    .select({
      id: shadowingSessions.id,
      agentProfileId: shadowingSessions.agentProfileId,
      agentName: profiles.name,
      teamId: shadowingSessions.teamIdSnapshot,
      assignedLeaderId: shadowingSessions.assignedLeaderId,
      scheduledDate: shadowingSessions.scheduledDate,
      status: shadowingSessions.status,
      objective: shadowingSessions.objective,
      internalNotes: shadowingSessions.internalNotes,
      publishedOutcome: shadowingSessions.publishedOutcome,
      followUpAction: shadowingSessions.followUpAction,
      publishedToAgent: shadowingSessions.publishedToAgent,
      completedAt: shadowingSessions.completedAt,
    })
    .from(shadowingSessions)
    .innerJoin(profiles, eq(profiles.id, shadowingSessions.agentProfileId))
    .where(and(
      eq(shadowingSessions.organizationId, actorOrganizationId(actor)),
      actor.role === "agent" ? and(eq(shadowingSessions.agentProfileId, actor.id), eq(shadowingSessions.publishedToAgent, true)) : undefined,
      actor.role === "manager" ? inArray(shadowingSessions.teamIdSnapshot, actor.teamIds) : undefined,
      actor.role === "manager" && currentManagerAgentIds ? inArray(shadowingSessions.agentProfileId, currentManagerAgentIds) : undefined,
    ))
    .orderBy(asc(shadowingSessions.scheduledDate), asc(shadowingSessions.id))
    .limit(500);
  const today = dateKeyInTimeZone(new Date(), timeZone);
  return rows.map((row) => ({
    ...row,
    displayStatus: shadowingDisplayStatus({ status: row.status, scheduledDate: row.scheduledDate, today }),
    internalNotes: actor.role === "agent" ? null : row.internalNotes,
  }));
}

export async function createManualFlagCase(actor: Actor, input: {
  agentProfileId: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  internalNotes?: string;
  requiredAction?: string;
  actionDueDate?: string | null;
  relatedCoachingSessionId?: string | null;
  publishToAgent: boolean;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(actor, actor.role === "admin" ? "flags.view_company" : "flags.raise_team_case");
  const agent = await currentAgentContext(actor, input.agentProfileId);
  const id = newId();
  await getDb().transaction(async (tx) => {
    if (input.relatedCoachingSessionId) {
      const [relatedSession] = await tx
        .select({ id: coachingSessions.id })
        .from(coachingSessions)
        .innerJoin(
          coachingSessionParticipants,
          and(
            eq(coachingSessionParticipants.sessionId, coachingSessions.id),
            eq(coachingSessionParticipants.agentProfileId, agent.agentProfileId),
          ),
        )
        .where(
          and(
            eq(coachingSessions.id, input.relatedCoachingSessionId),
            eq(coachingSessions.organizationId, actorOrganizationId(actor)),
          ),
        )
        .limit(1);
      if (!relatedSession) throw new Error("Forbidden");
    }
    await tx.insert(manualFlagCases).values({
      id, organizationId: actorOrganizationId(actor), agentProfileId: agent.agentProfileId,
      teamIdSnapshot: agent.teamId, raisedById: actor.id, assignedOwnerId: actor.id,
      category: requiredText(input.category, "Category"), severity: input.severity,
      reason: requiredText(input.reason, "Reason"), internalNotes: input.internalNotes?.trim() || null,
      requiredAction: input.requiredAction?.trim() || null, actionDueDate: input.actionDueDate || null,
      relatedCoachingSessionId: input.relatedCoachingSessionId || null,
      publishedToAgent: input.publishToAgent, status: "open",
    });
    await tx.insert(manualFlagCaseEvents).values({
      id: newId(), caseId: id, actorProfileId: actor.id, eventType: "created",
      metadata: { status: "open", severity: input.severity },
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "manual_flag.created",
      entityType: "manual_flag_case", entityId: id,
      metadata: { agentProfileId: agent.agentProfileId, teamId: agent.teamId },
    });
  });
  return id;
}

export async function updateManualFlagCase(actor: Actor, input: {
  caseId: string;
  status: ManualFlagStatus;
  assignedOwnerId?: string | null;
  resolution?: string;
  publishToAgent?: boolean;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(actor, actor.role === "admin" ? "flags.view_company" : "flags.update_team_case");
  await getDb().transaction(async (tx) => {
    const [flagCase] = await tx.select().from(manualFlagCases)
      .where(and(eq(manualFlagCases.id, input.caseId), eq(manualFlagCases.organizationId, actorOrganizationId(actor))))
      .limit(1).for("update");
    if (!flagCase) throw new Error("Manual flag case was not found.");
    await currentAgentContext(actor, flagCase.agentProfileId);
    if (input.assignedOwnerId !== undefined && input.assignedOwnerId !== null) {
      if (actor.role === "manager" && input.assignedOwnerId !== actor.id) {
        throw new Error("Forbidden");
      }
      const [owner] = await tx.select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(and(
          eq(profiles.id, input.assignedOwnerId),
          eq(profiles.organizationId, actorOrganizationId(actor)),
          eq(profiles.active, true),
          inArray(profiles.role, ["admin", "manager"]),
        ))
        .limit(1);
      if (!owner) throw new Error("Forbidden");
    }
    assertManualFlagTransition(flagCase.status, input.status);
    const resolutionRequired = input.status === "resolved" || input.status === "dismissed";
    const resolution = resolutionRequired ? requiredText(input.resolution ?? "", "Resolution") : input.resolution?.trim() || null;
    const now = new Date();
    await tx.update(manualFlagCases).set({
      status: input.status,
      assignedOwnerId: input.assignedOwnerId === undefined ? flagCase.assignedOwnerId : input.assignedOwnerId,
      resolution,
      publishedToAgent: input.publishToAgent ?? flagCase.publishedToAgent,
      resolvedById: resolutionRequired ? actor.id : null,
      resolvedAt: resolutionRequired ? now : null,
    }).where(eq(manualFlagCases.id, input.caseId));
    await tx.insert(manualFlagCaseEvents).values({
      id: newId(), caseId: input.caseId, actorProfileId: actor.id, eventType: "status_changed",
      metadata: { from: flagCase.status, to: input.status, assignedOwnerId: input.assignedOwnerId },
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "manual_flag.updated",
      entityType: "manual_flag_case", entityId: input.caseId,
      metadata: { from: flagCase.status, to: input.status },
    });
  });
}

export async function listManualFlagCases(actor: Actor) {
  return listManualFlagCasesForCurrentActor(await resolveCurrentActor(actor));
}

export async function listManualFlagCasesForCurrentActor(actor: CurrentActor) {
  if (actor.role === "manager" && actor.teamIds.length === 0) return [];
  const currentManagerAgentIds = actor.role === "manager"
    ? (await listScopedActiveAgents(actor)).map((agent) => agent.id)
    : null;
  if (actor.role === "manager" && currentManagerAgentIds?.length === 0) return [];
  const rows = await getDb()
    .select({
      id: manualFlagCases.id,
      agentProfileId: manualFlagCases.agentProfileId,
      agentName: profiles.name,
      teamId: manualFlagCases.teamIdSnapshot,
      raisedById: manualFlagCases.raisedById,
      category: manualFlagCases.category,
      severity: manualFlagCases.severity,
      reason: manualFlagCases.reason,
      internalNotes: manualFlagCases.internalNotes,
      status: manualFlagCases.status,
      requiredAction: manualFlagCases.requiredAction,
      resolution: manualFlagCases.resolution,
      publishedToAgent: manualFlagCases.publishedToAgent,
      actionDueDate: manualFlagCases.actionDueDate,
      createdAt: manualFlagCases.createdAt,
      resolvedAt: manualFlagCases.resolvedAt,
    })
    .from(manualFlagCases)
    .innerJoin(profiles, eq(profiles.id, manualFlagCases.agentProfileId))
    .where(and(
      eq(manualFlagCases.organizationId, actorOrganizationId(actor)),
      actor.role === "agent" ? and(eq(manualFlagCases.agentProfileId, actor.id), eq(manualFlagCases.publishedToAgent, true)) : undefined,
      actor.role === "manager" ? inArray(manualFlagCases.teamIdSnapshot, actor.teamIds) : undefined,
      actor.role === "manager" && currentManagerAgentIds ? inArray(manualFlagCases.agentProfileId, currentManagerAgentIds) : undefined,
    ))
    .orderBy(desc(manualFlagCases.createdAt), desc(manualFlagCases.id))
    .limit(500);
  return rows.map((row) => ({ ...row, internalNotes: actor.role === "agent" ? null : row.internalNotes }));
}
