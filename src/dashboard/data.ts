import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { type Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";

export type DashboardTotals = {
  calls: number;
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  idleSeconds: number;
  untrackedSeconds: number;
  rowCount: number;
};

export type DashboardMetric = {
  label: string;
  value: string;
  rawValue: number;
};

export type DashboardAgentPerformanceRow = DashboardTotals & {
  profileId: string;
  agentName: string;
  teamName: string;
  accountStatus: "invited" | "active" | "deactivated" | "revoked";
  hasMetrics: boolean;
  isLocalTestAccount: boolean;
  callsPerLoggedInHour: number | null;
  talkPercentage: number | null;
};

export type DashboardHourlyBreakdownRow = Pick<
  DashboardTotals,
  "calls" | "loggedInSeconds" | "talkSeconds" | "rowCount"
> & {
  hour: number;
};

export type DashboardReconciliation = {
  callsMatch: boolean;
  loggedInSecondsMatch: boolean;
  talkSecondsMatch: boolean;
  agentTotals: Pick<
    DashboardTotals,
    "calls" | "loggedInSeconds" | "talkSeconds"
  >;
};

export type DashboardData = {
  metrics: DashboardMetric[];
  totals: DashboardTotals;
  agentRows: DashboardAgentPerformanceRow[];
  hourlyBreakdown: DashboardHourlyBreakdownRow[];
  dataFreshness: {
    latestMetricDate: string | null;
    latestMetricUpdatedAt: Date | null;
  };
  reconciliation: DashboardReconciliation;
};

type DashboardScope = {
  actor: Actor;
  metricWhere?: SQL;
  noDataProfileIds: string[];
};

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  accountStatus: "invited" | "active" | "deactivated" | "revoked";
};

const EMPTY_TOTALS: DashboardTotals = {
  calls: 0,
  loggedInSeconds: 0,
  readySeconds: 0,
  talkSeconds: 0,
  ringingSeconds: 0,
  wrapSeconds: 0,
  pausedSeconds: 0,
  idleSeconds: 0,
  untrackedSeconds: 0,
  rowCount: 0,
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function normalizeTotals(row?: Partial<Record<keyof DashboardTotals, unknown>>) {
  if (!row) return { ...EMPTY_TOTALS };

  return {
    calls: toNumber(row.calls),
    loggedInSeconds: toNumber(row.loggedInSeconds),
    readySeconds: toNumber(row.readySeconds),
    talkSeconds: toNumber(row.talkSeconds),
    ringingSeconds: toNumber(row.ringingSeconds),
    wrapSeconds: toNumber(row.wrapSeconds),
    pausedSeconds: toNumber(row.pausedSeconds),
    idleSeconds: toNumber(row.idleSeconds),
    untrackedSeconds: toNumber(row.untrackedSeconds),
    rowCount: toNumber(row.rowCount),
  } satisfies DashboardTotals;
}

function secondsToDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

function formatTotals(row: DashboardTotals) {
  return [
    { label: "Calls", value: String(row.calls), rawValue: row.calls },
    {
      label: "Logged-in time",
      value: secondsToDuration(row.loggedInSeconds),
      rawValue: row.loggedInSeconds,
    },
    {
      label: "Ready time",
      value: secondsToDuration(row.readySeconds),
      rawValue: row.readySeconds,
    },
    {
      label: "Talk time",
      value: secondsToDuration(row.talkSeconds),
      rawValue: row.talkSeconds,
    },
    {
      label: "Ringing time",
      value: secondsToDuration(row.ringingSeconds),
      rawValue: row.ringingSeconds,
    },
    {
      label: "Wrap time",
      value: secondsToDuration(row.wrapSeconds),
      rawValue: row.wrapSeconds,
    },
    {
      label: "Paused time",
      value: secondsToDuration(row.pausedSeconds),
      rawValue: row.pausedSeconds,
    },
    {
      label: "Idle time",
      value: secondsToDuration(row.idleSeconds),
      rawValue: row.idleSeconds,
    },
    {
      label: "Untracked time",
      value: secondsToDuration(row.untrackedSeconds),
      rawValue: row.untrackedSeconds,
    },
  ] satisfies DashboardMetric[];
}

function rateMetrics(totals: DashboardTotals) {
  const loggedInHours = totals.loggedInSeconds / 3600;

  return {
    callsPerLoggedInHour:
      loggedInHours > 0 ? totals.calls / loggedInHours : null,
    talkPercentage:
      totals.loggedInSeconds > 0
        ? (totals.talkSeconds / totals.loggedInSeconds) * 100
        : null,
  };
}

function localTestAccount(profile: ProfileRow) {
  const email = profile.email.toLowerCase();
  const name = profile.name.toLowerCase();

  return (
    email.endsWith("@example.test") ||
    email.endsWith(".test") ||
    name.includes("local csv") ||
    name.startsWith("import agent ")
  );
}

function metricScopeMatchesNoRows() {
  return sql`false`;
}

async function currentManagerAgentProfileIds(actor: Actor) {
  if (actor.role !== "manager" || actor.teamIds.length === 0) return [];

  const rows = await getDb()
    .selectDistinct({ profileId: teamMemberships.profileId })
    .from(teamMemberships)
    .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        inArray(teamMemberships.teamId, actor.teamIds),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
        eq(teams.active, true),
        eq(profiles.role, "agent"),
      ),
    );

  return rows.map((row) => row.profileId);
}

