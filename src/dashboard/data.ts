import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  profiles,
  teamMemberships,
} from "@/db/schema";
import { resolveProfileScope, type Actor } from "@/auth/authorization";

export type DashboardMetric = {
  label: string;
  value: string;
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
    return formatTotals();
  }

  const where =
    scopedProfileIds && scopedProfileIds.length > 0
      ? inArray(dialerAgentHourlyMetrics.agentProfileId, scopedProfileIds)
      : undefined;

  const rows = await getDb()
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
    .where(where);
  const row = rows[0];

  return formatTotals(row);
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
