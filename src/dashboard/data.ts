import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { resolveProfileScope, type Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  profiles,
  teamMemberships,
} from "@/db/schema";
import { secondsToDuration, toPercentage } from "@/dashboard/format";

export const DASHBOARD_RANGES = [
  "today",
  "yesterday",
  "month-to-date",
  "previous-month",
  "custom",
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DASHBOARD_ACCOUNT_FILTERS = ["active", "deleted", "all"] as const;
export type DashboardAccountFilter =
  (typeof DASHBOARD_ACCOUNT_FILTERS)[number];

export type DashboardPeriod = {
  key: DashboardRange;
  start: string;
  end: string;
  label: string;
};

export type DashboardMetric = {
  label: string;
  value: string;
};

export type DashboardTotals = {
  calls: number;
  loginSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  idleSeconds: number;
  untrackedSeconds: number;
};

export type DashboardTrendPoint = {
  label: string;
  date: string;
  calls: number;
  loginHours: number;
};

export type HourlyActivityPoint = {
  hour: number;
  label: string;
  calls: number;
  loginHours: number;
};

export type AgentPerformanceRow = {
  id: string;
  name: string;
  email: string;
  team: string;
  calls: number;
  loginSeconds: number;
  talkSeconds: number;
  readySeconds: number;
  ringingSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  idleSeconds: number;
  untrackedSeconds: number;
  callsPerHour: number;
  talkPercentage: number;
  status: "active" | "invited" | "deactivated" | "revoked" | "deleted";
};

export type TeamComparisonRow = {
  team: string;
  calls: number;
  loginHours: number;
  callsPerHour: number;
};

export type DashboardHealth = {
  latestMetricAt: Date | string | null;
  latestMetricDate: string | null;
  rowCount: number;
  trackedSeconds: number;
  reconciliationSeconds: number;
  lastImport: {
    fileName: string;
    status:
      | "previewed"
      | "partially_confirmed"
      | "confirmed"
      | "failed"
      | "rejected";
    rowCount: number;
    createdAt: Date;
    confirmedAt: Date | null;
  } | null;
};

export type ScopedDashboardData = {
  period: DashboardPeriod;
  totals: DashboardTotals;
  trend: DashboardTrendPoint[];
  hourly: HourlyActivityPoint[];
  agents: AgentPerformanceRow[];
  teams: TeamComparisonRow[];
  health: DashboardHealth;
};

const EMPTY_TOTALS: DashboardTotals = {
  calls: 0,
  loginSeconds: 0,
  readySeconds: 0,
  talkSeconds: 0,
  ringingSeconds: 0,
  wrapSeconds: 0,
  pausedSeconds: 0,
  idleSeconds: 0,
  untrackedSeconds: 0,
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatPeriodLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startLabel = formatter.format(new Date(`${start}T00:00:00`));
  const endLabel = formatter.format(new Date(`${end}T00:00:00`));
  return start === end ? startLabel : `${startLabel} – ${endLabel}`;
}

export function normalizeDashboardRange(
  value: string | string[] | undefined,
): DashboardRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return DASHBOARD_RANGES.includes(candidate as DashboardRange)
    ? (candidate as DashboardRange)
    : "month-to-date";
}

export function normalizeDashboardAccountFilter(
  value: string | string[] | undefined,
): DashboardAccountFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return DASHBOARD_ACCOUNT_FILTERS.includes(
    candidate as DashboardAccountFilter,
  )
    ? (candidate as DashboardAccountFilter)
    : "all";
}

