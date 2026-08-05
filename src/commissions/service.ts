import "server-only";

import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import {
  assertCommissionsExportAccess,
  assertCommissionsViewAccess,
} from "@/auth/feature-access";
import { assertCommissionTeamFilter } from "@/commissions/authorization";
import { resolveCommissionMonth, type CommissionMonth } from "@/commissions/month";
import {
  buildCommissionReport,
  type CommissionEmployee,
  type ReadyCommissionReport,
} from "@/commissions/report";
import { getDb } from "@/db";
import {
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { getEnv } from "@/env";
import {
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";

export type CommissionReport =
  | ReadyCommissionReport
  | {
      status: "source_unavailable";
      month: CommissionMonth;
      message: string;
    };

export type CommissionReportOptions = {
  commissionMonth?: string;
  teamId?: string;
  purpose?: "view" | "export";
  now?: Date;
};

function actorScopeWhere(actor: Actor) {
  if (actor.role === "agent") return eq(profiles.id, actor.id);
  if (actor.role === "manager") {
    return actor.teamIds.length > 0
      ? inArray(teamMemberships.teamId, actor.teamIds)
      : eq(profiles.id, "__empty_manager_scope__");
  }
  return undefined;
}

async function listVisibleTeams(actor: Actor) {
  const rows = await getDb()
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(
      and(
        visibleTeamWhere(actor),
        actor.role === "manager" && actor.teamIds.length > 0
          ? inArray(teams.id, actor.teamIds)
          : actor.role === "manager"
            ? eq(teams.id, "__empty_manager_scope__")
            : undefined,
      ),
    )
    .orderBy(asc(teams.name), asc(teams.id));
  return rows;
}

async function resolveCommissionRoster(actor: Actor, month: CommissionMonth) {
  const organizationId = actorOrganizationId(actor);
  const [profileRows, teamRows] = await Promise.all([
    getDb()
      .select({
        id: profiles.id,
        realName: profiles.name,
        email: profiles.email,
        active: profiles.active,
        accountStatus: profiles.accountStatus,
        americanName: sourceUserMappings.sourceAgentName,
        currentTeamId: teams.id,
        currentTeamName: teams.name,
      })
      .from(profiles)
      .leftJoin(
        sourceUserMappings,
        and(
          eq(sourceUserMappings.profileId, profiles.id),
          eq(sourceUserMappings.source, "dialer"),
          eq(sourceUserMappings.active, true),
          eq(sourceUserMappings.isPrimary, true),
        ),
      )
      .leftJoin(
        teamMemberships,
        and(
          eq(teamMemberships.profileId, profiles.id),
          eq(teamMemberships.role, "agent"),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
        ),
      )
      .leftJoin(teams, and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)))
      .where(
        and(
          eq(profiles.organizationId, organizationId),
          eq(profiles.role, "agent"),
          ne(profiles.accountStatus, "deleted"),
          isNull(profiles.deletedAt),
          actorScopeWhere(actor),
        ),
      )
      .orderBy(asc(profiles.name), asc(profiles.id)),
    listVisibleTeams(actor),
  ]);

  const profilesById = new Map<string, (typeof profileRows)[number]>();
  for (const row of profileRows) {
    if (!profilesById.has(row.id)) profilesById.set(row.id, row);
  }
  const profileIds = Array.from(profilesById.keys());
  const historicalRows = profileIds.length === 0
    ? []
    : await getDb()
        .select({
          profileId: teamMemberships.profileId,
          teamId: teams.id,
          teamName: teams.name,
          startedAt: teamMemberships.startedAt,
        })
        .from(teamMemberships)
        .innerJoin(
          teams,
          and(
            eq(teams.id, teamMemberships.teamId),
            eq(teams.organizationId, organizationId),
          ),
        )
        .where(
          and(
            inArray(teamMemberships.profileId, profileIds),
            eq(teamMemberships.role, "agent"),
            lt(teamMemberships.startedAt, month.end),
            or(isNull(teamMemberships.endedAt), gt(teamMemberships.endedAt, month.start)),
          ),
        )
        .orderBy(asc(teamMemberships.startedAt));

  const historicalTeamByProfile = new Map<
    string,
    { id: string; name: string; startedAt: Date }
  >();
  for (const row of historicalRows) {
    const existing = historicalTeamByProfile.get(row.profileId);
    if (!existing || row.startedAt >= existing.startedAt) {
      historicalTeamByProfile.set(row.profileId, {
        id: row.teamId,
        name: row.teamName,
        startedAt: row.startedAt,
      });
    }
  }

  const employees: CommissionEmployee[] = Array.from(profilesById.values()).map((row) => {
    const historical = historicalTeamByProfile.get(row.id);
    const historicalAllowed =
      actor.role !== "manager" ||
      (historical ? actor.teamIds.includes(historical.id) : false);
    const selectedTeam = historical && historicalAllowed
      ? { id: historical.id, name: historical.name }
      : row.currentTeamId && row.currentTeamName
        ? { id: row.currentTeamId, name: row.currentTeamName }
        : null;
    return {
      id: row.id,
      realName: row.realName,
      americanName: row.americanName,
      email: row.email,
      active: row.active && row.accountStatus === "active",
      team: selectedTeam,
    };
  });

  return { employees, teams: teamRows };
}

export async function getCommissionReport(
  actor: Actor,
  options: CommissionReportOptions = {},
): Promise<CommissionReport> {
  if (options.purpose === "export") await assertCommissionsExportAccess(actor);
  else await assertCommissionsViewAccess(actor);

  assertCommissionTeamFilter(actor, options.teamId);

  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const month = resolveCommissionMonth(options.commissionMonth, options.now, timeZone);
  const roster = await resolveCommissionRoster(actor, month);
  if (options.teamId && !roster.teams.some((team) => team.id === options.teamId)) {
    throw new Error("Forbidden");
  }

  const config = transferSheetConfigFromEnv();
  if (!config) {
    return {
      status: "source_unavailable",
      month,
      message: "The Closed worksheet source is not configured.",
    };
  }

  try {
    const ingestion = await ingestAndMatchLeaderboardSources(
      roster.employees.flatMap((employee) =>
        employee.americanName
          ? [{
              id: employee.id,
              realName: employee.realName,
              americanName: employee.americanName,
              teamId: employee.team?.id ?? null,
              teamName: employee.team?.name ?? null,
            }]
          : [],
      ),
      config,
    );
    if (ingestion.status !== "ready") {
      return { status: "source_unavailable", month, message: ingestion.message };
    }
    return buildCommissionReport({
      role: actor.role,
      month,
      timeZone: ingestion.timeZone,
      employees: roster.employees,
      deals: ingestion.closedRecords,
      teams: roster.teams,
      selectedTeamId: options.teamId,
      stale: ingestion.stale,
    });
  } catch {
    return {
      status: "source_unavailable",
      month,
      message: "The Closed worksheet source could not be loaded.",
    };
  }
}
