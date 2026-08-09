import "server-only";

import { createHash } from "node:crypto";

import { getEnv } from "@/env";
import { logOperationalEvent, logServerError } from "@/lib/logging";
import {
  matchClosedDealsToUsers,
  matchTransfersToUsers,
  type MatchableUser,
} from "@/leaderboard/matching";
import type { AppsScriptLeaderboardSources } from "@/sheets/transfers";
import {
  GoogleAppsScriptTransfersProvider,
  type TransferSheetConfig,
} from "@/sheets/transfers";

const SOURCE_CACHE_TTL_MS = 3 * 60 * 1000;
const SOURCE_CACHE_MAX_ENTRIES = 8;

type CachedSources = {
  sources: AppsScriptLeaderboardSources;
  fetchedAt: string;
  expiresAt: number;
};

type SourceCacheEntry = {
  current: CachedSources | null;
  lastFullyReady: CachedSources | null;
  inFlight: Promise<CachedSources> | null;
};

const sourceCache = new Map<string, SourceCacheEntry>();

function sourceCacheKey(config: TransferSheetConfig) {
  return createHash("sha256")
    .update(`${config.endpointUrl}\u001f${config.secret}\u001f${config.timeZone}`)
    .digest("hex");
}

function cacheEntry(config: TransferSheetConfig) {
  const key = sourceCacheKey(config);
  const existing = sourceCache.get(key);
  if (existing) {
    sourceCache.delete(key);
    sourceCache.set(key, existing);
    return existing;
  }
  if (sourceCache.size >= SOURCE_CACHE_MAX_ENTRIES) {
    const evictable = Array.from(sourceCache.entries()).find(
      ([, entry]) => entry.inFlight === null,
    );
    if (evictable) sourceCache.delete(evictable[0]);
  }
  const created: SourceCacheEntry = {
    current: null,
    lastFullyReady: null,
    inFlight: null,
  };
  sourceCache.set(key, created);
  return created;
}

async function fetchSources(
  config: TransferSheetConfig,
  entry: SourceCacheEntry,
) {
  if (entry.inFlight) return entry.inFlight;

  const provider = new GoogleAppsScriptTransfersProvider(config);
  const startedAt = Date.now();
  entry.inFlight = provider
    .listSources()
    .then((sources) => {
      const fetchedAt = new Date().toISOString();
      const cached = {
        sources,
        fetchedAt,
        expiresAt: Date.now() + SOURCE_CACHE_TTL_MS,
      };
      entry.current = cached;
      if (sources.closed.status === "ready") {
        entry.lastFullyReady = cached;
      }
      logOperationalEvent({
        action: "sheets.refresh_completed",
        durationMs: Date.now() - startedAt,
        details: {
          transferRows: sources.transfers.records.length,
          closedStatus: sources.closed.status,
        },
      });
      return cached;
    })
    .catch((error) => {
      logServerError({
        action: "sheets.refresh_failed",
        category: "upstream_failure",
        error,
      });
      throw error;
    })
    .finally(() => {
      entry.inFlight = null;
    });

  return entry.inFlight;
}

export async function loadLeaderboardSources(
  config: TransferSheetConfig,
  options: { forceRefresh?: boolean } = {},
) {
  const entry = cacheEntry(config);
  if (
    !options.forceRefresh &&
    entry.current &&
    entry.current.expiresAt > Date.now()
  ) {
    return { ...entry.current, stale: false as const };
  }

  try {
    const fresh = await fetchSources(config, entry);
    return { ...fresh, stale: false as const };
  } catch (error) {
    if (entry.lastFullyReady) {
      logOperationalEvent({
        action: "sheets.stale_fallback",
        details: { cachedAt: entry.lastFullyReady.fetchedAt },
      });
      return {
        ...entry.lastFullyReady,
        stale: true as const,
        refreshError:
          error instanceof Error
            ? error.message
            : "The source refresh failed.",
      };
    }
    throw error;
  }
}

