import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertFlagsViewAccess } from "@/auth/feature-access";
import {
  listOrganizationActiveManagers,
  listScopedActiveAgents,
  uniqueScopedTeams,
  type ScopedAgent,
} from "@/agents/scope";
import type { DashboardDateWindow } from "@/dashboard/date-range";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  profiles,
} from "@/db/schema";
import {
  calculatePerformanceFlags,
  buildTransferFlagRows,
  PAUSE_MINUTES_PER_NET_HOUR_LIMIT,
  splitTransferFlagWeeks,
  WRAP_MINUTES_PER_TALK_HOUR_LIMIT,
  type TransferFlagClassification,
} from "@/flags/domain";
import {
  canViewAggregateFlagSummary,
  enforceFlagRequestScope,
} from "@/flags/authorization";
import {
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type FlagFilters = {
  dateRange: DashboardDateWindow;
  teamId?: string;
  managerId?: string;
  profileId?: string;
  query?: string;
};

async function resolveFlagRoster(actor: Actor, filters: FlagFilters) {
  const [scopedAgents, managers] = await Promise.all([
    listScopedActiveAgents(actor),
    actor.role === "agent"
      ? Promise.resolve([])
      : listOrganizationActiveManagers(actor),
  ]);
  const teams = uniqueScopedTeams(scopedAgents);
  const validTeam =
    actor.role === "agent" ||
    !filters.teamId ||
    teams.some((team) => team.id === filters.teamId);
  const validManager =
    actor.role === "agent" ||
    !filters.managerId ||
    (actor.role === "manager"
      ? filters.managerId === actor.id
      : managers.some((manager) => manager.id === filters.managerId));
  const query = filters.query?.trim().toLocaleLowerCase("en-US") ?? "";
  const agents = scopedAgents.filter((agent) => {
    if (!validTeam || !validManager) return false;
    if (actor.role === "agent") return agent.id === actor.id;
    if (filters.teamId && !agent.teams.some((team) => team.id === filters.teamId)) {
      return false;
    }
    if (filters.managerId && !agent.managerIds.includes(filters.managerId)) {
      return false;
    }
    if (filters.profileId && agent.id !== filters.profileId) return false;
    return !query || agent.name.toLocaleLowerCase("en-US").includes(query);
  });

  return {
    agents,
    teams: actor.role === "agent" ? [] : teams,
    managers,
  };
}

function responseRoster(actor: Actor, roster: Awaited<ReturnType<typeof resolveFlagRoster>>) {
  return actor.role === "agent"
    ? { agents: [], teams: [], managers: [] }
    : roster;
}

export async function getPerformanceFlagsData(
  actor: Actor,
  filters: FlagFilters & {
    wrap?: "flagged" | "all";
    pause?: "flagged" | "all";
    flaggedOnly?: boolean;
  },
) {
  await assertFlagsViewAccess(actor);
  const safeFilters = enforceFlagRequestScope(actor, filters);
  const roster = await resolveFlagRoster(actor, safeFilters);
  const agentIds = roster.agents.map((agent) => agent.id);
  const metricRows =
    agentIds.length === 0
      ? []
      : await getDb()
          .select({
            agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
            talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
            wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
            readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
            pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
          })
          .from(dialerAgentHourlyMetrics)
          .innerJoin(
            dialerDatasetScopes,
            eq(
              dialerDatasetScopes.activeVersionId,
              dialerAgentHourlyMetrics.versionId,
            ),
          )
          .innerJoin(profiles, eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId))
          .where(
            and(
              inArray(dialerAgentHourlyMetrics.agentProfileId, agentIds),
              safeFilters.dateRange.from
                ? gte(
                    dialerAgentHourlyMetrics.metricDate,
                    safeFilters.dateRange.from,
                  )
                : undefined,
              safeFilters.dateRange.to
                ? lte(
                    dialerAgentHourlyMetrics.metricDate,
                    safeFilters.dateRange.to,
                  )
                : undefined,
              activeProfileWhere(actorOrganizationId(actor)),
              eq(profiles.role, "agent"),
            ),
          )
          .groupBy(dialerAgentHourlyMetrics.agentProfileId);
  const metricsByAgent = new Map(
    metricRows.map((row) => [
      row.agentProfileId,
      {
        talkSeconds: Number(row.talkSeconds),
        wrapSeconds: Number(row.wrapSeconds),
        readySeconds: Number(row.readySeconds),
        pausedSeconds: Number(row.pausedSeconds),
      },
    ]),
  );
  const rows = roster.agents
    .map((agent) => {
      const metrics = metricsByAgent.get(agent.id) ?? {
        talkSeconds: 0,
        wrapSeconds: 0,
        readySeconds: 0,
        pausedSeconds: 0,
      };
      const result = calculatePerformanceFlags(metrics);
      return {
        agentId: agent.id,
        agentName: agent.name,
        teamNames: agent.teams.map((team) => team.name),
        dateRange: safeFilters.dateRange,
        ...metrics,
        ...result,
        wrapThreshold: WRAP_MINUTES_PER_TALK_HOUR_LIMIT,
        pauseThreshold: PAUSE_MINUTES_PER_NET_HOUR_LIMIT,
        status:
          result.triggeredFlags.length === 2
            ? "Both flags"
            : result.triggeredFlags.length === 1
              ? "Flagged"
              : "No active flags",
      };
    })
    .filter((row) => {
      if (safeFilters.wrap === "flagged" && !row.wrapFlag) return false;
      if (safeFilters.pause === "flagged" && !row.pauseFlag) return false;
      return row.triggeredFlags.length > 0;
    });
  const summary =
    !canViewAggregateFlagSummary(actor)
      ? null
      : {
          scopedAgents: roster.agents.length,
          flaggedAgents: rows.filter((row) => row.triggeredFlags.length > 0).length,
          wrapFlags: rows.filter((row) => row.wrapFlag).length,
          pauseFlags: rows.filter((row) => row.pauseFlag).length,
        };

  return {
    rows,
    summary,
    ...responseRoster(actor, roster),
    filters: safeFilters,
  };
}

