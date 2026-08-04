import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { assertCoachingViewAccess } from "@/auth/feature-access";
import {
  listOrganizationActiveManagers,
  listScopedActiveAgents,
  uniqueScopedTeams,
} from "@/agents/scope";
import {
  closedDealImprovement,
  overallImprovement,
  pauseEfficiencyImprovement,
  unavailableImprovementComponent,
  wrapEfficiencyImprovement,
} from "@/coaching/domain";
import {
  calendarDayDifference,
  coachingMeasurementWindows,
  isPostCoachingWindowComplete,
  type WeekWindow,
} from "@/coaching/week";
import { getDb } from "@/db";
import {
  coachingSessionParticipants,
  coachingSessions,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  profiles,
} from "@/db/schema";
import { getEnv } from "@/env";
import {
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

type MetricTotals = {
  talkSeconds: number;
  wrapSeconds: number;
  readySeconds: number;
  pausedSeconds: number;
};

const EMPTY_METRICS: MetricTotals = {
  talkSeconds: 0,
  wrapSeconds: 0,
  readySeconds: 0,
  pausedSeconds: 0,
};

export async function getCoachingImprovementData(
  actor: Actor,
  input: {
    week: WeekWindow;
    teamId?: string;
    managerId?: string;
    now?: Date;
  },
) {
  await assertCoachingViewAccess(actor);
  const [scopedAgents, managers] = await Promise.all([
    listScopedActiveAgents(actor),
    listOrganizationActiveManagers(actor),
  ]);
  const teams = uniqueScopedTeams(scopedAgents);
  const validTeam = !input.teamId || teams.some((team) => team.id === input.teamId);
  const validManager =
    !input.managerId ||
    (actor.role === "manager"
      ? input.managerId === actor.id
      : managers.some((manager) => manager.id === input.managerId));
  const agents = scopedAgents.filter(
    (agent) =>
      validTeam &&
      validManager &&
      (!input.teamId || agent.teams.some((team) => team.id === input.teamId)) &&
      (!input.managerId || agent.managerIds.includes(input.managerId)),
  );
  const agentIds = agents.map((agent) => agent.id);
  const sessionRows =
    agentIds.length === 0
      ? []
      : await getDb()
          .select({
            sessionId: coachingSessions.id,
            sessionDate: coachingSessions.sessionDate,
            category: coachingSessions.category,
            createdAt: coachingSessions.createdAt,
            coachProfileId: coachingSessions.coachProfileId,
            agentProfileId: coachingSessionParticipants.agentProfileId,
          })
          .from(coachingSessionParticipants)
          .innerJoin(
            coachingSessions,
            eq(coachingSessions.id, coachingSessionParticipants.sessionId),
          )
          .where(
            and(
              eq(coachingSessions.organizationId, actorOrganizationId(actor)),
              inArray(coachingSessionParticipants.agentProfileId, agentIds),
            ),
          )
          .orderBy(
            desc(coachingSessions.sessionDate),
            desc(coachingSessions.createdAt),
            desc(coachingSessions.id),
          );
  const latestByAgent = new Map<string, (typeof sessionRows)[number]>();
  const coachedThisWeek = new Set<string>();
  for (const row of sessionRows) {
    const sessionDate = String(row.sessionDate);
    if (sessionDate >= input.week.start && sessionDate <= input.week.end) {
      coachedThisWeek.add(row.agentProfileId);
    }
    if (!latestByAgent.has(row.agentProfileId)) {
      latestByAgent.set(row.agentProfileId, row);
    }
  }

  const today = dateKeyInTimeZone(
    input.now ?? new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const managerNames = new Map(managers.map((manager) => [manager.id, manager.name]));
  const overdue = agents
    .filter((agent) => !coachedThisWeek.has(agent.id))
    .map((agent) => {
      const last = latestByAgent.get(agent.id);
      return {
        agentId: agent.id,
        agentName: agent.name,
        teamNames: agent.teams.map((team) => team.name),
        managerNames: agent.managerIds.flatMap((id) => {
          const name = managerNames.get(id);
          return name ? [name] : [];
        }),
        lastCoachingDate: last ? String(last.sessionDate) : null,
        daysSinceLastCoaching: last
          ? calendarDayDifference(today, String(last.sessionDate))
          : null,
        currentWeekStatus: "Overdue" as const,
        lastCategory: last?.category ?? null,
      };
    });

  const latestSessions = Array.from(latestByAgent.values());
  const windows = latestSessions.map((session) => ({
    agentId: session.agentProfileId,
    ...coachingMeasurementWindows(String(session.sessionDate)),
  }));
  const earliestMetricDate = windows
    .map((window) => window.before.start)
    .sort()[0];
  const latestMetricDate = windows
    .map((window) => window.after.end)
    .sort()
    .at(-1);
  const metricRows =
    latestSessions.length === 0 || !earliestMetricDate || !latestMetricDate
      ? []
      : await getDb()
          .select({
            agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
            metricDate: dialerAgentHourlyMetrics.metricDate,
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
              inArray(
                dialerAgentHourlyMetrics.agentProfileId,
                latestSessions.map((session) => session.agentProfileId),
              ),
              gte(dialerAgentHourlyMetrics.metricDate, earliestMetricDate),
              lte(dialerAgentHourlyMetrics.metricDate, latestMetricDate),
              activeProfileWhere(actorOrganizationId(actor)),
              eq(profiles.role, "agent"),
            ),
          )
          .groupBy(
            dialerAgentHourlyMetrics.agentProfileId,
            dialerAgentHourlyMetrics.metricDate,
          )
          .orderBy(
            asc(dialerAgentHourlyMetrics.agentProfileId),
            asc(dialerAgentHourlyMetrics.metricDate),
          );

  const metricByAgentAndDate = new Map(
    metricRows.map((row) => [
      `${row.agentProfileId}:${String(row.metricDate)}`,
      {
        talkSeconds: Number(row.talkSeconds),
        wrapSeconds: Number(row.wrapSeconds),
        readySeconds: Number(row.readySeconds),
        pausedSeconds: Number(row.pausedSeconds),
      },
    ]),
  );
  const config = transferSheetConfigFromEnv();
  let closedSourceAvailable = false;
  let closedSourceMessage: string | null = null;
  let closedDeals: Array<{
    matchedUserId: string | null;
    matchStatus: string;
    timestamp: Date | null;
  }> = [];
  if (!config) {
    closedSourceMessage = "The Closed worksheet source is not configured.";
  } else {
    try {
      const ingestion = await ingestAndMatchLeaderboardSources(
        agents.flatMap((agent) =>
          agent.americanName
            ? [
                {
                  id: agent.id,
                  realName: agent.name,
                  americanName: agent.americanName,
                  teamId: agent.teams[0]?.id ?? null,
                  teamName: agent.teams[0]?.name ?? null,
                },
              ]
            : [],
        ),
        config,
      );
      if (ingestion.status === "ready") {
        closedSourceAvailable = true;
        closedDeals = ingestion.closedRecords;
      } else {
        closedSourceMessage = ingestion.message;
      }
    } catch {
      closedSourceMessage = "The Closed worksheet source could not be loaded.";
    }
  }

  const aggregateMetrics = (agentId: string, start: string, end: string) => {
    const totals = { ...EMPTY_METRICS };
    for (let date = start; date <= end; ) {
      const row = metricByAgentAndDate.get(`${agentId}:${date}`);
      if (row) {
        totals.talkSeconds += row.talkSeconds;
        totals.wrapSeconds += row.wrapSeconds;
        totals.readySeconds += row.readySeconds;
        totals.pausedSeconds += row.pausedSeconds;
      }
      const next = new Date(`${date}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
    }
    return totals;
  };
  const countDeals = (agentId: string, start: string, end: string) =>
    closedDeals.filter((deal) => {
      if (
        deal.matchStatus !== "matched" ||
        deal.matchedUserId !== agentId ||
        !deal.timestamp
      ) {
        return false;
      }
      const date = dateKeyInTimeZone(deal.timestamp, config?.timeZone ?? getEnv().GOOGLE_SHEETS_TIMEZONE);
      return date >= start && date <= end;
    }).length;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const improvement = latestSessions.map((session) => {
    const agent = agentById.get(session.agentProfileId);
    const sessionDate = String(session.sessionDate);
    const measurement = coachingMeasurementWindows(sessionDate);
    const beforeMetrics = aggregateMetrics(
      session.agentProfileId,
      measurement.before.start,
      measurement.before.end,
    );
    const afterMetrics = aggregateMetrics(
      session.agentProfileId,
      measurement.after.start,
      measurement.after.end,
    );
    const closedComponent = closedSourceAvailable
      ? closedDealImprovement(
          countDeals(
            session.agentProfileId,
            measurement.before.start,
            measurement.before.end,
          ),
          countDeals(
            session.agentProfileId,
            measurement.after.start,
            measurement.after.end,
          ),
        )
      : unavailableImprovementComponent();
    const wrapComponent = wrapEfficiencyImprovement(beforeMetrics, afterMetrics);
    const pauseComponent = pauseEfficiencyImprovement(beforeMetrics, afterMetrics);
    const overall = overallImprovement({
      components: [closedComponent, wrapComponent, pauseComponent],
      postPeriodComplete: isPostCoachingWindowComplete(
        sessionDate,
        input.now,
        config?.timeZone ?? getEnv().GOOGLE_SHEETS_TIMEZONE,
      ),
      sourceAvailable: closedSourceAvailable,
    });
    return {
      agentId: session.agentProfileId,
      agentName: agent?.name ?? "Unknown agent",
      teamNames: agent?.teams.map((team) => team.name) ?? [],
      coachName:
        session.coachProfileId === actor.id && actor.role === "admin"
          ? "Administrator"
          : managerNames.get(session.coachProfileId) ?? "Coach",
      sessionDate,
      category: session.category,
      beforeWindow: measurement.before,
      afterWindow: measurement.after,
      components: {
        closedDeals: closedComponent,
        wrapEfficiency: wrapComponent,
        pauseEfficiency: pauseComponent,
      },
      overall,
    };
  });

  return {
    overdue,
    improvement,
    teams,
    managers,
    filters: input,
    closedSource: {
      status: closedSourceAvailable ? ("ready" as const) : ("unavailable" as const),
      message: closedSourceMessage,
    },
  };
}
