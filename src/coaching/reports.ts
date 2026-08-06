import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertPermission } from "@/auth/permissions";
import {
  calculateRubricPercentage,
  type CriterionScore,
} from "@/coaching/rubric";
import { getDb } from "@/db";
import {
  auditLogs,
  coachingReports,
  coachingReportRevisions,
  coachingRubricTemplates,
  coachingSessionParticipants,
  coachingSessions,
  profiles,
  teamMemberships,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { actorOrganizationId } from "@/teams/visibility";

async function assertCanManageParticipant(
  actor: Actor,
  sessionId: string,
  agentProfileId: string,
) {
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(
    actor,
    actor.role === "admin" ? "coaching.create_company" : "coaching.submit_rubric_team",
  );
  const rows = await getDb()
    .select({ sessionId: coachingSessions.id, teamId: teamMemberships.teamId })
    .from(coachingSessions)
    .innerJoin(
      coachingSessionParticipants,
      and(
        eq(coachingSessionParticipants.sessionId, coachingSessions.id),
        eq(coachingSessionParticipants.agentProfileId, agentProfileId),
      ),
    )
    .innerJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, agentProfileId),
        eq(teamMemberships.role, "agent"),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .where(
      and(
        eq(coachingSessions.id, sessionId),
        eq(coachingSessions.organizationId, actorOrganizationId(actor)),
        actor.role === "manager"
          ? actor.teamIds.length > 0
            ? inArray(teamMemberships.teamId, actor.teamIds)
            : eq(teamMemberships.id, "__empty_manager_scope__")
          : undefined,
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
}

export async function saveCoachingReport(actor: Actor, input: {
  reportId?: string;
  coachingSessionId: string;
  agentProfileId: string;
  templateId: string;
  criterionScores: CriterionScore[];
  strengths?: string;
  improvementAreas?: string;
  actionItems?: string[];
  followUpDate?: string | null;
}) {
  await assertCanManageParticipant(actor, input.coachingSessionId, input.agentProfileId);
  const [template] = await getDb()
    .select()
    .from(coachingRubricTemplates)
    .where(
      and(
        eq(coachingRubricTemplates.id, input.templateId),
        eq(coachingRubricTemplates.organizationId, actorOrganizationId(actor)),
        eq(coachingRubricTemplates.active, true),
      ),
    )
    .limit(1);
  if (!template) throw new Error("Rubric template was not found.");
  const overallScore = calculateRubricPercentage(template.sections, input.criterionScores);
  const reportId = input.reportId || newId();
  await getDb().transaction(async (tx) => {
    const [existing] = input.reportId
      ? await tx.select().from(coachingReports).where(eq(coachingReports.id, input.reportId)).limit(1).for("update")
      : [];
    if (existing) {
      if (existing.organizationId !== actorOrganizationId(actor) || existing.agentProfileId !== input.agentProfileId) throw new Error("Forbidden");
      if (existing.status !== "draft") throw new Error("Finalized coaching reports require a new revision.");
      await tx.insert(coachingReportRevisions).values({
        id: newId(), reportId: existing.id, revision: existing.revision,
        snapshot: {
          criterionScores: existing.criterionScores,
          strengths: existing.strengths,
          improvementAreas: existing.improvementAreas,
          actionItems: existing.actionItems,
          followUpDate: existing.followUpDate,
          overallScore: existing.overallScore,
          status: existing.status,
        },
        createdById: actor.id,
      });
      await tx.update(coachingReports).set({
        templateId: template.id,
        templateVersion: template.version,
        criterionScores: input.criterionScores,
        strengths: input.strengths?.trim() || null,
        improvementAreas: input.improvementAreas?.trim() || null,
        actionItems: input.actionItems?.map((item) => item.trim()).filter(Boolean) ?? [],
        followUpDate: input.followUpDate || null,
        overallScore: overallScore.toFixed(2),
        revision: existing.revision + 1,
      }).where(eq(coachingReports.id, existing.id));
    } else {
      await tx.insert(coachingReports).values({
        id: reportId,
        organizationId: actorOrganizationId(actor),
        coachingSessionId: input.coachingSessionId,
        agentProfileId: input.agentProfileId,
        coachProfileId: actor.id,
        templateId: template.id,
        templateVersion: template.version,
        criterionScores: input.criterionScores,
        strengths: input.strengths?.trim() || null,
        improvementAreas: input.improvementAreas?.trim() || null,
        actionItems: input.actionItems?.map((item) => item.trim()).filter(Boolean) ?? [],
        followUpDate: input.followUpDate || null,
        overallScore: overallScore.toFixed(2),
        status: "draft",
      });
    }
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: existing ? "coaching_report.revised" : "coaching_report.created",
      entityType: "coaching_report", entityId: reportId,
      metadata: { overallScore, agentProfileId: input.agentProfileId },
    });
  });
  return reportId;
}

