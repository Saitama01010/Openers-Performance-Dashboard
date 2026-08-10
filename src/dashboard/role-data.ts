import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { listScopedActiveAgents, type ScopedAgent } from "@/agents/scope";
import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor, type CurrentActor } from "@/auth/current-actor";
import { assertRoleDashboardViewAccess } from "@/auth/feature-access";
import { getCommissionReport } from "@/commissions/service";
import { getCoachingRoomData } from "@/coaching/data";
import { listCoachingReportsForCurrentActor } from "@/coaching/reports";
import { resolveWeekWindow } from "@/coaching/week";
import { getDashboardData } from "@/dashboard/data";
import { buildCalendarMonthWindows } from "@/dashboard/admin-overview";
import {
  resolveOverviewDateRange,
  type OverviewDateRange,
} from "@/dashboard/date-range";
import {
  evaluateLowPerformance,
  employmentTenureDays,
  resolveTenureThreshold,
} from "@/dashboard/low-performance";
import {
  loadRoleDashboardOutcomeSource,
  outcomeSnapshot,
} from "@/dashboard/outcome-source";
import {
  calculateShiftCoverage,
  lastCompletedShift,
  previousCompletedShift,
} from "@/dashboard/shift-coverage";
import {
  conversionPercentage,
  evaluateTarget,
  resolveEffectiveTarget,
} from "@/dashboard/target-evaluation";
import { getDb } from "@/db";
import {
  coachingSessionParticipants,
  coachingSessions,
  coachingReports as coachingReportRecords,
  dialerAgentHourlyMetrics,
  dialerDatasetVersions,
  dialerDatasetScopes,
  dialerImportBatches,
  dialerImportRows,
  emailDeliveryAttempts,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { calculatePerformanceFlags } from "@/flags/domain";
import { getPerformanceFlagsData, getTransferFlagsData } from "@/flags/data";
import { rankLeaderboardRows } from "@/leaderboard/ranking";
import {
  listManualFlagCasesForCurrentActor,
  listShadowingSessionsForCurrentActor,
} from "@/operations/service";
import {
  listPerformanceConfigurationForCurrentActor,
} from "@/operations/settings";
import { dateKeyInTimeZone } from "@/sheets/timestamp";
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";

type SourceValue = { status: "ready"; value: number } | { status: "unavailable"; value: null };

type TeamCompetitionRow = {
  teamId: string;
  teamName: string;
  rank: number;
  activeAgents: number;
  transfers: SourceValue;
  closedDeals: SourceValue;
  conversion: number | null;
  targetProgress: ReturnType<typeof evaluateTarget>;
  coachingCompletion: number | null;
};

type ShiftDialerRow = {
  agentProfileId: string;
  metricDate: string;
  metricHour: number | null;
  calls: number;
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
};

function organizationActor(actor: Actor): Actor {
  return { ...actor, role: "admin", teamIds: [] };
}

function sourceValue(value: number | undefined, available: boolean): SourceValue {
  return available
    ? { status: "ready", value: value ?? 0 }
    : { status: "unavailable", value: null };
}

async function profileEmployment(agentIds: string[]) {
  if (agentIds.length === 0) return new Map<string, { start: string | null; end: string | null; status: string }>();
  const rows = await getDb().select({
    id: profiles.id,
    start: profiles.employmentStartDate,
    end: profiles.employmentEndDate,
    status: profiles.employmentStatus,
  }).from(profiles).where(inArray(profiles.id, agentIds));
  return new Map(rows.map((row) => [row.id, row]));
}

async function shiftDialerRows(actor: Actor, agentIds: string[], shift: ReturnType<typeof lastCompletedShift>) {
  if (agentIds.length === 0) return [];
  return getDb()
    .select({
      agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
      metricDate: dialerAgentHourlyMetrics.metricDate,
      metricHour: dialerAgentHourlyMetrics.metricHour,
      calls: dialerAgentHourlyMetrics.calls,
      loggedInSeconds: dialerAgentHourlyMetrics.loggedInSeconds,
      readySeconds: dialerAgentHourlyMetrics.readySeconds,
      talkSeconds: dialerAgentHourlyMetrics.talkSeconds,
      wrapSeconds: dialerAgentHourlyMetrics.wrapSeconds,
      pausedSeconds: dialerAgentHourlyMetrics.pausedSeconds,
    })
    .from(dialerAgentHourlyMetrics)
    .innerJoin(dialerDatasetScopes, eq(dialerDatasetScopes.activeVersionId, dialerAgentHourlyMetrics.versionId))
    .innerJoin(profiles, eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId))
    .where(and(
      inArray(dialerAgentHourlyMetrics.agentProfileId, agentIds),
      eq(dialerAgentHourlyMetrics.granularity, "hourly"),
      eq(profiles.organizationId, actorOrganizationId(actor)),
      or(
        and(eq(dialerAgentHourlyMetrics.metricDate, shift.startDate), gte(dialerAgentHourlyMetrics.metricHour, shift.startHour)),
        and(eq(dialerAgentHourlyMetrics.metricDate, shift.endDate), lt(dialerAgentHourlyMetrics.metricHour, shift.endHourExclusive)),
      ),
    ));
}

function sumShiftRows(rows: readonly ShiftDialerRow[]) {
  return rows.reduce(
    (total, row) => ({
      calls: total.calls + row.calls,
      loggedInSeconds: total.loggedInSeconds + row.loggedInSeconds,
      readySeconds: total.readySeconds + row.readySeconds,
      talkSeconds: total.talkSeconds + row.talkSeconds,
      wrapSeconds: total.wrapSeconds + row.wrapSeconds,
      pausedSeconds: total.pausedSeconds + row.pausedSeconds,
    }),
    { calls: 0, loggedInSeconds: 0, readySeconds: 0, talkSeconds: 0, wrapSeconds: 0, pausedSeconds: 0 },
  );
}