export async function buildDashboardScope(actor: Actor) {
  if (actor.role === "admin") {
    return {
      actor,
      metricWhere: undefined,
      noDataProfileIds: [],
    } satisfies DashboardScope;
  }

  if (actor.role === "agent") {
    return {
      actor,
      metricWhere: eq(dialerAgentHourlyMetrics.agentProfileId, actor.id),
      noDataProfileIds: [actor.id],
    } satisfies DashboardScope;
  }

  if (actor.teamIds.length === 0) {
    return {
      actor,
      metricWhere: metricScopeMatchesNoRows(),
      noDataProfileIds: [],
    } satisfies DashboardScope;
  }

  const noDataProfileIds = await currentManagerAgentProfileIds(actor);
  const snapshotScope = inArray(
    dialerAgentHourlyMetrics.teamIdSnapshot,
    actor.teamIds,
  );
  const currentMembershipFallback =
    noDataProfileIds.length > 0
      ? and(
          isNull(dialerAgentHourlyMetrics.teamIdSnapshot),
          inArray(dialerAgentHourlyMetrics.agentProfileId, noDataProfileIds),
        )
      : undefined;

  return {
    actor,
    metricWhere: currentMembershipFallback
      ? or(snapshotScope, currentMembershipFallback)
      : snapshotScope,
    noDataProfileIds,
  } satisfies DashboardScope;
}

async function getDashboardTotals(scope: DashboardScope) {
  const rows = await getDb()
    .select({
      calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
      loggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      ringingSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.ringingSeconds}), 0)`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
      idleSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.idleSeconds}), 0)`,
      untrackedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.untrackedSeconds}), 0)`,
      rowCount: sql<number>`count(*)`,
    })
    .from(dialerAgentHourlyMetrics)
    .where(scope.metricWhere);

  return normalizeTotals(rows[0]);
}

async function getMetricAggregates(scope: DashboardScope) {
  const rows = await getDb()
    .select({
      profileId: dialerAgentHourlyMetrics.agentProfileId,
      teamName: sql<string | null>`group_concat(distinct nullif(${dialerAgentHourlyMetrics.teamNameSnapshot}, '') order by ${dialerAgentHourlyMetrics.teamNameSnapshot} separator ', ')`,
      calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
      loggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      ringingSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.ringingSeconds}), 0)`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
      idleSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.idleSeconds}), 0)`,
      untrackedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.untrackedSeconds}), 0)`,
      rowCount: sql<number>`count(*)`,
    })
    .from(dialerAgentHourlyMetrics)
    .where(scope.metricWhere)
    .groupBy(dialerAgentHourlyMetrics.agentProfileId)
    .orderBy(desc(sql`sum(${dialerAgentHourlyMetrics.calls})`));

  return rows.map((row) => ({
    profileId: row.profileId,
    teamName: row.teamName,
    totals: normalizeTotals(row),
  }));
}

async function getProfilesById(profileIds: string[]) {
  if (profileIds.length === 0) return [];

  return getDb()
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      accountStatus: profiles.accountStatus,
    })
    .from(profiles)
    .where(inArray(profiles.id, profileIds));
}

async function getAllAgentProfiles() {
  return getDb()
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      accountStatus: profiles.accountStatus,
    })
    .from(profiles)
    .where(eq(profiles.role, "agent"));
}

async function getCurrentTeamNames(profileIds: string[]) {
  const teamNames = new Map<string, string[]>();

  if (profileIds.length === 0) return teamNames;

  const rows = await getDb()
    .select({
      profileId: teamMemberships.profileId,
      teamName: teams.name,
    })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        inArray(teamMemberships.profileId, profileIds),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
        eq(teams.active, true),
      ),
    )
    .orderBy(asc(teams.name));

  for (const row of rows) {
    const current = teamNames.get(row.profileId) ?? [];
    current.push(row.teamName);
    teamNames.set(row.profileId, current);
  }

  return teamNames;
}

async function getProfilesForDashboard(
  scope: DashboardScope,
  metricProfileIds: string[],
  showAgentsWithNoData: boolean,
) {
  const profilesById = new Map<string, ProfileRow>();
  const addProfiles = (rows: ProfileRow[]) => {
    for (const row of rows) profilesById.set(row.id, row);
  };

  addProfiles(await getProfilesById(metricProfileIds));

  if (!showAgentsWithNoData) {
    return Array.from(profilesById.values());
  }

  if (scope.actor.role === "admin") {
    addProfiles(await getAllAgentProfiles());
  } else {
    addProfiles(await getProfilesById(scope.noDataProfileIds));
  }

  return Array.from(profilesById.values());
}

