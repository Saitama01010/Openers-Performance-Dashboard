import { and, count, countDistinct, eq, inArray, isNull } from "drizzle-orm";

import { stableObjectDigest } from "@/admin/remediation-confirmation";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetVersions,
  dialerImportRows,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export type TeamCleanupMembership = {
  membershipId: string;
  profileId: string;
  role: "admin" | "manager" | "agent";
  active: boolean;
  startedAt: Date;
  endedAt: Date | null;
};

export type TeamCleanupSummary = {
  teamId: string;
  teamName: string;
  organizationId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  historicalMemberships: number;
  activeMemberships: number;
  managerAssignments: number;
  imports: number;
  metrics: number;
  importRows: number;
  reports: number;
  auditActorIds: string[];
  auditActions: string[];
  memberships: TeamCleanupMembership[];
};

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function inspectWith(
  db: ReturnType<typeof getDb> | DatabaseTransaction,
  organizationId: string,
  teamIds: string[],
) {
  const sortedTeamIds = [...new Set(teamIds.map((id) => id.toLowerCase()))].sort();
  const teamRows = await db
    .select()
    .from(teams)
    .where(and(
      eq(teams.organizationId, organizationId),
      inArray(teams.id, sortedTeamIds),
    ))
    .orderBy(teams.id);

  const summaries: TeamCleanupSummary[] = [];
  for (const team of teamRows) {
    const [membershipRows, managers, imports, metrics, importRows, audits] =
      await Promise.all([
        db.select({
          membershipId: teamMemberships.id,
          profileId: teamMemberships.profileId,
          role: teamMemberships.role,
          active: teamMemberships.active,
          startedAt: teamMemberships.startedAt,
          endedAt: teamMemberships.endedAt,
        }).from(teamMemberships)
          .where(eq(teamMemberships.teamId, team.id))
          .orderBy(teamMemberships.id),
        db.select({ total: countDistinct(teamMemberships.profileId) })
          .from(teamMemberships)
          .where(and(
            eq(teamMemberships.teamId, team.id),
            eq(teamMemberships.role, "manager"),
          )),
        db.select({ total: countDistinct(dialerDatasetVersions.importBatchId) })
          .from(dialerDatasetVersions)
          .where(eq(dialerDatasetVersions.teamId, team.id)),
        db.select({ total: count() })
          .from(dialerAgentHourlyMetrics)
          .where(eq(dialerAgentHourlyMetrics.teamIdSnapshot, team.id)),
        db.select({ total: count() })
          .from(dialerImportRows)
          .where(eq(dialerImportRows.teamIdSnapshot, team.id)),
        db.select({
          actorId: auditLogs.actorProfileId,
          action: auditLogs.action,
        }).from(auditLogs)
          .where(and(
            eq(auditLogs.entityType, "team"),
            eq(auditLogs.entityId, team.id),
          ))
          .orderBy(auditLogs.createdAt, auditLogs.id),
      ]);

    summaries.push({
      teamId: team.id,
      teamName: team.name,
      organizationId: team.organizationId,
      active: team.active,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
      archivedAt: team.archivedAt,
      deletedAt: team.deletedAt,
      historicalMemberships: membershipRows.length,
      activeMemberships: membershipRows.filter(
        (membership) => membership.active && membership.endedAt === null,
      ).length,
      managerAssignments: Number(managers[0]?.total ?? 0),
      imports: Number(imports[0]?.total ?? 0),
      metrics: Number(metrics[0]?.total ?? 0),
      importRows: Number(importRows[0]?.total ?? 0),
      reports: 0,
      auditActorIds: Array.from(new Set(audits.flatMap(
        (audit) => audit.actorId ? [audit.actorId] : [],
      ))).sort(),
      auditActions: Array.from(new Set(audits.map((audit) => audit.action))).sort(),
      memberships: membershipRows,
    });
  }

  return summaries;
}

export function teamCleanupDigest(summaries: readonly TeamCleanupSummary[]) {
  return stableObjectDigest(
    [...summaries]
      .sort((left, right) => left.teamId.localeCompare(right.teamId))
      .map((team) => ({
        teamId: team.teamId,
        organizationId: team.organizationId,
        active: team.active,
        archivedAt: team.archivedAt?.toISOString() ?? null,
        deletedAt: team.deletedAt?.toISOString() ?? null,
        historicalMemberships: team.historicalMemberships,
        activeMemberships: team.activeMemberships,
        managerAssignments: team.managerAssignments,
        imports: team.imports,
        metrics: team.metrics,
        importRows: team.importRows,
        memberships: team.memberships.map((membership) => ({
          membershipId: membership.membershipId,
          profileId: membership.profileId,
          role: membership.role,
          active: membership.active,
          endedAt: membership.endedAt?.toISOString() ?? null,
        })),
      })),
  );
}

export function teamCleanupConfirmation(input: {
  organizationId: string;
  expectedCount: number;
  expectedDigest: string;
}) {
  return `ARCHIVE_TEAMS:${input.organizationId}:${input.expectedCount}:${input.expectedDigest}`;
}

export async function inspectTeamCleanup(input: {
  organizationId: string;
  teamIds: string[];
}) {
  return inspectWith(getDb(), input.organizationId, input.teamIds);
}

export async function archiveTeamsForCleanup(input: {
  actorId: string;
  confirmation: string;
  expectedCount: number;
  expectedDigest: string;
  organizationId: string;
  teamIds: string[];
}) {
  const sortedTeamIds = [...new Set(input.teamIds.map((id) => id.toLowerCase()))].sort();
  const expectedConfirmation = teamCleanupConfirmation(input);
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Confirmation must exactly equal ${expectedConfirmation}`);
  }
  if (sortedTeamIds.length !== input.expectedCount) {
    throw new Error("The supplied team-ID count does not match the approval.");
  }

  return getDb().transaction(async (tx) => {
    const actorRows = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(
        eq(profiles.id, input.actorId),
        eq(profiles.organizationId, input.organizationId),
        eq(profiles.role, "admin"),
        eq(profiles.accountStatus, "active"),
        eq(profiles.active, true),
      ))
      .limit(1)
      .for("update");
    if (!actorRows[0]) throw new Error("An active administrator is required.");

    const before = await inspectWith(tx, input.organizationId, sortedTeamIds);
    if (before.length !== sortedTeamIds.length) {
      throw new Error("One or more explicitly supplied team IDs were not found.");
    }
    if (teamCleanupDigest(before) !== input.expectedDigest) {
      throw new Error(
        "The team cleanup target set or dependency counts changed after dry run; run the dry run again.",
      );
    }

    const now = new Date();
    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: now })
      .where(and(
        inArray(teamMemberships.teamId, sortedTeamIds),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ));
    await tx
      .update(teams)
      .set({ active: false, deactivatedAt: now, archivedAt: now })
      .where(and(
        eq(teams.organizationId, input.organizationId),
        inArray(teams.id, sortedTeamIds),
      ));
    await tx.insert(auditLogs).values(
      before.map((team) => ({
        id: newId(),
        actorProfileId: input.actorId,
        action: "team.cleanup_archived",
        entityType: "team",
        entityId: team.teamId,
        metadata: {
          historicalMemberships: team.historicalMemberships,
          activeMembershipsEnded: team.activeMemberships,
          managerAssignments: team.managerAssignments,
          importsRetained: team.imports,
          metricsRetained: team.metrics,
          importRowsRetained: team.importRows,
          cleanupDigest: input.expectedDigest,
        },
      })),
    );

    return { archivedAt: now, teams: before };
  });
}