function rankedRows(
  agents: readonly ScopedAgent[],
  snapshot: ReturnType<typeof outcomeSnapshot>,
) {
  if (snapshot.closedDeals.status !== "ready") return null;
  return rankLeaderboardRows(agents.flatMap((agent) =>
    agent.americanName
      ? [{
          profileId: agent.id,
          realName: agent.name,
          americanName: agent.americanName,
          teamId: agent.teams[0]?.id ?? null,
          teamName: agent.teams[0]?.name ?? null,
          transferCount: snapshot.transferByAgent.get(agent.id) ?? 0,
          closedDeals: snapshot.closedByAgent.get(agent.id) ?? 0,
        }]
      : [],
  ));
}

function teamCompetition(
  agents: readonly ScopedAgent[],
  snapshot: ReturnType<typeof outcomeSnapshot>,
  targets: Awaited<ReturnType<typeof listPerformanceConfigurationForCurrentActor>>["targets"],
  asOf: string,
  coachingByTeam: Map<string, { total: number; completed: number }>,
): TeamCompetitionRow[] {
  const groups = new Map<string, { name: string; agentIds: string[] }>();
  for (const agent of agents) {
    for (const team of agent.teams) {
      const group = groups.get(team.id) ?? { name: team.name, agentIds: [] };
      if (!group.agentIds.includes(agent.id)) group.agentIds.push(agent.id);
      groups.set(team.id, group);
    }
  }
  const rows = Array.from(groups, ([teamId, group]) => {
    const transfers = group.agentIds.reduce((total, id) => total + (snapshot.transferByAgent.get(id) ?? 0), 0);
    const closedDeals = group.agentIds.reduce((total, id) => total + (snapshot.closedByAgent.get(id) ?? 0), 0);
    const target = resolveEffectiveTarget(targets, { metric: "closed_deals", date: asOf, teamId });
    const coaching = coachingByTeam.get(teamId);
    return {
      teamId,
      teamName: group.name,
      rank: 0,
      activeAgents: group.agentIds.length,
      transfers: sourceValue(transfers, snapshot.transfers.status === "ready"),
      closedDeals: sourceValue(closedDeals, snapshot.closedDeals.status === "ready"),
      conversion: snapshot.transfers.status === "ready" && snapshot.closedDeals.status === "ready"
        ? conversionPercentage(closedDeals, transfers)
        : null,
      targetProgress: evaluateTarget(closedDeals, target?.targetValue ?? null),
      coachingCompletion: coaching && coaching.total > 0 ? (coaching.completed / coaching.total) * 100 : null,
    };
  }).sort((a, b) =>
    (b.closedDeals.value ?? -1) - (a.closedDeals.value ?? -1) ||
    (b.transfers.value ?? -1) - (a.transfers.value ?? -1) ||
    a.teamName.localeCompare(b.teamName),
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

async function coachingTeamCompletion(actor: Actor, from: string, to: string) {
  const rows = await getDb().select({
    teamId: coachingSessionParticipants.teamIdSnapshot,
    sessions: sql<number>`count(distinct ${coachingSessions.id})`,
    completed: sql<number>`count(distinct case when ${coachingReportRecords.status} <> 'draft' then ${coachingSessions.id} end)`,
  }).from(coachingSessions)
    .innerJoin(coachingSessionParticipants, eq(coachingSessionParticipants.sessionId, coachingSessions.id))
    .leftJoin(coachingReportRecords, and(
      eq(coachingReportRecords.coachingSessionId, coachingSessions.id),
      eq(coachingReportRecords.agentProfileId, coachingSessionParticipants.agentProfileId),
    ))
    .where(and(
      eq(coachingSessions.organizationId, actorOrganizationId(actor)),
      gte(coachingSessions.sessionDate, from),
      sql`${coachingSessions.sessionDate} <= ${to}`,
    )).groupBy(coachingSessionParticipants.teamIdSnapshot);
  return new Map(rows.flatMap((row) => row.teamId ? [[row.teamId, { total: Number(row.sessions), completed: Number(row.completed) }] as const] : []));
}

async function loadAdminDataHealth(actor: Actor) {
  const organizationId = actorOrganizationId(actor);
  const [activeVersions, latestBatches, failedDeliveries] = await Promise.all([
    getDb()
      .select({
        id: dialerDatasetVersions.id,
        activatedAt: dialerDatasetVersions.activatedAt,
        rowCount: dialerDatasetVersions.rowCount,
      })
      .from(dialerDatasetVersions)
      .innerJoin(dialerImportBatches, eq(dialerImportBatches.id, dialerDatasetVersions.importBatchId))
      .innerJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .where(and(
        eq(profiles.organizationId, organizationId),
        eq(dialerDatasetVersions.status, "active"),
      ))
      .orderBy(desc(dialerDatasetVersions.activatedAt), desc(dialerDatasetVersions.createdAt)),
    getDb()
      .select({
        id: dialerImportBatches.id,
        status: dialerImportBatches.status,
        rowCount: dialerImportBatches.rowCount,
        matchedAgentCount: dialerImportBatches.matchedAgentCount,
        unmatchedAgentCount: dialerImportBatches.unmatchedAgentCount,
        publishedAt: dialerImportBatches.publishedAt,
        createdAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .innerJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
      .where(eq(profiles.organizationId, organizationId))
      .orderBy(desc(dialerImportBatches.createdAt))
      .limit(1),
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(emailDeliveryAttempts)
      .innerJoin(profiles, eq(profiles.id, emailDeliveryAttempts.profileId))
      .where(and(
        eq(profiles.organizationId, organizationId),
        eq(emailDeliveryAttempts.status, "failed"),
      )),
  ]);
  const latestBatch = latestBatches[0] ?? null;
  const rowQuality = latestBatch
    ? await getDb()
        .select({
          mapped: sql<number>`sum(case when ${dialerImportRows.matchingStatus} = 'mapped' then 1 else 0 end)`,
          unmapped: sql<number>`sum(case when ${dialerImportRows.matchingStatus} <> 'mapped' then 1 else 0 end)`,
          invalid: sql<number>`sum(case when ${dialerImportRows.validationStatus} = 'error' then 1 else 0 end)`,
        })
        .from(dialerImportRows)
        .where(eq(dialerImportRows.batchId, latestBatch.id))
    : [];
  const latestActive = activeVersions[0] ?? null;
  return {
    activeVersionId: latestActive?.id ?? null,
    activeVersionCount: activeVersions.length,
    activeVersionRows: activeVersions.reduce((total, version) => total + version.rowCount, 0),
    latestImportStatus: latestBatch?.status ?? null,
    importedRowCount: latestBatch?.rowCount ?? 0,
    mappedRowCount: Number(rowQuality[0]?.mapped ?? latestBatch?.matchedAgentCount ?? 0),
    unmappedRowCount: Number(rowQuality[0]?.unmapped ?? latestBatch?.unmatchedAgentCount ?? 0),
    invalidRowCount: Number(rowQuality[0]?.invalid ?? 0),
    lastSyncAt: latestActive?.activatedAt ?? latestBatch?.publishedAt ?? latestBatch?.createdAt ?? null,
    failedDeliveryAttempts: Number(failedDeliveries[0]?.count ?? 0),
  };
}

export type RoleDashboardData =
  | { role: "agent"; data: Awaited<ReturnType<typeof agentDashboardData>> }
  | { role: "manager"; data: Awaited<ReturnType<typeof managerDashboardData>> }
  | { role: "admin"; data: Awaited<ReturnType<typeof adminDashboardData>> };

async function sharedInputs(actor: CurrentActor, now: Date, selectedRange: OverviewDateRange, timeZone: string) {
  const orgActor = organizationActor(actor);
  const today = dateKeyInTimeZone(now, timeZone);
  const week = resolveWeekWindow(today);
  const month = resolveOverviewDateRange({ range: "this-month" }, now, timeZone);
  const lastMonth = resolveOverviewDateRange({ range: "last-month" }, now, timeZone);
  // Keep each request's database fan-out below the bounded pool queue. These
  // groups are independent within the group, while the later dashboard and
  // operational reads depend only on the resolved actor/scope metadata.
  const [scopedAgents, companyAgents, outcomeSource, configuration] = await Promise.all([
    listScopedActiveAgents(actor),
    listScopedActiveAgents(orgActor),
    loadRoleDashboardOutcomeSource(orgActor),
    listPerformanceConfigurationForCurrentActor(actor),
  ]);
  const dialer = await getDashboardData(actor, {
    dateRange: selectedRange,
    showAgentsWithNoData: true,
  });
  const [coachingReports, shadowing, manualFlags, transferFlags, performanceFlags, coachingByTeam] = await Promise.all([
    listCoachingReportsForCurrentActor(actor),
    listShadowingSessionsForCurrentActor(actor),
    listManualFlagCasesForCurrentActor(actor),
    getTransferFlagsData(actor, {
      dateRange: { from: week.start, to: week.end },
      profileId: actor.role === "agent" ? actor.id : undefined,
    }),
    getPerformanceFlagsData(actor, {
      dateRange: { from: month.from, to: month.to },
      flaggedOnly: true,
    }),
    coachingTeamCompletion(orgActor, week.start, week.end),
  ]);
  const weekly = outcomeSnapshot(outcomeSource, {
    kind: "date",
    window: { from: week.start, to: week.end },
  });
  const monthly = outcomeSnapshot(outcomeSource, { kind: "date", window: month });
  const lastMonthly = outcomeSnapshot(outcomeSource, { kind: "date", window: lastMonth });
  const todaySnapshot = outcomeSnapshot(outcomeSource, { kind: "date", window: { from: today, to: today } });
  const selectedSnapshot = outcomeSnapshot(outcomeSource, { kind: "date", window: selectedRange });
  const selectedComparisonSnapshot = selectedRange.comparison
    ? outcomeSnapshot(outcomeSource, {
        kind: "date",
        window: selectedRange.comparison,
      })
    : null;
  const monthlyHistory = buildCalendarMonthWindows(today).map((window) => {
    const snapshot = outcomeSnapshot(outcomeSource, {
      kind: "date",
      window: { from: window.from, to: window.to },
    });
    return {
      ...window,
      transfers: snapshot.transfers,
      closedDeals: snapshot.closedDeals,
      conversion:
        snapshot.transfers.value !== null && snapshot.closedDeals.value !== null
          ? conversionPercentage(
              snapshot.closedDeals.value,
              snapshot.transfers.value,
            )
          : null,
    };
  });
  const top = rankedRows(companyAgents, lastMonthly)?.[0] ?? null;
  return {
    today, week, month, lastMonth, scopedAgents, companyAgents, outcomeSource,
    configuration, dialer, coachingReports, shadowing, manualFlags, transferFlags, performanceFlags,
    weekly, monthly, lastMonthly, todaySnapshot, selectedSnapshot,
    selectedComparisonSnapshot, monthlyHistory,
    weeklyRanks: rankedRows(companyAgents, weekly),
    monthlyRanks: rankedRows(companyAgents, monthly),
    topPerformerLastMonth: top,
    competition: teamCompetition(companyAgents, selectedSnapshot, configuration.targets, selectedRange.to ?? today, coachingByTeam),
    todayCompetition: teamCompetition(companyAgents, todaySnapshot, configuration.targets, today, coachingByTeam),
  };
}

async function agentDashboardData(actor: CurrentActor, now: Date, selectedRange: OverviewDateRange, timeZone: string) {
  const shared = await sharedInputs(actor, now, selectedRange, timeZone);
  const shift = lastCompletedShift(now);
  const previousShift = previousCompletedShift(shift);
  const allowed = new Set([actor.id]);
  const [shiftRows, previousRows, commission] = await Promise.all([
    shiftDialerRows(actor, [actor.id], shift),
    shiftDialerRows(actor, [actor.id], previousShift),
    getCommissionReport(actor, { now }),
  ]);
  const currentOutcome = outcomeSnapshot(shared.outcomeSource, { kind: "shift", window: shift }, allowed);
  const previousOutcome = outcomeSnapshot(shared.outcomeSource, { kind: "shift", window: previousShift }, allowed);
  const currentActivity = sumShiftRows(shiftRows);
  const previousActivity = sumShiftRows(previousRows);
  const teamId = shared.scopedAgents[0]?.teams[0]?.id ?? null;
  const transferTarget = resolveEffectiveTarget(shared.configuration.targets, { metric: "transfers", date: shared.today, teamId });
  const closedTarget = resolveEffectiveTarget(shared.configuration.targets, { metric: "closed_deals", date: shared.today, teamId });
  return {
    period: selectedRange,
    source: shared.outcomeSource,
    lastShift: {
      window: shift,
      transfers: currentOutcome.transfers,
      closedDeals: currentOutcome.closedDeals,
      conversion: currentOutcome.transfers.value !== null && currentOutcome.closedDeals.value !== null
        ? conversionPercentage(currentOutcome.closedDeals.value, currentOutcome.transfers.value) : null,
      coverage: calculateShiftCoverage(shiftRows, shift),
      activity: currentActivity,
      automaticFlags: calculatePerformanceFlags(currentActivity),
      comparison: {
        transfers: previousOutcome.transfers,
        closedDeals: previousOutcome.closedDeals,
        activity: previousActivity,
      },
    },
    standing: {
      weeklyRank: shared.weeklyRanks?.find((row) => row.profileId === actor.id)?.rank ?? null,
      monthlyRank: shared.monthlyRanks?.find((row) => row.profileId === actor.id)?.rank ?? null,
      totalRankedAgents: shared.monthlyRanks?.length ?? null,
      teamDailyRank: shared.todayCompetition.find((team) => team.teamId === teamId)?.rank ?? null,
      wasTopPerformerLastMonth:
        shared.topPerformerLastMonth?.profileId === actor.id,
      monthly: {
        transfers: sourceValue(shared.monthly.transferByAgent.get(actor.id), shared.monthly.transfers.status === "ready"),
        closedDeals: sourceValue(shared.monthly.closedByAgent.get(actor.id), shared.monthly.closedDeals.status === "ready"),
      },
    },
    targets: {
      transfers: evaluateTarget(shared.monthly.transferByAgent.get(actor.id) ?? 0, transferTarget?.targetValue ?? null),
      closedDeals: evaluateTarget(shared.monthly.closedByAgent.get(actor.id) ?? 0, closedTarget?.targetValue ?? null),
    },
    commission: commission.status === "ready" ? commission.rows.find((row) => row.id === actor.id) ?? null : commission,
    coachingReports: shared.coachingReports,
    shadowing: shared.shadowing,
    manualFlags: shared.manualFlags,
    transferFlags: shared.transferFlags,
    teamCompetition: shared.competition,
  };
}

export function scopeManagerTeamCompetition<
  T extends { teamId: string },
>(rows: readonly T[], assignedTeamIds: readonly string[]) {
  if (assignedTeamIds.length === 0) return [];
  const assigned = new Set(assignedTeamIds);
  return rows.filter((row) => assigned.has(row.teamId));
}

async function managerDashboardData(actor: CurrentActor, now: Date, selectedRange: OverviewDateRange, requestedPage = 1, timeZone = "Africa/Cairo") {
  const shared = await sharedInputs(actor, now, selectedRange, timeZone);
  const agentIds = shared.scopedAgents.map((agent) => agent.id);
  const employment = await profileEmployment(agentIds);
  const shift = lastCompletedShift(now);
  const [shiftRows, commission, coachingRoom] = await Promise.all([
    shiftDialerRows(actor, agentIds, shift),
    getCommissionReport(actor, { now }),
    getCoachingRoomData(actor, { page: 1, pageSize: 30 }),
  ]);
  const rows = shared.scopedAgents.map((agent) => {
    const agentShiftRows = shiftRows.filter((row) => row.agentProfileId === agent.id);
    const activity = sumShiftRows(agentShiftRows);
    const coverage = calculateShiftCoverage(agentShiftRows, shift);
    const transfers = sourceValue(shared.todaySnapshot.transferByAgent.get(agent.id), shared.todaySnapshot.transfers.status === "ready");
    const closedDeals = sourceValue(shared.todaySnapshot.closedByAgent.get(agent.id), shared.todaySnapshot.closedDeals.status === "ready");
    const start = employment.get(agent.id)?.start ?? null;
    const tenureDays = employmentTenureDays(start, shared.today);
    const threshold = tenureDays === null ? null : resolveTenureThreshold(shared.configuration.thresholds, {
      tenureDays, date: shared.today, teamId: agent.teams[0]?.id,
    });
    const lowPerformance = tenureDays === null
      ? { status: "unavailable" as const, isLowPerformer: false as const, reasons: [] as [] }
      : evaluateLowPerformance({
          threshold,
          sourceAvailable: transfers.status === "ready" && closedDeals.status === "ready",
          periodComplete: true,
          period: "today",
          metrics: {
            transfers: transfers.value,
            closedDeals: closedDeals.value,
            conversion: transfers.value !== null && closedDeals.value !== null ? conversionPercentage(closedDeals.value, transfers.value) : null,
            shiftCoverage: coverage.status === "ready" ? coverage.percentage : null,
          },
        });
    const monthClosedValue = shared.monthly.closedByAgent.get(agent.id) ?? 0;
    const monthClosedTarget = resolveEffectiveTarget(shared.configuration.targets, {
      metric: "closed_deals",
      date: shared.today,
      teamId: agent.teams[0]?.id,
    });
    const agentReports = shared.coachingReports.filter((report) => report.agentProfileId === agent.id);
    const agentShadowing = shared.shadowing.filter((session) => session.agentProfileId === agent.id);
    const selectedTransfers = sourceValue(shared.selectedSnapshot.transferByAgent.get(agent.id), shared.selectedSnapshot.transfers.status === "ready");
    const selectedClosedDeals = sourceValue(shared.selectedSnapshot.closedByAgent.get(agent.id), shared.selectedSnapshot.closedDeals.status === "ready");
    return {
      agentId: agent.id,
      agentName: agent.name,
      team: agent.teams[0] ?? null,
      employmentStartDate: start,
      tenureDays,
      tenureBand: threshold?.bandLabel ?? null,
      transfers,
      closedDeals,
      conversion: transfers.value !== null && closedDeals.value !== null ? conversionPercentage(closedDeals.value, transfers.value) : null,
      monthTransfers: sourceValue(shared.monthly.transferByAgent.get(agent.id), shared.monthly.transfers.status === "ready"),
      monthClosedDeals: sourceValue(shared.monthly.closedByAgent.get(agent.id), shared.monthly.closedDeals.status === "ready"),
      monthTargetProgress:
        shared.monthly.closedDeals.status === "ready"
          ? evaluateTarget(monthClosedValue, monthClosedTarget?.targetValue ?? null)
          : null,
      weeklyRank: shared.weeklyRanks?.find((rank) => rank.profileId === agent.id)?.rank ?? null,
      monthlyRank: shared.monthlyRanks?.find((rank) => rank.profileId === agent.id)?.rank ?? null,
      coverage,
      activity,
      automaticFlags: calculatePerformanceFlags(activity),
      transferFlagCount: shared.transferFlags.rows.filter((flag) => flag.agentId === agent.id).length,
      manualFlagCount: shared.manualFlags.filter((flag) => flag.agentProfileId === agent.id && !["resolved", "dismissed"].includes(flag.status)).length,
      coachingPending: shared.coachingReports.filter((report) => report.agentProfileId === agent.id && report.status !== "published" && report.status !== "acknowledged").length,
      shadowingPending: shared.shadowing.filter((session) => session.agentProfileId === agent.id && ["due", "overdue"].includes(session.displayStatus)).length,
      lowPerformance,
      exportPeriod: {
        transfers: selectedTransfers,
        closedDeals: selectedClosedDeals,
        conversion: selectedTransfers.value !== null && selectedClosedDeals.value !== null
          ? conversionPercentage(selectedClosedDeals.value, selectedTransfers.value)
          : null,
      },
      commission: commission.status === "ready"
        ? commission.rows.find((commissionRow) => commissionRow.id === agent.id)?.commissionAmount ?? 0
        : null,
      coachingCompleted: agentReports.filter((report) => report.status !== "draft").length,
      rubricStatus: agentReports[0]?.status ?? "not_started",
      qaPending: agentReports.filter((report) => ["draft", "finalized"].includes(report.status)).length,
      shadowingStatus: agentShadowing[0]?.displayStatus ?? "not_scheduled",
    };
  });
  const teamClosedTarget = resolveEffectiveTarget(shared.configuration.targets, {
    metric: "closed_deals",
    date: shared.today,
    teamId: actor.teamIds.length === 1 ? actor.teamIds[0] : null,
  });
  const readyCoverages = rows.flatMap((row) =>
    row.coverage.status === "ready" ? [row.coverage.percentage] : [],
  );
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage)));
  return {
    period: selectedRange,
    source: shared.outcomeSource,
    teamIds: actor.teamIds,
    rows,
    visibleRows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, pageCount, total: rows.length },
    totals: {
      activeAgents: rows.length,
      transfers: sourceValue(shared.todaySnapshot.transfers.value ?? undefined, shared.todaySnapshot.transfers.status === "ready"),
      closedDeals: sourceValue(shared.todaySnapshot.closedDeals.value ?? undefined, shared.todaySnapshot.closedDeals.status === "ready"),
      commission: commission.status === "ready" ? commission.summary?.totalCommission ?? 0 : null,
      monthTransfers: sourceValue(shared.monthly.transfers.value ?? undefined, shared.monthly.transfers.status === "ready"),
      monthClosedDeals: sourceValue(shared.monthly.closedDeals.value ?? undefined, shared.monthly.closedDeals.status === "ready"),
      monthTargetProgress:
        shared.monthly.closedDeals.status === "ready"
          ? evaluateTarget(shared.monthly.closedDeals.value ?? 0, teamClosedTarget?.targetValue ?? null)
          : null,
      targetConfigured: teamClosedTarget !== null,
      shiftCoverage:
        readyCoverages.length === rows.length && rows.length > 0
          ? readyCoverages.reduce((total, value) => total + value, 0) / readyCoverages.length
          : null,
      attention: rows.filter((row) => row.lowPerformance.isLowPerformer || row.manualFlagCount > 0 || row.coachingPending > 0 || row.shadowingPending > 0).length,
    },
    teamCompetition: scopeManagerTeamCompetition(
      shared.competition,
      actor.teamIds,
    ),
    coachingReports: shared.coachingReports,
    coachingSessions: coachingRoom.rows,
    rubricTemplates: shared.configuration.templates,
    shadowing: shared.shadowing,
    manualFlags: shared.manualFlags,
    transferFlags: shared.transferFlags,
    topPerformerLastMonth: shared.topPerformerLastMonth,
  };
}

