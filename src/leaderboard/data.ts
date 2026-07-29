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
import type {
  MatchableUser,
  MatchedTransfer,
} from "@/leaderboard/matching";
import {
  rankLeaderboardRows,
  type LeaderboardRow,
} from "@/leaderboard/ranking";
import {
  ingestAndMatchTransfers,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import {
  normalizeAmericanName,
  TransferSheetConfigurationError,
} from "@/sheets/transfers";

export type LeaderboardFilters = {
  query?: string;
  teamId?: string;
  from?: string;
  to?: string;
};

type LeaderboardBase = {
  teams: { id: string; name: string }[];
  filters: LeaderboardFilters;
};

export type LeaderboardData =
  | (LeaderboardBase & {
      status: "unconfigured";
      message: string;
      rows: [];
    })
  | (LeaderboardBase & {
      status: "ready";
      rows: LeaderboardRow[];
      sourceRecordCount: number;
      diagnosticCount: number;
    })
  | (LeaderboardBase & {
      status: "source_error";
      message: string;
      rows: [];
    });

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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function transferMatchesFilters(
  match: Extract<MatchedTransfer, { status: "matched" }>,
  filters: LeaderboardFilters,
  timeZone: string,
) {
  if (!match.transfer.occurredAt) return false;
  if (filters.teamId && match.user.teamId !== filters.teamId) return false;

  if (filters.query) {
    const query = normalizeSearchText(filters.query);
    const americanNameQuery = normalizeAmericanName(filters.query);
    if (
      !normalizeSearchText(match.user.realName).includes(query) &&
      !normalizeAmericanName(match.user.americanName).includes(
        americanNameQuery,
      )
    ) {
      return false;
    }
  }

  const transferDate = dateKeyInTimeZone(match.transfer.occurredAt, timeZone);
  if (filters.from && transferDate < filters.from) return false;
  if (filters.to && transferDate > filters.to) return false;
  return true;
}

export function buildTransferLeaderboardRows(
  matches: readonly MatchedTransfer[],
  filters: LeaderboardFilters,
  timeZone: string,
) {
  const counts = new Map<
    string,
    { user: MatchableUser; transferCount: number }
  >();

  for (const match of matches) {
    if (
      match.status !== "matched" ||
      !transferMatchesFilters(match, filters, timeZone)
    ) {
      continue;
    }
    const current = counts.get(match.user.id);
    counts.set(match.user.id, {
      user: match.user,
      transferCount: (current?.transferCount ?? 0) + 1,
    });
  }

  return rankLeaderboardRows(
    Array.from(counts.values()).map(({ user, transferCount }) => ({
      profileId: user.id,
      realName: user.realName,
      americanName: user.americanName,
      teamId: user.teamId,
      teamName: user.teamName,
      transferCount,
    })),
  );
}

export async function getLeaderboardData(
  _actor: Actor,
  filters: LeaderboardFilters,
): Promise<LeaderboardData> {
  const teamRowsPromise = listLeaderboardTeams();
  const config = transferSheetConfigFromEnv();

  if (!config) {
    return {
      status: "unconfigured",
      message:
        "Configure the server-only Google Apps Script URL and LeaderBoard secret to load transfers.",
      rows: [],
      teams: await teamRowsPromise,
      filters,
    };
  }

  const usersPromise = listMatchableUsers();
  const ingestionPromise = ingestAndMatchTransfers(usersPromise, config);
  let ingestion: Awaited<typeof ingestionPromise>;
  try {
    ingestion = await ingestionPromise;
  } catch (error) {
    if (error instanceof TransferSheetConfigurationError) {
      return {
        status: "source_error",
        message: error.message,
        rows: [],
        teams: await teamRowsPromise,
        filters,
      };
    }
    throw error;
  }
  const teamRows = await teamRowsPromise;

  if (ingestion.status === "unconfigured") {
    return {
      status: "unconfigured",
      message: ingestion.message,
      rows: [],
      teams: teamRows,
      filters,
    };
  }

  return {
    status: "ready",
    rows: buildTransferLeaderboardRows(
      ingestion.matches,
      filters,
      ingestion.timeZone,
    ),
    teams: teamRows,
    filters,
    sourceRecordCount: ingestion.records.length,
    diagnosticCount: ingestion.diagnostics.length,
  };
}
