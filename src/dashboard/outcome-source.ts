import "server-only";

import type { Actor } from "@/auth/authorization";
import type { DashboardDateWindow } from "@/dashboard/date-range";
import {
  isTimestampInShift,
  type CompletedShiftWindow,
} from "@/dashboard/shift-coverage";
import { listMatchableUsers } from "@/leaderboard/data";
import {
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv,
} from "@/leaderboard/transfers";
import type { NormalizedClosedDeal } from "@/sheets/contracts";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

type ReadySource = Awaited<ReturnType<typeof ingestAndMatchLeaderboardSources>>;

export type RoleDashboardOutcomeSource =
  | { status: "unavailable"; message: string; timeZone: string }
  | {
      status: "partial";
      message: string;
      timeZone: string;
      transferMatches: Extract<ReadySource, { status: "closed_error" }>["transferMatches"];
      transferDiagnostics: number;
      stale: boolean;
    }
  | {
      status: "ready";
      timeZone: string;
      transferMatches: Extract<ReadySource, { status: "ready" }>["transferMatches"];
      closedRecords: NormalizedClosedDeal[];
      transferDiagnostics: number;
      closedDiagnostics: number;
      fetchedAt: string;
      stale: boolean;
    };

export async function loadRoleDashboardOutcomeSource(
  actor: Actor,
): Promise<RoleDashboardOutcomeSource> {
  const config = transferSheetConfigFromEnv();
  if (!config) {
    return {
      status: "unavailable",
      message: "The Transfers and Closed worksheet source is not configured.",
      timeZone: "Africa/Cairo",
    };
  }
  try {
    const ingestion = await ingestAndMatchLeaderboardSources(
      listMatchableUsers(actor),
      config,
    );
    if (ingestion.status === "unconfigured") {
      return { status: "unavailable", message: ingestion.message, timeZone: config.timeZone };
    }
    if (ingestion.status === "closed_error") {
      return {
        status: "partial",
        message: ingestion.message,
        timeZone: ingestion.timeZone,
        transferMatches: ingestion.transferMatches,
        transferDiagnostics: ingestion.transferDiagnostics.length,
        stale: ingestion.stale,
      };
    }
    return {
      status: "ready",
      timeZone: ingestion.timeZone,
      transferMatches: ingestion.transferMatches,
      closedRecords: ingestion.closedRecords,
      transferDiagnostics: ingestion.transferDiagnostics.length,
      closedDiagnostics: ingestion.closedDiagnostics.length,
      fetchedAt: ingestion.fetchedAt,
      stale: ingestion.stale,
    };
  } catch {
    return {
      status: "unavailable",
      message: "The Transfers and Closed worksheet source could not be loaded.",
      timeZone: config.timeZone,
    };
  }
}

type OutcomePeriod =
  | { kind: "date"; window: DashboardDateWindow }
  | { kind: "shift"; window: CompletedShiftWindow };

function timestampMatches(timestamp: Date, period: OutcomePeriod, timeZone: string) {
  if (period.kind === "shift") return isTimestampInShift(timestamp, period.window, timeZone);
  const key = dateKeyInTimeZone(timestamp, timeZone);
  return (!period.window.from || key >= period.window.from) && (!period.window.to || key <= period.window.to);
}

function increment(map: Map<string, number>, id: string) {
  map.set(id, (map.get(id) ?? 0) + 1);
}

export function outcomeSnapshot(
  source: RoleDashboardOutcomeSource,
  period: OutcomePeriod,
  allowedAgentIds?: ReadonlySet<string>,
) {
  const transferByAgent = new Map<string, number>();
  const closedByAgent = new Map<string, number>();
  if (source.status !== "unavailable") {
    for (const match of source.transferMatches) {
      if (
        match.status === "matched" &&
        match.transfer.occurredAt &&
        (!allowedAgentIds || allowedAgentIds.has(match.user.id)) &&
        timestampMatches(match.transfer.occurredAt, period, source.timeZone)
      ) {
        increment(transferByAgent, match.user.id);
      }
    }
  }
  if (source.status === "ready") {
    for (const deal of source.closedRecords) {
      if (
        deal.matchStatus === "matched" &&
        deal.matchedUserId &&
        deal.timestamp &&
        (!allowedAgentIds || allowedAgentIds.has(deal.matchedUserId)) &&
        timestampMatches(deal.timestamp, period, source.timeZone)
      ) {
        increment(closedByAgent, deal.matchedUserId);
      }
    }
  }
  const transfers = source.status === "unavailable"
    ? { status: "unavailable" as const, value: null }
    : { status: "ready" as const, value: Array.from(transferByAgent.values()).reduce((a, b) => a + b, 0) };
  const closedDeals = source.status !== "ready"
    ? { status: "unavailable" as const, value: null }
    : { status: "ready" as const, value: Array.from(closedByAgent.values()).reduce((a, b) => a + b, 0) };
  return { transfers, closedDeals, transferByAgent, closedByAgent };
}
