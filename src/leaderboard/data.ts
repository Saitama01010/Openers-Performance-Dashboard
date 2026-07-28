import "server-only";

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import type { ClosedDealsProvider } from "@/sheets/contracts";
import { UnconfiguredClosedDealsProvider } from "@/sheets/closed-deals";

export type LeaderboardFilters = {
  query?: string;
  teamId?: string;
  from?: string;
  to?: string;
};

export type LeaderboardData =
  | {
      status: "unconfigured";
      message: string;
      rows: [];
      teams: { id: string; name: string }[];
      filters: LeaderboardFilters;
    }
  | {
      status: "ready";
      rows: import("@/leaderboard/ranking").LeaderboardRow[];
      teams: { id: string; name: string }[];
      filters: LeaderboardFilters;
    };

async function listLeaderboardTeams() {
  return getDb()
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.active, true))
    .orderBy(asc(teams.name));
}

export async function listMatchableUsers() {
  const rows = await getDb()
    .select({
      id: profiles.id,
      realName: profiles.name,
      americanName: sourceUserMappings.sourceAgentName,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(profiles)
    .innerJoin(
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
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    )
    .leftJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        ne(profiles.accountStatus, "deleted"),
        eq(profiles.active, true),
      ),
    );

  return rows;
}

export async function getLeaderboardData(
  _actor: Actor,
  filters: LeaderboardFilters,
  closedDealsProvider: ClosedDealsProvider =
    new UnconfiguredClosedDealsProvider(),
): Promise<LeaderboardData> {
  const teamRows = await listLeaderboardTeams();
  if (!closedDealsProvider.configured) {
    return {
      status: "unconfigured",
      message: "Closed-deals data source has not been configured yet.",
      rows: [],
      teams: teamRows,
      filters,
    };
  }

  // The ready branch intentionally remains isolated until the real closed-deal
  // columns and attribution rules are supplied. It must never substitute
  // transfer volume for closed-deal counts.
  await closedDealsProvider.listClosedDeals();
  return { status: "ready", rows: [], teams: teamRows, filters };
}
