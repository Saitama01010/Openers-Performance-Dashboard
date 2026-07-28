import "server-only";

import { inArray, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
} from "@/db/schema";
import type { ComparableMetric } from "@/import/versioning";

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
      metricDate: dialerAgentHourlyMetrics.metricDate,
      metricHour: dialerAgentHourlyMetrics.metricHour,
      calls: dialerAgentHourlyMetrics.calls,
      loggedInSeconds: dialerAgentHourlyMetrics.loggedInSeconds,
      readySeconds: dialerAgentHourlyMetrics.readySeconds,
      talkSeconds: dialerAgentHourlyMetrics.talkSeconds,
      ringingSeconds: dialerAgentHourlyMetrics.ringingSeconds,
      wrapSeconds: dialerAgentHourlyMetrics.wrapSeconds,
      pausedSeconds: dialerAgentHourlyMetrics.pausedSeconds,
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
    );

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
      ringingSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.ringingSeconds}), 0)`,
      wrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
      pausedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.pausedSeconds}), 0)`,
      idleSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.idleSeconds}), 0)`,
      untrackedSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.untrackedSeconds}), 0)`,
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
    .where(where);

  return row;
}
