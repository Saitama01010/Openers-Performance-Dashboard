import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  profiles,
  teamMemberships,
} from "@/db/schema";
import { resolveProfileScope, type Actor } from "@/auth/authorization";
import { getActiveDialerMetricTotals } from "@/import/active-data";

export type DashboardMetric = {
  label: string;
  value: string;
};

export type DashboardMetricsResult =
  | {
      status: "ACTIVE_IMPORT";
      data: DashboardMetric[];
      datasetScope: {
        importType: string;
        teamIds: string[];
      };
    }
  | {
      status: "NO_ACTIVE_IMPORT";
      data: null;
      datasetScope: {
        importType: string;
        teamIds: string[];
      };
    };

const EMPTY_TOTALS = {
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

function secondsToDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export async function getScopedDashboardMetrics(actor: Actor) {
  const datasetScope = {
    importType: "agent_hours_performance",
    teamIds: actor.role === "manager" ? actor.teamIds : [],
  };
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
  const scopedProfileIds = resolveProfileScope(actor, managerProfileIds);

  if (scopedProfileIds?.length === 0) {
    return {
      status: "NO_ACTIVE_IMPORT",
      data: null,
      datasetScope,
    } satisfies DashboardMetricsResult;
  }

  const row = await getActiveDialerMetricTotals(scopedProfileIds);

  if (Number(row?.activeScopeCount ?? 0) === 0) {
    return {
      status: "NO_ACTIVE_IMPORT",
      data: null,
      datasetScope,
    } satisfies DashboardMetricsResult;
  }

  return {
    status: "ACTIVE_IMPORT",
    data: formatTotals(row),
    datasetScope,
  } satisfies DashboardMetricsResult;
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