async function getAgentPerformanceRows(
  scope: DashboardScope,
  showAgentsWithNoData: boolean,
) {
  const metricAggregates = await getMetricAggregates(scope);
  const aggregateByProfile = new Map(
    metricAggregates.map((row) => [row.profileId, row]),
  );
  const profilesForDashboard = await getProfilesForDashboard(
    scope,
    metricAggregates.map((row) => row.profileId),
    showAgentsWithNoData,
  );
  const currentTeamNames = await getCurrentTeamNames(
    profilesForDashboard.map((profile) => profile.id),
  );
  const rows = profilesForDashboard.map((profile) => {
    const aggregate = aggregateByProfile.get(profile.id);
    const totals = aggregate?.totals ?? { ...EMPTY_TOTALS };
    const rates = rateMetrics(totals);

    return {
      ...totals,
      ...rates,
      profileId: profile.id,
      agentName: profile.name,
      teamName:
        aggregate?.teamName ??
        currentTeamNames.get(profile.id)?.join(", ") ??
        "No team",
      accountStatus: profile.accountStatus,
      hasMetrics: Boolean(aggregate),
      isLocalTestAccount: localTestAccount(profile),
    } satisfies DashboardAgentPerformanceRow;
  });

  return rows.sort((left, right) => {
    if (left.hasMetrics !== right.hasMetrics) return left.hasMetrics ? -1 : 1;
    if (left.calls !== right.calls) return right.calls - left.calls;
    return left.agentName.localeCompare(right.agentName);
  });
}

async function getHourlyBreakdown(scope: DashboardScope) {
  const rows = await getDb()
    .select({
      hour: dialerAgentHourlyMetrics.metricHour,
      calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
      loggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      rowCount: sql<number>`count(*)`,
    })
    .from(dialerAgentHourlyMetrics)
    .where(scope.metricWhere)
    .groupBy(dialerAgentHourlyMetrics.metricHour)
    .orderBy(asc(dialerAgentHourlyMetrics.metricHour));

  return rows.map((row) => ({
    hour: row.hour,
    calls: toNumber(row.calls),
    loggedInSeconds: toNumber(row.loggedInSeconds),
    talkSeconds: toNumber(row.talkSeconds),
    rowCount: toNumber(row.rowCount),
  })) satisfies DashboardHourlyBreakdownRow[];
}

async function getDataFreshness(scope: DashboardScope) {
  const rows = await getDb()
    .select({
      latestMetricDate: sql<string | null>`max(${dialerAgentHourlyMetrics.metricDate})`,
      latestMetricUpdatedAt: sql<Date | null>`max(${dialerAgentHourlyMetrics.updatedAt})`,
    })
    .from(dialerAgentHourlyMetrics)
    .where(scope.metricWhere);

  return {
    latestMetricDate: rows[0]?.latestMetricDate
      ? String(rows[0].latestMetricDate)
      : null,
    latestMetricUpdatedAt: rows[0]?.latestMetricUpdatedAt ?? null,
  };
}

function reconcileAgentRows(
  totals: DashboardTotals,
  agentRows: DashboardAgentPerformanceRow[],
) {
  const agentTotals = agentRows.reduce(
    (acc, row) => ({
      calls: acc.calls + row.calls,
      loggedInSeconds: acc.loggedInSeconds + row.loggedInSeconds,
      talkSeconds: acc.talkSeconds + row.talkSeconds,
    }),
    { calls: 0, loggedInSeconds: 0, talkSeconds: 0 },
  );

  return {
    callsMatch: agentTotals.calls === totals.calls,
    loggedInSecondsMatch:
      agentTotals.loggedInSeconds === totals.loggedInSeconds,
    talkSecondsMatch: agentTotals.talkSeconds === totals.talkSeconds,
    agentTotals,
  } satisfies DashboardReconciliation;
}

export async function getDashboardData(
  actor: Actor,
  options: { showAgentsWithNoData?: boolean } = {},
) {
  const scope = await buildDashboardScope(actor);
  const [totals, agentRows, hourlyBreakdown, dataFreshness] =
    await Promise.all([
      getDashboardTotals(scope),
      getAgentPerformanceRows(scope, options.showAgentsWithNoData ?? false),
      getHourlyBreakdown(scope),
      getDataFreshness(scope),
    ]);

  return {
    metrics: formatTotals(totals),
    totals,
    agentRows,
    hourlyBreakdown,
    dataFreshness,
    reconciliation: reconcileAgentRows(totals, agentRows),
  } satisfies DashboardData;
}