async function transitionReport(
  actor: Actor,
  reportId: string,
  target: "finalized" | "published",
) {
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(actor, actor.role === "admin" ? "coaching.create_company" : "coaching.publish_team");
  await getDb().transaction(async (tx) => {
    const [report] = await tx.select().from(coachingReports)
      .where(and(eq(coachingReports.id, reportId), eq(coachingReports.organizationId, actorOrganizationId(actor))))
      .limit(1).for("update");
    if (!report) throw new Error("Report was not found.");
    await assertCanManageParticipant(actor, report.coachingSessionId, report.agentProfileId);
    if (target === "finalized" && report.status !== "draft") throw new Error("Only draft reports can be finalized.");
    if (target === "published" && report.status !== "finalized") throw new Error("Only finalized reports can be published.");
    const now = new Date();
    await tx.update(coachingReports).set(
      target === "finalized"
        ? { status: "finalized", finalizedById: actor.id, finalizedAt: now }
        : { status: "published", publishedById: actor.id, publishedAt: now },
    ).where(eq(coachingReports.id, reportId));
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: `coaching_report.${target}`,
      entityType: "coaching_report", entityId: reportId,
    });
  });
}

export function finalizeCoachingReport(actor: Actor, reportId: string) {
  return transitionReport(actor, reportId, "finalized");
}

export function publishCoachingReport(actor: Actor, reportId: string) {
  return transitionReport(actor, reportId, "published");
}

export async function acknowledgeCoachingReport(actor: Actor, reportId: string) {
  if (actor.role !== "agent") throw new Error("Forbidden");
  await getDb().transaction(async (tx) => {
    const [report] = await tx.select({ id: coachingReports.id, status: coachingReports.status })
      .from(coachingReports)
      .where(and(
        eq(coachingReports.id, reportId),
        eq(coachingReports.organizationId, actorOrganizationId(actor)),
        eq(coachingReports.agentProfileId, actor.id),
      )).limit(1).for("update");
    if (!report || report.status !== "published") throw new Error("Published report was not found.");
    await tx.update(coachingReports).set({ status: "acknowledged", acknowledgedAt: new Date() }).where(eq(coachingReports.id, reportId));
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "coaching_report.acknowledged",
      entityType: "coaching_report", entityId: reportId,
    });
  });
}

export async function listCoachingReports(actor: Actor) {
  const conditions = [eq(coachingReports.organizationId, actorOrganizationId(actor))];
  if (actor.role === "agent") {
    conditions.push(eq(coachingReports.agentProfileId, actor.id));
    conditions.push(inArray(coachingReports.status, ["published", "acknowledged"]));
  } else if (actor.role === "manager") {
    if (actor.teamIds.length === 0) return [];
    conditions.push(inArray(teamMemberships.teamId, actor.teamIds));
  }
  const rows = await getDb()
    .select({
      id: coachingReports.id,
      coachingSessionId: coachingReports.coachingSessionId,
      agentProfileId: coachingReports.agentProfileId,
      agentName: profiles.name,
      coachProfileId: coachingReports.coachProfileId,
      status: coachingReports.status,
      overallScore: coachingReports.overallScore,
      strengths: coachingReports.strengths,
      improvementAreas: coachingReports.improvementAreas,
      actionItems: coachingReports.actionItems,
      followUpDate: coachingReports.followUpDate,
      publishedAt: coachingReports.publishedAt,
      acknowledgedAt: coachingReports.acknowledgedAt,
      sessionDate: coachingSessions.sessionDate,
    })
    .from(coachingReports)
    .innerJoin(profiles, eq(profiles.id, coachingReports.agentProfileId))
    .innerJoin(coachingSessions, eq(coachingSessions.id, coachingReports.coachingSessionId))
    .leftJoin(
      teamMemberships,
      and(
        eq(teamMemberships.profileId, coachingReports.agentProfileId),
        eq(teamMemberships.role, "agent"),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(coachingSessions.sessionDate), desc(coachingReports.updatedAt));
  const coachIds = Array.from(new Set(rows.map((row) => row.coachProfileId)));
  const coachRows = coachIds.length
    ? await getDb()
        .select({ id: profiles.id, name: profiles.name })
        .from(profiles)
        .where(and(
          inArray(profiles.id, coachIds),
          eq(profiles.organizationId, actorOrganizationId(actor)),
        ))
    : [];
  const coachNames = new Map(coachRows.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    ...row,
    coachName: coachNames.get(row.coachProfileId) ?? "Unknown coach",
    overallScore: Number(row.overallScore),
  }));
}
