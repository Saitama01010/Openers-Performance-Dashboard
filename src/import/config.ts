export const DIALER_IMPORT_TYPE = "agent_hours_performance";
export const DIALER_STORAGE_PROVIDER = "database";

export const MAX_DIALER_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_DIALER_CSV_ROWS = 50_000;

export const IMPORT_REASON_MIN_LENGTH = 5;

export const IMPORT_ANOMALY_THRESHOLDS = {
  agentCountDecreasePercent: 20,
  totalLoginDecreasePercent: 30,
  totalCallsDecreasePercent: 30,
  totalMetricIncreasePercent: 200,
  unmatchedAgentPercent: 10,
  maximumLoginSecondsPerRow: 24 * 60 * 60,
  maximumLoginSecondsPerAgentDay: 24 * 60 * 60,
} as const;

export const IMPORT_INSERT_CHUNK_SIZE = 400;

export const IMPORT_RETENTION_POLICY = {
  minimumValidHistoricalVersionsPerScope: 2,
  failedImportDays: 30,
  rejectedImportDays: 30,
  automaticallyDeleteSupersededImports: false,
  rawCsvRetentionDays: null,
} as const;
