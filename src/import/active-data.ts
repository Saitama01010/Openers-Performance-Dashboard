import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  profiles,
} from "@/db/schema";
import type { ComparableMetric } from "@/import/versioning";
import { activeProfileWhere } from "@/users/visibility";

export type ActiveDialerMetric = ComparableMetric & {
  rowHash: string;
  scopeKey: string;
};

export async function listActiveDialerMetrics() {
  const rows = await getDb()
    .select({
      scopeKey: dialerDatasetScopes.scopeKey,
      source: dialerAgentHourlyMetrics.source,
      sourceAgentName: dialerAgentHourlyMetrics.sourceAgentName,
      agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
      granularity: dialerAgentHourlyMetrics.granularity,
      metricDate: dialerAgentHourlyMetrics.metricDate,
      metricHour: dialerAgentHourlyMetrics.metricHour,
      metricKey: dialerAgentHourlyMetrics.metricKey,
      calls: dialerAgentHourlyMetrics.calls,
      loggedInSeconds: dialerAgentHourlyMetrics.loggedInSeconds,
      readySeconds: dialerAgentHourlyMetrics.readySeconds,
      talkSeconds: dialerAgentHourlyMetrics.talkSeconds,
      ringingSeconds: dialerAgentHourlyMetrics.ringingSeconds,
      wrapSeconds: dialerAgentHourlyMetrics.wrapSeconds,
      pausedSeconds: dialerAgentHourlyMetrics.pausedSeconds,
      systemPauseSeconds: dialerAgentHourlyMetrics.systemPauseSeconds,
      netSeconds: dialerAgentHourlyMetrics.netSeconds,
      idleSeconds: dialerAgentHourlyMetrics.idleSeconds,
      untrackedSeconds: dialerAgentHourlyMetrics.untrackedSeconds,
      teamIdSnapshot: dialerAgentHourlyMetrics.teamIdSnapshot,
      teamNameSnapshot: dialerAgentHourlyMetrics.teamNameSnapshot,
      rowHash: dialerAgentHourlyMetrics.rowHash,
    })
    .from(dialerAgentHourlyMetrics)
    .innerJoin(
      dialerDatasetScopes,
      eq(
        dialerDatasetScopes.activeVersionId,
        dialerAgentHourlyMetrics.versionId,
      ),
    )
    .innerJoin(
      profiles,
      eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId),
    )
    .where(and(activeProfileWhere(), eq(profiles.role, "agent")));

  return rows.map((row) => ({
    ...row,
    metricDate: String(row.metricDate),
  })) satisfies ActiveDialerMetric[];
}

export async function getActiveDialerMetricTotals(
  scopedProfileIds: string[] | undefined,
) {
  const where =
    scopedProfileIds && scopedProfileIds.length > 0
      ? inArray(dialerAgentHourlyMetrics.agentProfileId, scopedProfileIds)
      : undefined;
  const [row] = await getDb()
    .select({
      calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
      loginSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
      readySeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.readySeconds}), 0)`,
      talkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
      ringingSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.ringingSeconds})`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
      systemPauseSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.systemPauseSeconds})`,
      netSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.netSeconds})`,
      idleSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.idleSeconds})`,
      untrackedSeconds: sql<number | null>`sum(${dialerAgentHourlyMetrics.untrackedSeconds})`,
      activeScopeCount: sql<number>`count(distinct ${dialerDatasetScopes.scopeKey})`,
    })
    .from(dialerAgentHourlyMetrics)
    .innerJoin(
      dialerDatasetScopes,
      eq(
        dialerDatasetScopes.activeVersionId,
        dialerAgentHourlyMetrics.versionId,
      ),
    )
    .innerJoin(
      profiles,
      eq(profiles.id, dialerAgentHourlyMetrics.agentProfileId),
    )
    .where(and(where, activeProfileWhere(), eq(profiles.role, "agent")));

  return row;
}