export function resolveDashboardPeriod(
  range: DashboardRange,
  options: { now?: Date; from?: string; to?: string } = {},
): DashboardPeriod {
  const now = options.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(today);
  let end = new Date(today);
  let resolvedRange = range;

  if (
    range === "custom" &&
    isDateKey(options.from) &&
    isDateKey(options.to) &&
    options.from <= options.to
  ) {
    return {
      key: "custom",
      start: options.from,
      end: options.to,
      label: formatPeriodLabel(options.from, options.to),
    };
  }

  if (range === "custom") {
    resolvedRange = "month-to-date";
  }

  if (resolvedRange === "yesterday") {
    start.setDate(start.getDate() - 1);
    end = new Date(start);
  } else if (resolvedRange === "month-to-date") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (resolvedRange === "previous-month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  }

  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

  return {
    key: resolvedRange,
    start: startKey,
    end: endKey,
    label: formatPeriodLabel(startKey, endKey),
  };
}

async function getScopedProfileIds(actor: Actor) {
  const managerProfileIds =
    actor.role === "manager" && actor.teamIds.length > 0
      ? (
          await getDb()
            .select({ profileId: teamMemberships.profileId })
            .from(teamMemberships)
            .where(
              and(
                inArray(teamMemberships.teamId, actor.teamIds),
                isNull(teamMemberships.endedAt),
              ),
            )
        ).map((row) => row.profileId)
      : [];

  return resolveProfileScope(actor, managerProfileIds);
}

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeTotals(
  row?: Record<keyof DashboardTotals, number | string | null>,
): DashboardTotals {
  if (!row) return { ...EMPTY_TOTALS };

  return {
    calls: numberValue(row.calls),
    loginSeconds: numberValue(row.loginSeconds),
    readySeconds: numberValue(row.readySeconds),
    talkSeconds: numberValue(row.talkSeconds),
    ringingSeconds: numberValue(row.ringingSeconds),
    wrapSeconds: numberValue(row.wrapSeconds),
    pausedSeconds: numberValue(row.pausedSeconds),
    idleSeconds: numberValue(row.idleSeconds),
    untrackedSeconds: numberValue(row.untrackedSeconds),
  };
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

export async function getScopedDashboardData(
  actor: Actor,
  period: DashboardPeriod,
  accountFilter: DashboardAccountFilter = "all",
): Promise<ScopedDashboardData> {
  const scopedProfileIds = await getScopedProfileIds(actor);

  if (scopedProfileIds?.length === 0) {
    return {
      period,
      totals: { ...EMPTY_TOTALS },
      trend: [],
      hourly: [],
      agents: [],
      teams: [],
      health: {
        latestMetricAt: null,
        latestMetricDate: null,
        rowCount: 0,
        trackedSeconds: 0,
        reconciliationSeconds: 0,
        lastImport: null,
      },
    };
  }

  const scopeCondition =
    scopedProfileIds && scopedProfileIds.length > 0
      ? inArray(dialerAgentHourlyMetrics.agentProfileId, scopedProfileIds)
      : undefined;
  const metricWhere = and(
    gte(dialerAgentHourlyMetrics.metricDate, period.start),
    lte(dialerAgentHourlyMetrics.metricDate, period.end),
    scopeCondition,
    accountFilter === "active"
      ? sql`exists (
          select 1 from profiles reporting_profiles
          where reporting_profiles.id = ${dialerAgentHourlyMetrics.agentProfileId}
          and reporting_profiles.account_status <> 'deleted'
        )`
      : accountFilter === "deleted"
        ? sql`exists (
            select 1 from profiles reporting_profiles
            where reporting_profiles.id = ${dialerAgentHourlyMetrics.agentProfileId}
            and reporting_profiles.account_status = 'deleted'
          )`
        : undefined,
  );

  const [
    totalRows,
    dailyRows,
    hourlyRows,
    agentRows,
    teamRows,
    freshnessRows,
    lastImportRows,
  ] = await Promise.all([
    getDb()
      .select({
        calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
        loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
        readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
        talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
        ringingSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.ringingSeconds}), 0)`,
        wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
        pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
        idleSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.idleSeconds}), 0)`,
        untrackedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.untrackedSeconds}), 0)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(metricWhere),
    getDb()
      .select({
        date: dialerAgentHourlyMetrics.metricDate,
        calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
        loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(metricWhere)
      .groupBy(dialerAgentHourlyMetrics.metricDate)
      .orderBy(dialerAgentHourlyMetrics.metricDate),
    getDb()
      .select({
        hour: dialerAgentHourlyMetrics.metricHour,
        calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
        loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(metricWhere)
      .groupBy(dialerAgentHourlyMetrics.metricHour)
      .orderBy(dialerAgentHourlyMetrics.metricHour),
    getDb()
      .select({
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        status: profiles.accountStatus,
        team: sql<string | null>`max(${dialerAgentHourlyMetrics.teamNameSnapshot})`,
        calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
        loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
        readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
        talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
        ringingSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.ringingSeconds}), 0)`,
        wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
        pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
        idleSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.idleSeconds}), 0)`,
        untrackedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.untrackedSeconds}), 0)`,
      })
      .from(dialerAgentHourlyMetrics)
      .innerJoin(
        profiles,
        eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId),
      )
      .where(metricWhere)
      .groupBy(
        profiles.id,
        profiles.name,
        profiles.email,
        profiles.accountStatus,
      ),
    getDb()
      .select({
        team: dialerAgentHourlyMetrics.teamNameSnapshot,
        calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
        loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(metricWhere)
      .groupBy(dialerAgentHourlyMetrics.teamNameSnapshot),
    getDb()
      .select({
        latestMetricAt: sql<Date | string | null>`max(${dialerAgentHourlyMetrics.updatedAt})`,
        latestMetricDate: sql<string | null>`max(${dialerAgentHourlyMetrics.metricDate})`,
        rowCount: sql<number>`count(*)`,
      })
      .from(dialerAgentHourlyMetrics)
      .where(metricWhere),
    actor.role === "agent"
      ? Promise.resolve([])
      : getDb()
          .select({
            fileName: dialerImportBatches.fileName,
            status: dialerImportBatches.status,
            rowCount: dialerImportBatches.rowCount,
            createdAt: dialerImportBatches.createdAt,
            confirmedAt: dialerImportBatches.confirmedAt,
          })
          .from(dialerImportBatches)
          .where(
            actor.role === "admin"
              ? undefined
              : eq(dialerImportBatches.uploadedById, actor.id),
          )
          .orderBy(desc(dialerImportBatches.createdAt))
          .limit(1),
  ]);

  const totals = normalizeTotals(totalRows[0]);
  const trackedSeconds =
    totals.readySeconds +
    totals.talkSeconds +
    totals.ringingSeconds +
    totals.wrapSeconds +
    totals.pausedSeconds +
    totals.idleSeconds;

  const agents = agentRows
    .map((row) => {
      const loginSeconds = numberValue(row.loginSeconds);
      const calls = numberValue(row.calls);
      const talkSeconds = numberValue(row.talkSeconds);
      return {
        id: row.id,
        name: row.status === "deleted" ? `${row.name} (Deleted user)` : row.name,
        email: row.email ?? "Deleted user",
        team: row.team ?? "Unassigned",
        calls,
        loginSeconds,
        talkSeconds,
        readySeconds: numberValue(row.readySeconds),
        ringingSeconds: numberValue(row.ringingSeconds),
        wrapSeconds: numberValue(row.wrapSeconds),
        pausedSeconds: numberValue(row.pausedSeconds),
        idleSeconds: numberValue(row.idleSeconds),
        untrackedSeconds: numberValue(row.untrackedSeconds),
        callsPerHour:
          loginSeconds > 0 ? calls / (loginSeconds / 3600) : 0,
        talkPercentage: toPercentage(talkSeconds, loginSeconds),
        status: row.status,
      };
    })
    .sort((a, b) => b.calls - a.calls);

  const teams = teamRows
    .map((row) => {
      const loginHours = numberValue(row.loginSeconds) / 3600;
      const calls = numberValue(row.calls);
      return {
        team: row.team ?? "Unassigned",
        calls,
        loginHours,
        callsPerHour: loginHours > 0 ? calls / loginHours : 0,
      };
    })
    .sort((a, b) => b.callsPerHour - a.callsPerHour);

  return {
    period,
    totals,
    trend: dailyRows.map((row) => ({
      label: new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(new Date(`${row.date}T00:00:00`)),
      date: row.date,
      calls: numberValue(row.calls),
      loginHours: numberValue(row.loginSeconds) / 3600,
    })),
    hourly: hourlyRows.map((row) => ({
      hour: row.hour,
      label: formatHour(row.hour),
      calls: numberValue(row.calls),
      loginHours: numberValue(row.loginSeconds) / 3600,
    })),
    agents,
    teams,
    health: {
      latestMetricAt: freshnessRows[0]?.latestMetricAt ?? null,
      latestMetricDate: freshnessRows[0]?.latestMetricDate ?? null,
      rowCount: numberValue(freshnessRows[0]?.rowCount),
      trackedSeconds,
      reconciliationSeconds:
        totals.loginSeconds - (trackedSeconds + totals.untrackedSeconds),
      lastImport: lastImportRows[0] ?? null,
    },
  };
}

function formatTotals(row = EMPTY_TOTALS) {
  return [
    { label: "Calls", value: String(row.calls) },
    { label: "Login time", value: secondsToDuration(row.loginSeconds) },
    { label: "Ready time", value: secondsToDuration(row.readySeconds) },
    { label: "Talk time", value: secondsToDuration(row.talkSeconds) },
    { label: "Ringing time", value: secondsToDuration(row.ringingSeconds) },
    { label: "Wrap time", value: secondsToDuration(row.wrapSeconds) },
    { label: "Paused time", value: secondsToDuration(row.pausedSeconds) },
    { label: "Idle time", value: secondsToDuration(row.idleSeconds) },
    { label: "Untracked time", value: secondsToDuration(row.untrackedSeconds) },
  ] satisfies DashboardMetric[];
}

export async function getScopedDashboardMetrics(actor: Actor) {
  const period = resolveDashboardPeriod("month-to-date");
  const data = await getScopedDashboardData(actor, period);
  return formatTotals(data.totals);
}

export async function getScopedAgents(actor: Actor) {
  if (actor.role === "admin") {
    return getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(
        and(
          eq(profiles.role, "agent"),
          eq(profiles.accountStatus, "active"),
          eq(profiles.active, true),
        ),
      );
  }

  if (actor.role === "agent") {
    return getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, actor.id));
  }

  if (actor.teamIds.length === 0) {
    return [];
  }

  return getDb()
    .select({ id: profiles.id, name: profiles.name, email: profiles.email })
    .from(profiles)
    .innerJoin(teamMemberships, eq(teamMemberships.profileId, profiles.id))
    .where(
      and(
        eq(profiles.role, "agent"),
        inArray(teamMemberships.teamId, actor.teamIds),
        isNull(teamMemberships.endedAt),
      ),
    );
}
