import { and, count, countDistinct, eq, inArray, isNull } from "drizzle-orm";

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

export type TeamCleanupSummary = {
  teamId: string;
  teamName: string;
  active: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  dependentUsers: number;
  dependentManagers: number;
  imports: number;
  metrics: number;
  importRows: number;
  reports: number;
};

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function inspectWith(
  db: ReturnType<typeof getDb> | DatabaseTransaction,
  organizationId: string,
  teamIds: string[],
) {
  const teamRows = await db
    .select()
    .from(teams)
    .where(and(
      eq(teams.organizationId, organizationId),
      inArray(teams.id, teamIds),
    ))
    .orderBy(teams.id);

  const summaries: TeamCleanupSummary[] = [];
  for (const team of teamRows) {
    const [users, managers, imports, metrics, importRows] = await Promise.all([
      db
        .select({ total: countDistinct(teamMemberships.profileId) })
        .from(teamMemberships)
        .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
        .where(eq(teamMemberships.teamId, team.id)),
      db
        .select({ total: countDistinct(teamMemberships.profileId) })
        .from(teamMemberships)
        .where(and(
          eq(teamMemberships.teamId, team.id),
          eq(teamMemberships.role, "manager"),
        )),
      db
        .select({ total: countDistinct(dialerDatasetVersions.importBatchId) })
        .from(dialerDatasetVersions)
        .where(eq(dialerDatasetVersions.teamId, team.id)),
      db
        .select({ total: count() })
        .from(dialerAgentHourlyMetrics)
        .where(eq(dialerAgentHourlyMetrics.teamIdSnapshot, team.id)),
      db
        .select({ total: count() })
        .from(dialerImportRows)
        .where(eq(dialerImportRows.teamIdSnapshot, team.id)),
    ]);

    summaries.push({
      teamId: team.id,
      teamName: team.name,
      active: team.active,
      archivedAt: team.archivedAt,
      deletedAt: team.deletedAt,
      dependentUsers: Number(users[0]?.total ?? 0),
      dependentManagers: Number(managers[0]?.total ?? 0),
      imports: Number(imports[0]?.total ?? 0),
      metrics: Number(metrics[0]?.total ?? 0),
      importRows: Number(importRows[0]?.total ?? 0),
      // Reports are computed from retained metrics; there is no report table.
      reports: 0,
    });
  }

  return summaries;
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
  organizationId: string;
  teamIds: string[];
}) {
  const expectedConfirmation = `ARCHIVE:${[...input.teamIds].sort().join(",")}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Confirmation must exactly equal ${expectedConfirmation}`);
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
      ))
      .limit(1)
      .for("update");
    if (!actorRows[0]) throw new Error("An active administrator is required.");

    const before = await inspectWith(tx, input.organizationId, input.teamIds);
    if (before.length !== input.teamIds.length) {
      throw new Error("One or more explicitly supplied team IDs were not found.");
    }

    const now = new Date();
    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: now })
      .where(and(
        inArray(teamMemberships.teamId, input.teamIds),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ));
    await tx
      .update(teams)
      .set({ active: false, deactivatedAt: now, archivedAt: now, deletedAt: now })
      .where(and(
        eq(teams.organizationId, input.organizationId),
        inArray(teams.id, input.teamIds),
      ));
    await tx.insert(auditLogs).values(
      before.map((team) => ({
        id: newId(),
        actorProfileId: input.actorId,
        action: "team.cleanup_archived",
        entityType: "team",
        entityId: team.teamId,
        metadata: {
          teamId: team.teamId,
          dependentUsers: team.dependentUsers,
          dependentManagers: team.dependentManagers,
          imports: team.imports,
          metrics: team.metrics,
          importRows: team.importRows,
          reports: team.reports,
        },
      })),
    );

    return { archivedAt: now, teams: before };
  });
}