async function adminDashboardData(actor: CurrentActor, now: Date, selectedRange: OverviewDateRange, timeZone: string) {
  const shared = await sharedInputs(actor, now, selectedRange, timeZone);
  const [employmentCounts, accountCounts, managerRows, commission, companyEmployment, companyShiftRows, operationalHealth] = await Promise.all([
    getDb().select({ status: profiles.employmentStatus, count: sql<number>`count(*)` })
      .from(profiles)
      .where(and(eq(profiles.organizationId, actorOrganizationId(actor)), eq(profiles.role, "agent"), isNull(profiles.deletedAt)))
      .groupBy(profiles.employmentStatus),
    getDb().select({ status: profiles.accountStatus, count: sql<number>`count(*)` })
      .from(profiles)
      .where(and(eq(profiles.organizationId, actorOrganizationId(actor)), isNull(profiles.deletedAt)))
      .groupBy(profiles.accountStatus),
    getDb().select({ managerId: profiles.id, managerName: profiles.name, teamId: teamMemberships.teamId, teamName: teams.name })
      .from(profiles)
      .leftJoin(teamMemberships, and(eq(teamMemberships.profileId, profiles.id), eq(teamMemberships.role, "manager"), eq(teamMemberships.active, true), isNull(teamMemberships.endedAt)))
      .leftJoin(teams, and(eq(teams.id, teamMemberships.teamId), visibleTeamWhere(actor)))
      .where(and(eq(profiles.organizationId, actorOrganizationId(actor)), eq(profiles.role, "manager"), eq(profiles.active, true)))
      .orderBy(asc(profiles.name)),
    getCommissionReport(actor, { now }),
    profileEmployment(shared.companyAgents.map((agent) => agent.id)),
    shiftDialerRows(actor, shared.companyAgents.map((agent) => agent.id), lastCompletedShift(now)),
    loadAdminDataHealth(actor),
  ]);
  const managerGroups = new Map<string, { managerId: string; managerName: string; teams: string[]; teamIds: string[] }>();
  for (const row of managerRows) {
    const item = managerGroups.get(row.managerId) ?? { managerId: row.managerId, managerName: row.managerName, teams: [], teamIds: [] };
    if (row.teamId && row.teamName) { item.teamIds.push(row.teamId); item.teams.push(row.teamName); }
    managerGroups.set(row.managerId, item);
  }
  const leaderPerformance = Array.from(managerGroups.values()).map((manager) => {
    const teamRows = shared.competition.filter((team) => manager.teamIds.includes(team.teamId));
    const activeAgents = teamRows.reduce((total, team) => total + team.activeAgents, 0);
    const managedAgentIds = new Set(
      shared.companyAgents
        .filter((agent) => agent.teams.some((team) => manager.teamIds.includes(team.id)))
        .map((agent) => agent.id),
    );
    const managerReports = shared.coachingReports.filter((report) => report.coachProfileId === manager.managerId);
    const completedReports = managerReports.filter((report) => report.status !== "draft");
    const distinctAgentsCoached = new Set(completedReports.map((report) => report.agentProfileId)).size;
    const managerFlags = shared.manualFlags.filter((flag) => flag.raisedById === manager.managerId);
    const resolvedFlags = managerFlags.filter((flag) => flag.resolvedAt);
    const resolutionHours = resolvedFlags.flatMap((flag) =>
      flag.resolvedAt
        ? [(flag.resolvedAt.getTime() - flag.createdAt.getTime()) / 3_600_000]
        : [],
    );
    return {
      ...manager,
      activeAgents,
      transfers: teamRows.every((team) => team.transfers.status === "ready") ? teamRows.reduce((total, team) => total + (team.transfers.value ?? 0), 0) : null,
      closedDeals: teamRows.every((team) => team.closedDeals.status === "ready") ? teamRows.reduce((total, team) => total + (team.closedDeals.value ?? 0), 0) : null,
      conversion: teamRows.every((team) => team.transfers.status === "ready" && team.closedDeals.status === "ready")
        ? conversionPercentage(
            teamRows.reduce((total, team) => total + (team.closedDeals.value ?? 0), 0),
            teamRows.reduce((total, team) => total + (team.transfers.value ?? 0), 0),
          )
        : null,
      commission: commission.status === "ready"
        ? commission.rows
            .filter((row) => row.team && manager.teamIds.includes(row.team.id))
            .reduce((total, row) => total + row.commissionAmount, 0)
        : null,
      targetAttainment: teamRows.length && teamRows.every((team) => team.targetProgress.status !== "not_configured")
        ? teamRows.reduce((total, team) => total + (team.targetProgress.status === "not_configured" ? 0 : team.targetProgress.percentage), 0) / teamRows.length
        : null,
      coachingSessionsCompleted: completedReports.length,
      distinctAgentsCoached,
      coachingCoverage: activeAgents > 0 ? (distinctAgentsCoached / activeAgents) * 100 : null,
      rubricCompletionRate: managerReports.length > 0 ? (completedReports.length / managerReports.length) * 100 : null,
      coachingReportsPublished: managerReports.filter((report) => ["published", "acknowledged"].includes(report.status)).length,
      qaPending: managerReports.filter((report) => ["draft", "finalized"].includes(report.status)).length,
      shadowingCompleted: shared.shadowing.filter((session) => session.assignedLeaderId === manager.managerId && session.status === "completed").length,
      shadowingCompletion: (() => {
        const sessions = shared.shadowing.filter(
          (session) => session.assignedLeaderId === manager.managerId,
        );
        return sessions.length
          ? (sessions.filter((session) => session.status === "completed").length /
              sessions.length) *
              100
          : null;
      })(),
      followUpsOverdue: managerReports.filter((report) => report.followUpDate && report.followUpDate < shared.today && report.status !== "acknowledged").length,
      manualFlagsRaised: managerFlags.length,
      manualFlagsResolved: resolvedFlags.length,
      averageResolutionHours: resolutionHours.length ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length : null,
      activeFlags:
        shared.manualFlags.filter(
          (flag) =>
            managedAgentIds.has(flag.agentProfileId) &&
            !["resolved", "dismissed"].includes(flag.status),
        ).length +
        shared.performanceFlags.rows.filter((flag) => managedAgentIds.has(flag.agentId)).length +
        shared.transferFlags.rows.filter((flag) => managedAgentIds.has(flag.agentId)).length,
    };
  });
  const counts = new Map(employmentCounts.map((row) => [row.status, Number(row.count)]));
  const accountStatusCounts = new Map(accountCounts.map((row) => [row.status, Number(row.count)]));
  const shiftWindow = lastCompletedShift(now);
  const companyCoverages = shared.companyAgents.map((agent) =>
    calculateShiftCoverage(
      companyShiftRows.filter((row) => row.agentProfileId === agent.id),
      shiftWindow,
    ),
  );
  const readyCompanyCoverages = companyCoverages.flatMap((coverage) =>
    coverage.status === "ready" ? [coverage.percentage] : [],
  );
  const companyClosedTarget = resolveEffectiveTarget(shared.configuration.targets, {
    metric: "closed_deals",
    date: selectedRange.to ?? shared.today,
    teamId: null,
  });
  const completedShadowing = shared.shadowing.filter((session) => session.status === "completed").length;
  const managerNamesByTeam = new Map<string, string[]>();
  for (const manager of managerGroups.values()) {
    for (const teamId of manager.teamIds) {
      const names = managerNamesByTeam.get(teamId) ?? [];
      names.push(manager.managerName);
      managerNamesByTeam.set(teamId, names);
    }
  }
  const coverageByAgent = new Map(
    shared.companyAgents.map((agent, index) => [agent.id, companyCoverages[index]]),
  );
  const lowPastRampByTeam = new Map<string, number>();
  for (const rank of shared.monthlyRanks ?? []) {
    if (!rank.teamId) continue;
    const employment = companyEmployment.get(rank.profileId);
    const tenureDays = employmentTenureDays(employment?.start ?? null, shared.today);
    if (tenureDays === null) continue;
    const threshold = resolveTenureThreshold(shared.configuration.thresholds, {
      tenureDays,
      date: shared.today,
      teamId: rank.teamId,
    });
    if (threshold?.isRamp) continue;
    const result = evaluateLowPerformance({
      threshold,
      sourceAvailable: shared.monthly.transfers.status === "ready" && shared.monthly.closedDeals.status === "ready",
      periodComplete: false,
      period: "month to date",
      metrics: {
        transfers: rank.transferCount,
        closedDeals: rank.closedDeals,
        conversion: conversionPercentage(rank.closedDeals, rank.transferCount),
        shiftCoverage: null,
      },
    });
    if (result.isLowPerformer) {
      lowPastRampByTeam.set(rank.teamId, (lowPastRampByTeam.get(rank.teamId) ?? 0) + 1);
    }
  }
  const teamComparison = shared.competition.map((team) => {
    const agentIds = shared.companyAgents
      .filter((agent) => agent.teams.some((item) => item.id === team.teamId))
      .map((agent) => agent.id);
    const agentIdSet = new Set(agentIds);
    const reports = shared.coachingReports.filter((report) => agentIdSet.has(report.agentProfileId));
    const shadowing = shared.shadowing.filter((session) => session.teamId === team.teamId);
    const coverage = agentIds.flatMap((agentId) => {
      const item = coverageByAgent.get(agentId);
      return item?.status === "ready" ? [item.percentage] : [];
    });
    const commissionTotal = commission.status === "ready"
      ? commission.rows
          .filter((row) => row.team?.id === team.teamId)
          .reduce((total, row) => total + row.commissionAmount, 0)
      : null;
    return {
      ...team,
      commission: commissionTotal,
      rubricCompletion: reports.length
        ? (reports.filter((report) => report.status !== "draft").length / reports.length) * 100
        : null,
      qaPending: reports.filter((report) => ["draft", "finalized"].includes(report.status)).length,
      shadowingCompletion: shadowing.length
        ? (shadowing.filter((session) => session.status === "completed").length / shadowing.length) * 100
        : null,
      activeFlags:
        shared.manualFlags.filter((flag) => flag.teamId === team.teamId && !["resolved", "dismissed"].includes(flag.status)).length +
        shared.performanceFlags.rows.filter((flag) => agentIdSet.has(flag.agentId)).length +
        shared.transferFlags.rows.filter((flag) => agentIdSet.has(flag.agentId)).length,
      lowPastRamp: lowPastRampByTeam.get(team.teamId) ?? 0,
      shiftCoverage: coverage.length === agentIds.length && agentIds.length > 0
        ? coverage.reduce((total, value) => total + value, 0) / coverage.length
        : null,
    };
  });
  return {
    period: selectedRange,
    source: shared.outcomeSource,
    company: {
      transfers: sourceValue(shared.selectedSnapshot.transfers.value ?? undefined, shared.selectedSnapshot.transfers.status === "ready"),
      closedDeals: sourceValue(shared.selectedSnapshot.closedDeals.value ?? undefined, shared.selectedSnapshot.closedDeals.status === "ready"),
      conversion: shared.selectedSnapshot.transfers.value !== null && shared.selectedSnapshot.closedDeals.value !== null
        ? conversionPercentage(shared.selectedSnapshot.closedDeals.value, shared.selectedSnapshot.transfers.value) : null,
      totalCommissions: commission.status === "ready" ? commission.summary?.totalCommission ?? 0 : null,
      activeHeadcount: counts.get("active") ?? 0,
      deactivatedHeadcount: counts.get("deactivated") ?? 0,
      terminatedHeadcount: counts.get("terminated") ?? 0,
      deactivatedAccounts: accountStatusCounts.get("deactivated") ?? 0,
      shiftCoverage:
        readyCompanyCoverages.length === companyCoverages.length && companyCoverages.length > 0
          ? readyCompanyCoverages.reduce((a, b) => a + b, 0) / readyCompanyCoverages.length
          : null,
      targetProgress:
        shared.selectedSnapshot.closedDeals.status === "ready"
          ? evaluateTarget(shared.selectedSnapshot.closedDeals.value ?? 0, companyClosedTarget?.targetValue ?? null)
          : null,
      coachingCompletion: shared.coachingReports.length > 0
        ? (shared.coachingReports.filter((report) => ["published", "acknowledged"].includes(report.status)).length / shared.coachingReports.length) * 100 : null,
      qaPending: shared.coachingReports.filter((report) => ["draft", "finalized"].includes(report.status)).length,
      shadowingPending: shared.shadowing.filter((session) => ["due", "overdue"].includes(session.displayStatus)).length,
      shadowingCompletion: shared.shadowing.length > 0 ? (completedShadowing / shared.shadowing.length) * 100 : null,
      manualFlagsActive: shared.manualFlags.filter((flag) => !["resolved", "dismissed"].includes(flag.status)).length,
      transferFlagsActive: shared.transferFlags.rows.length,
      performanceFlagsActive: shared.performanceFlags.rows.length,
      comparisonLabel: selectedRange.comparison?.label ?? null,
      comparison: shared.selectedComparisonSnapshot
        ? {
            transfers: shared.selectedComparisonSnapshot.transfers,
            closedDeals: shared.selectedComparisonSnapshot.closedDeals,
            conversion:
              shared.selectedComparisonSnapshot.transfers.value !== null &&
              shared.selectedComparisonSnapshot.closedDeals.value !== null
                ? conversionPercentage(
                    shared.selectedComparisonSnapshot.closedDeals.value,
                    shared.selectedComparisonSnapshot.transfers.value,
                  )
                : null,
          }
        : null,
    },
    teamComparison,
    leaderPerformance,
    talent: shared.monthlyRanks?.map((rank) => {
      const employment = companyEmployment.get(rank.profileId);
      const tenureDays = employmentTenureDays(employment?.start ?? null, shared.lastMonth.to ?? shared.today);
      const threshold = tenureDays === null ? null : resolveTenureThreshold(shared.configuration.thresholds, {
        tenureDays,
        date: shared.lastMonth.to ?? shared.today,
        teamId: rank.teamId,
      });
      const lastTransfers = shared.lastMonthly.transferByAgent.get(rank.profileId) ?? 0;
      const lastClosedDeals = shared.lastMonthly.closedByAgent.get(rank.profileId) ?? 0;
      const lowPerformance = tenureDays === null
        ? { status: "unavailable" as const, isLowPerformer: false as const, reasons: [] as [] }
        : evaluateLowPerformance({
            threshold,
            sourceAvailable: shared.lastMonthly.transfers.status === "ready" && shared.lastMonthly.closedDeals.status === "ready",
            periodComplete: true,
            period: "last month",
            metrics: {
              transfers: lastTransfers,
              closedDeals: lastClosedDeals,
              conversion: conversionPercentage(lastClosedDeals, lastTransfers),
              shiftCoverage: null,
            },
          });
      const currentTarget = resolveEffectiveTarget(shared.configuration.targets, {
        metric: "closed_deals",
        date: shared.today,
        teamId: rank.teamId,
      });
      return {
        ...rank,
        employmentStartDate: employment?.start ?? null,
        tenureDays,
        currentManagers: rank.teamId ? managerNamesByTeam.get(rank.teamId) ?? [] : [],
        targetProgress: evaluateTarget(rank.closedDeals, currentTarget?.targetValue ?? null),
        lowPerformance,
        coachingStatus: shared.coachingReports.some((report) => report.agentProfileId === rank.profileId) ? "recorded" : "none",
        coachingDirection: "not_evaluated" as const,
        activeFlags: shared.manualFlags.filter((flag) => flag.agentProfileId === rank.profileId && !["resolved", "dismissed"].includes(flag.status)).length,
      };
    }) ?? [],
    talentDistributionAgents: shared.companyAgents.map((agent) => ({
      profileId: agent.id,
      name: agent.name,
      tenureDays: employmentTenureDays(
        companyEmployment.get(agent.id)?.start ?? null,
        shared.today,
      ),
    })),
    agents: shared.companyAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      employmentStartDate: companyEmployment.get(agent.id)?.start ?? null,
    })),
    dataHealth: {
      ...operationalHealth,
      dialerStatus: shared.dialer.status,
      dialerRows: shared.dialer.totals.rowCount,
      latestMetricDate: shared.dialer.dataFreshness.latestMetricDate,
      reconciliation: shared.dialer.reconciliation,
      outcomeStatus: shared.outcomeSource.status,
      transferDiagnostics: shared.outcomeSource.status === "unavailable" ? null : shared.outcomeSource.transferDiagnostics,
      closedDiagnostics: shared.outcomeSource.status === "ready" ? shared.outcomeSource.closedDiagnostics : null,
      stale: shared.outcomeSource.status === "unavailable" ? null : shared.outcomeSource.stale,
    },
    configuration: shared.configuration,
    coachingReports: shared.coachingReports,
    shadowing: shared.shadowing,
    manualFlags: shared.manualFlags,
    transferFlags: shared.transferFlags,
    topPerformerLastMonth: shared.topPerformerLastMonth,
    trends: {
      months: shared.monthlyHistory,
      transfers: {
        current: shared.monthly.transfers,
        previous: shared.lastMonthly.transfers,
      },
      closedDeals: {
        current: shared.monthly.closedDeals,
        previous: shared.lastMonthly.closedDeals,
      },
      conversion: {
        current:
          shared.monthly.transfers.value !== null && shared.monthly.closedDeals.value !== null
            ? conversionPercentage(shared.monthly.closedDeals.value, shared.monthly.transfers.value)
            : null,
        previous:
          shared.lastMonthly.transfers.value !== null && shared.lastMonthly.closedDeals.value !== null
            ? conversionPercentage(shared.lastMonthly.closedDeals.value, shared.lastMonthly.transfers.value)
            : null,
      },
    },
  };
}

export async function getRoleDashboardData(
  actor: Actor,
  input: { dateRange: OverviewDateRange; now?: Date; page?: number; timeZone?: string },
): Promise<RoleDashboardData> {
  const currentActor = await resolveCurrentActor(actor);
  await assertRoleDashboardViewAccess(currentActor);
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? "Africa/Cairo";
  if (currentActor.role === "agent") return { role: "agent", data: await agentDashboardData(currentActor, now, input.dateRange, timeZone) };
  if (currentActor.role === "manager") return { role: "manager", data: await managerDashboardData(currentActor, now, input.dateRange, input.page, timeZone) };
  return { role: "admin", data: await adminDashboardData(currentActor, now, input.dateRange, timeZone) };
}

export type AdminDashboardData = Awaited<ReturnType<typeof adminDashboardData>>;