export function invalidateLeaderboardSourceCache() {
  for (const entry of sourceCache.values()) {
    if (entry.current) entry.current.expiresAt = 0;
  }
}

export function resetLeaderboardSourceCacheForTests() {
  sourceCache.clear();
}

export function transferSheetConfigFromEnv(): TransferSheetConfig | null {
  const env = getEnv();
  if (
    !env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL ||
    !env.LEADERBOARD_API_SECRET
  ) {
    return null;
  }
  return {
    endpointUrl: env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL,
    secret: env.LEADERBOARD_API_SECRET,
    timeZone: env.GOOGLE_SHEETS_TIMEZONE,
  };
}

export async function ingestAndMatchTransfers(
  users:
    | readonly MatchableUser[]
    | Promise<readonly MatchableUser[]>,
  config = transferSheetConfigFromEnv(),
  options: { forceRefresh?: boolean } = {},
) {
  if (!config) {
    return {
      status: "unconfigured" as const,
      message: "The Google Sheet transfer source has not been configured.",
    };
  }

  const [sourceResult, resolvedUsers] = await Promise.all([
    loadLeaderboardSources(config, options),
    Promise.resolve(users),
  ]);
  const matches = matchTransfersToUsers(
    sourceResult.sources.transfers.records,
    resolvedUsers,
  );

  return {
    status: "ready" as const,
    timeZone: config.timeZone,
    records: sourceResult.sources.transfers.records,
    matches: matches.results,
    diagnostics: [
      ...sourceResult.sources.transfers.diagnostics,
      ...matches.diagnostics,
    ],
    duplicateAmericanNames: matches.duplicateAmericanNames,
    stale: sourceResult.stale,
    fetchedAt: sourceResult.fetchedAt,
  };
}

export async function ingestAndMatchLeaderboardSources(
  users:
    | readonly MatchableUser[]
    | Promise<readonly MatchableUser[]>,
  config = transferSheetConfigFromEnv(),
  options: { forceRefresh?: boolean } = {},
) {
  if (!config) {
    return {
      status: "unconfigured" as const,
      message: "The Google Sheet transfer source has not been configured.",
    };
  }

  const [sourceResult, resolvedUsers] = await Promise.all([
    loadLeaderboardSources(config, options),
    Promise.resolve(users),
  ]);
  const transferMatches = matchTransfersToUsers(
    sourceResult.sources.transfers.records,
    resolvedUsers,
  );
  const closedSource = sourceResult.sources.closed;

  if (closedSource.status === "source_error") {
    return {
      status: "closed_error" as const,
      message: closedSource.message,
      errorKind: closedSource.kind,
      headerValidationStatus: closedSource.headerValidationStatus,
      timeZone: config.timeZone,
      transferRecords: sourceResult.sources.transfers.records,
      transferMatches: transferMatches.results,
      transferDiagnostics: [
        ...sourceResult.sources.transfers.diagnostics,
        ...transferMatches.diagnostics,
      ],
      stale: sourceResult.stale,
      fetchedAt: sourceResult.fetchedAt,
    };
  }

  const closedMatches = matchClosedDealsToUsers(
    closedSource.data.records,
    resolvedUsers,
  );
  return {
    status: "ready" as const,
    timeZone: config.timeZone,
    users: resolvedUsers,
    transferRecords: sourceResult.sources.transfers.records,
    transferMatches: transferMatches.results,
    transferDiagnostics: [
      ...sourceResult.sources.transfers.diagnostics,
      ...transferMatches.diagnostics,
    ],
    closedRecords: closedMatches.records,
    closedDiagnostics: [
      ...closedSource.data.diagnostics,
      ...closedMatches.diagnostics,
    ],
    closedGeneratedAt: closedSource.data.generatedAt,
    totalNonEmptyClosedRows: closedSource.data.totalNonEmptyRows,
    duplicateAmericanNames: closedMatches.duplicateAmericanNames,
    stale: sourceResult.stale,
    fetchedAt: sourceResult.fetchedAt,
  };
}
