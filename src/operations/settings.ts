import "server-only";

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor, type CurrentActor } from "@/auth/current-actor";
import { assertPermission } from "@/auth/permissions";
import { validateRubricSections, type RubricSection } from "@/coaching/rubric";
import { getDb } from "@/db";
import {
  auditLogs,
  coachingRubricTemplates,
  employmentStatusEvents,
  performanceTargets,
  profiles,
  sessions,
  teamMemberships,
  teams,
  tenureThresholds,
} from "@/db/schema";
import type { TargetMetric } from "@/dashboard/target-evaluation";
import { newId } from "@/lib/ids";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";

function nonNegative(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative.`);
  return value.toFixed(2);
}

function dateRange(effectiveFrom: string, effectiveTo?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error("A valid effective date is required.");
  if (effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || effectiveTo < effectiveFrom)) {
    throw new Error("The target end date must not precede its start date.");
  }
}

async function assertAdminTeam(actor: Actor, teamId?: string | null) {
  if (!teamId) return;
  const rows = await getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), visibleTeamWhere(actor)))
    .limit(1);
  if (!rows[0]) throw new Error("Team was not found.");
}

export async function createPerformanceTarget(actor: Actor, input: {
  teamId?: string | null;
  metric: TargetMetric;
  targetValue: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role !== "admin") throw new Error("Forbidden");
  await assertPermission(actor, "targets.manage");
  await assertAdminTeam(actor, input.teamId);
  dateRange(input.effectiveFrom, input.effectiveTo);
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0) {
    throw new Error("Target value must be greater than zero.");
  }
  const id = newId();
  await getDb().transaction(async (tx) => {
    await tx.insert(performanceTargets).values({
      id,
      organizationId: actorOrganizationId(actor),
      teamId: input.teamId || null,
      metric: input.metric,
      targetValue: input.targetValue.toFixed(2),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "performance_target.created",
      entityType: "performance_target", entityId: id,
      metadata: { teamId: input.teamId || null, metric: input.metric, effectiveFrom: input.effectiveFrom },
    });
  });
  return id;
}

export async function createTenureThreshold(actor: Actor, input: {
  teamId?: string | null;
  bandLabel: string;
  minimumDays: number;
  maximumDays?: number | null;
  isRamp: boolean;
  minimumTransfers?: number | null;
  minimumClosedDeals?: number | null;
  minimumConversion?: number | null;
  minimumShiftCoverage?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role !== "admin") throw new Error("Forbidden");
  await assertPermission(actor, "targets.manage");
  await assertAdminTeam(actor, input.teamId);
  dateRange(input.effectiveFrom, input.effectiveTo);
  const bandLabel = input.bandLabel.trim();
  if (!bandLabel) throw new Error("Tenure band label is required.");
  if (!Number.isSafeInteger(input.minimumDays) || input.minimumDays < 0) throw new Error("Minimum tenure days are invalid.");
  if (input.maximumDays !== null && input.maximumDays !== undefined && (!Number.isSafeInteger(input.maximumDays) || input.maximumDays < input.minimumDays)) {
    throw new Error("Maximum tenure days are invalid.");
  }
  const id = newId();
  await getDb().transaction(async (tx) => {
    await tx.insert(tenureThresholds).values({
      id,
      organizationId: actorOrganizationId(actor),
      teamId: input.teamId || null,
      bandLabel,
      minimumDays: input.minimumDays,
      maximumDays: input.maximumDays ?? null,
      isRamp: input.isRamp,
      minimumTransfers: nonNegative(input.minimumTransfers, "Minimum transfers"),
      minimumClosedDeals: nonNegative(input.minimumClosedDeals, "Minimum closed deals"),
      minimumConversion: nonNegative(input.minimumConversion, "Minimum conversion"),
      minimumShiftCoverage: nonNegative(input.minimumShiftCoverage, "Minimum shift coverage"),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "tenure_threshold.created",
      entityType: "tenure_threshold", entityId: id,
      metadata: { teamId: input.teamId || null, bandLabel, effectiveFrom: input.effectiveFrom },
    });
  });
  return id;
}

export async function createRubricTemplate(actor: Actor, input: {
  name: string;
  description?: string;
  sections: RubricSection[];
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role !== "admin") throw new Error("Forbidden");
  await assertPermission(actor, "rubrics.manage");
  validateRubricSections(input.sections);
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required.");
  const [latest] = await getDb()
    .select({ version: coachingRubricTemplates.version })
    .from(coachingRubricTemplates)
    .where(and(eq(coachingRubricTemplates.organizationId, actorOrganizationId(actor)), eq(coachingRubricTemplates.name, name)))
    .orderBy(desc(coachingRubricTemplates.version))
    .limit(1);
  const id = newId();
  const version = (latest?.version ?? 0) + 1;
  await getDb().transaction(async (tx) => {
    await tx.insert(coachingRubricTemplates).values({
      id, organizationId: actorOrganizationId(actor), name,
      description: input.description?.trim() || null, version, active: true,
      sections: input.sections, createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "coaching_rubric_template.created",
      entityType: "coaching_rubric_template", entityId: id, metadata: { name, version },
    });
  });
  return id;
}

export async function updateEmploymentStartDate(actor: Actor, input: {
  profileId: string;
  employmentStartDate: string;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role !== "admin") throw new Error("Forbidden");
  await assertPermission(actor, "targets.manage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.employmentStartDate)) throw new Error("A valid employment start date is required.");
  await getDb().transaction(async (tx) => {
    const [profile] = await tx.select({ id: profiles.id, previous: profiles.employmentStartDate })
      .from(profiles)
      .where(and(eq(profiles.id, input.profileId), eq(profiles.organizationId, actorOrganizationId(actor)), eq(profiles.role, "agent")))
      .limit(1).for("update");
    if (!profile) throw new Error("Agent was not found.");
    await tx.update(profiles).set({ employmentStartDate: input.employmentStartDate }).where(eq(profiles.id, input.profileId));
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: "employment.start_date_updated",
      entityType: "profile", entityId: input.profileId,
      metadata: { before: profile.previous, after: input.employmentStartDate },
    });
  });
}

export async function listPerformanceConfiguration(actor: Actor) {
  return listPerformanceConfigurationForCurrentActor(await resolveCurrentActor(actor));
}

export async function listPerformanceConfigurationForCurrentActor(actor: CurrentActor) {
  const organizationId = actorOrganizationId(actor);
  const teamCondition =
    actor.role === "manager"
      ? actor.teamIds.length > 0
        ? or(isNull(performanceTargets.teamId), inArray(performanceTargets.teamId, actor.teamIds))
        : isNull(performanceTargets.teamId)
      : undefined;
  const thresholdTeamCondition =
    actor.role === "manager"
      ? actor.teamIds.length > 0
        ? or(isNull(tenureThresholds.teamId), inArray(tenureThresholds.teamId, actor.teamIds))
        : isNull(tenureThresholds.teamId)
      : undefined;
  const [targetRows, thresholdRows, templates] = await Promise.all([
    getDb().select().from(performanceTargets)
      .where(and(eq(performanceTargets.organizationId, organizationId), teamCondition))
      .orderBy(desc(performanceTargets.effectiveFrom)),
    getDb().select().from(tenureThresholds)
      .where(and(eq(tenureThresholds.organizationId, organizationId), thresholdTeamCondition))
      .orderBy(asc(tenureThresholds.minimumDays)),
    getDb().select().from(coachingRubricTemplates)
      .where(and(eq(coachingRubricTemplates.organizationId, organizationId), eq(coachingRubricTemplates.active, true)))
      .orderBy(asc(coachingRubricTemplates.name), desc(coachingRubricTemplates.version)),
  ]);
  return {
    targets: targetRows.map((row) => ({ ...row, targetValue: Number(row.targetValue) })),
    thresholds: thresholdRows.map((row) => ({
      ...row,
      minimumTransfers: row.minimumTransfers === null ? null : Number(row.minimumTransfers),
      minimumClosedDeals: row.minimumClosedDeals === null ? null : Number(row.minimumClosedDeals),
      minimumConversion: row.minimumConversion === null ? null : Number(row.minimumConversion),
      minimumShiftCoverage: row.minimumShiftCoverage === null ? null : Number(row.minimumShiftCoverage),
    })),
    templates,
  };
}

export async function recordEmploymentStatus(actor: Actor, input: {
  profileId: string;
  status: "active" | "deactivated" | "terminated";
  reason: string;
  employmentEndDate?: string | null;
}) {
  actor = await resolveCurrentActor(actor);
  if (actor.role === "agent") throw new Error("Forbidden");
  if (actor.role === "manager" && input.status === "active") {
    throw new Error("Forbidden");
  }
  if (actor.role === "manager") {
    await assertPermission(
      actor,
      input.status === "terminated"
        ? "users.terminate_team_agent"
        : "users.deactivate_team_agent",
    );
  }
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required.");
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [profile] = await tx.select({
      id: profiles.id,
      role: profiles.role,
      employmentStatus: profiles.employmentStatus,
    })
      .from(profiles).where(and(eq(profiles.id, input.profileId), eq(profiles.organizationId, actorOrganizationId(actor))))
      .limit(1).for("update");
    if (!profile || profile.role !== "agent") throw new Error("Only agents can receive this employment action.");
    if (profile.employmentStatus === input.status) {
      throw new Error(`Employment is already ${input.status}.`);
    }
    if (profile.employmentStatus === "terminated") {
      throw new Error("Terminated employment cannot transition to another status.");
    }
    if (actor.role === "manager") {
      if (actor.teamIds.length === 0) throw new Error("Forbidden");
      const membership = await tx.select({ teamId: teamMemberships.teamId }).from(teamMemberships)
        .innerJoin(teams, and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)))
        .where(and(
          eq(teamMemberships.profileId, input.profileId),
          eq(teamMemberships.role, "agent"),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
          inArray(teamMemberships.teamId, actor.teamIds),
        )).limit(1).for("update");
      if (!membership[0]) throw new Error("Forbidden");
    } else if (actor.role !== "admin") throw new Error("Forbidden");
    await tx.update(profiles).set({
      employmentStatus: input.status,
      employmentEndDate: input.status === "terminated" ? input.employmentEndDate || now.toISOString().slice(0, 10) : null,
      active: input.status === "active",
      accountStatus: input.status === "active" ? "active" : "deactivated",
    }).where(eq(profiles.id, input.profileId));
    if (input.status !== "active") {
      await tx.update(sessions).set({ revokedAt: now }).where(
        and(eq(sessions.profileId, input.profileId), isNull(sessions.revokedAt)),
      );
    }
    await tx.insert(employmentStatusEvents).values({
      id: newId(), organizationId: actorOrganizationId(actor), profileId: input.profileId,
      status: input.status, effectiveAt: now, reason, createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(), actorProfileId: actor.id, action: `employment.${input.status}`,
      entityType: "profile", entityId: input.profileId, metadata: { reason },
    });
  });
}