export async function getTransferFlagsData(
  actor: Actor,
  filters: FlagFilters & {
    classification?: TransferFlagClassification;
  },
) {
  await assertFlagsViewAccess(actor);
  const safeFilters = enforceFlagRequestScope(actor, filters);
  const roster = await resolveFlagRoster(actor, safeFilters);
  const config = transferSheetConfigFromEnv();
  let source:
    | { status: "ready"; message: null; timeZone: string }
    | { status: "unavailable"; message: string; timeZone: string | null };
  const matchedDeals: Array<{ agentId: string; date: string }> = [];

  if (!config) {
    source = {
      status: "unavailable",
      message: "The Closed worksheet source is not configured.",
      timeZone: null,
    };
  } else {
    try {
      const ingestion = await ingestAndMatchLeaderboardSources(
        roster.agents.flatMap((agent) =>
          matchableAgent(agent) ? [matchableAgent(agent)!] : [],
        ),
        config,
      );
      if (ingestion.status === "ready") {
        const allowedAgentIds = new Set(roster.agents.map((agent) => agent.id));
        for (const deal of ingestion.closedRecords) {
          if (
            deal.matchStatus !== "matched" ||
            !deal.matchedUserId ||
            !deal.timestamp ||
            !allowedAgentIds.has(deal.matchedUserId)
          ) {
            continue;
          }
          const date = dateKeyInTimeZone(deal.timestamp, ingestion.timeZone);
          matchedDeals.push({ agentId: deal.matchedUserId, date });
        }
        source = { status: "ready", message: null, timeZone: ingestion.timeZone };
      } else {
        source = {
          status: "unavailable",
          message: ingestion.message,
          timeZone: config.timeZone,
        };
      }
    } catch {
      source = {
        status: "unavailable",
        message: "The Closed worksheet source could not be loaded.",
        timeZone: config.timeZone,
      };
    }
  }

  const today = dateKeyInTimeZone(
    new Date(),
    source.timeZone ?? config?.timeZone ?? "Africa/Cairo",
  );
  const weeks = splitTransferFlagWeeks({
    dateRange: safeFilters.dateRange,
    availableDealDates: matchedDeals.map((deal) => deal.date),
    today,
  });

  const rows = source.status === "ready"
    ? buildTransferFlagRows({
        agents: roster.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          teamNames: agent.teams.map((team) => team.name),
        })),
        deals: matchedDeals,
        weeks,
      })
        .filter(
          (row) =>
            !safeFilters.classification ||
            row.classification === safeFilters.classification,
        )
        .map((row) => ({ ...row, sourceStatus: source.status }))
    : [];
  const summary =
    !canViewAggregateFlagSummary(actor) || source.status !== "ready"
      ? null
      : {
          scopedAgents: roster.agents.length,
          strongFlags: rows.filter((row) => row.classification === "strong").length,
          improvementFlags: rows.filter(
            (row) => row.classification === "improvement",
          ).length,
        };

  return {
    rows,
    summary,
    source,
    ...responseRoster(actor, roster),
    filters: safeFilters,
  };
}

function matchableAgent(agent: ScopedAgent) {
  if (!agent.americanName) return null;
  return {
    id: agent.id,
    realName: agent.name,
    americanName: agent.americanName,
    teamId: agent.teams[0]?.id ?? null,
    teamName: agent.teams[0]?.name ?? null,
  };
}
