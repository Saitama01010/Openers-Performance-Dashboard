import { createHash } from "crypto";
import { parse } from "csv-parse/sync";

import { canImportForProfile, type Actor } from "@/auth/authorization";
import {
  formatDurationSeconds,
  formatNumber,
  formatRatio,
} from "@/import/format";

export const HOURLY_DIALER_HEADERS = [
  "agent",
  "date",
  "hour",
  "calls",
  "logged_in_seconds",
  "ready_seconds",
  "talk_seconds",
  "ringing_seconds",
  "wrap_seconds",
  "paused_seconds",
  "idle_seconds",
  "untracked_seconds",
] as const;

export const AGENT_HOURS_DAILY_HEADERS = [
  "agent",
  "logged_in_seconds",
  "ready_seconds",
  "talk_seconds",
  "wrap_seconds",
  "paused_seconds",
  "system_pause_seconds",
  "net_seconds",
  "calls",
] as const;

export const REQUIRED_DIALER_HEADERS = HOURLY_DIALER_HEADERS;

export type ImportGranularity = "hourly" | "daily";
export type DialerHeader =
  | (typeof HOURLY_DIALER_HEADERS)[number]
  | (typeof AGENT_HOURS_DAILY_HEADERS)[number];

export const DIALER_HEADER_ALIASES: Record<string, DialerHeader> = {
  agent: "agent",
  date: "date",
  hour: "hour",
  calls: "calls",
  "logged in": "logged_in_seconds",
  "logged in (sec)": "logged_in_seconds",
  logged_in_seconds: "logged_in_seconds",
  login_time: "logged_in_seconds",
  ready: "ready_seconds",
  "ready (sec)": "ready_seconds",
  ready_seconds: "ready_seconds",
  ready_time: "ready_seconds",
  talk: "talk_seconds",
  "talk (sec)": "talk_seconds",
  talk_seconds: "talk_seconds",
  talk_time: "talk_seconds",
  ringing: "ringing_seconds",
  "ringing (sec)": "ringing_seconds",
  ringing_seconds: "ringing_seconds",
  ringing_time: "ringing_seconds",
  wrap: "wrap_seconds",
  "wrap (sec)": "wrap_seconds",
  wrap_seconds: "wrap_seconds",
  wrap_time: "wrap_seconds",
  paused: "paused_seconds",
  "paused (sec)": "paused_seconds",
  paused_seconds: "paused_seconds",
  paused_time: "paused_seconds",
  "system pause": "system_pause_seconds",
  "system pause (sec)": "system_pause_seconds",
  system_pause_seconds: "system_pause_seconds",
  net: "net_seconds",
  "net (sec)": "net_seconds",
  net_seconds: "net_seconds",
  idle: "idle_seconds",
  "idle (sec)": "idle_seconds",
  idle_seconds: "idle_seconds",
  idle_time: "idle_seconds",
  untracked: "untracked_seconds",
  "untracked (sec)": "untracked_seconds",
  untracked_seconds: "untracked_seconds",
  untracked_time: "untracked_seconds",
};

export type DurationTotals = {
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number | null;
  wrapSeconds: number;
  pausedSeconds: number;
  systemPauseSeconds: number | null;
  netSeconds: number | null;
  idleSeconds: number | null;
  untrackedSeconds: number | null;
};

export type DerivedPerformanceMetrics = {
  talkPercentage: number | null;
  readyPercentage: number | null;
  wrapPercentage: number | null;
  pausedPercentage: number | null;
  idlePercentage: number | null;
  callsPerLoggedInHour: number | null;
};

export type AgentMappingStatus =
  | "mapped"
  | "unmapped"
  | "out_of_scope"
  | "invalid_mapping";

export type ImportRowStatus =
  | "new"
  | "changed"
  | "unchanged"
  | "invalid"
  | "unknown"
  | "out_of_scope";

export type RowClassificationTotals = Record<ImportRowStatus, number>;

export type HourlyPreviewRow = {
  rowNumber: number;
  agentKey: string;
  dialerAgentName: string;
  date: string | null;
  hour: number | null;
  granularity: ImportGranularity;
  calls: number | null;
  durations: DurationTotals | null;
  status: ImportRowStatus;
  validationMessage?: string;
  warningMessage?: string;
  importable: boolean;
  rawRow: Record<string, string>;
};

export type AgentPreviewSummary = {
  agentKey: string;
  dialerAgentName: string;
  mappingStatus: AgentMappingStatus;
  dashboardUserId: string | null;
  dashboardUserName: string | null;
  teamNames: string[];
  accountStatus?:
    | "invited"
    | "active"
    | "deactivated"
    | "revoked"
    | "deleted";
  warningMessage?: string;
  granularity: ImportGranularity;
  csvRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  calls: number;
  durations: DurationTotals;
  performance: DerivedPerformanceMetrics;
  rowCounts: RowClassificationTotals;
  importStatus: string;
  hourlyRows: HourlyPreviewRow[];
  calculationDetails: {
    hourlyRowsIncluded: number;
    invalidRowsExcluded: number;
    earliestDateHour: string | null;
    latestDateHour: string | null;
    formulas: string[];
    rawTotalsSeconds: DurationTotals;
    formattedTotals: Record<keyof DurationTotals, string>;
    decimalHours: Record<keyof DurationTotals, string>;
    rowClassificationTotals: RowClassificationTotals;
    callsPerLoggedInHourFormula: string;
  };
};

export type FilePreviewSummary = {
  totalCsvRows: number;
  uniqueAgentsDetected: number;
  uniqueMappedAgents: number;
  uniqueUnmappedAgents: number;
  uniqueOutOfScopeAgents: number;
  uniqueInvalidMappingAgents: number;
  unknownRows: number;
  newRows: number;
  changedRows: number;
  unchangedRows: number;
  invalidRows: number;
  invalidMappedRows: number;
  outOfScopeRows: number;
  eligibleMappedRows: number;
  mappedRowsToImport: number;
  unmappedRowsToSkip: number;
  outOfScopeRowsToSkip: number;
  unchangedRowsToSkip: number;
  skippedRows: number;
  includedValidRows: number;
  excludedInvalidRows: number;
  mappedValidRows: number;
  unmappedValidRows: number;
  outOfScopeValidRows: number;
  totalCalls: number;
  durationTotals: DurationTotals;
  duplicateFile: boolean;
  detectedHeaders: string[];
  missingRequiredHeaders: string[];
};

export type DialerMetricInput = {
  source: string;
  sourceAgentName: string;
  agentProfileId: string;
  granularity: ImportGranularity;
  metricDate: string;
  metricHour: number | null;
  metricKey: string;
  calls: number;
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number | null;
  wrapSeconds: number;
  pausedSeconds: number;
  systemPauseSeconds: number | null;
  netSeconds: number | null;
  idleSeconds: number | null;
  untrackedSeconds: number | null;
  teamIdSnapshot: string | null;
  teamNameSnapshot: string | null;
};

export type ExistingDialerMetric = Pick<
  DialerMetricInput,
  | "source"
  | "agentProfileId"
  | "granularity"
  | "metricDate"
  | "metricHour"
  | "metricKey"
> & {
  rowHash: string;
};

export type SourceMapping = {
  sourceAgentName: string;
  profileId: string;
  profileName: string;
  teamIds: string[];
  teamNames: string[];
  accountStatus?:
    | "invited"
    | "active"
    | "deactivated"
    | "revoked"
    | "deleted";
};

export type ImportPreviewRow = HourlyPreviewRow & {
  metric?: DialerMetricInput;
  rowHash?: string;
};

export type ImportPreview = {
  granularity: ImportGranularity | null;
  selectedReportingDate: string | null;
  filenameRange: AgentHoursFilenameRange | null;
  fileHash: string;
  duplicateFile: boolean;
  parseError?: string;
  headers: string[];
  missingHeaders: string[];
  totalCsvRows: number;
  mappedAgents: string[];
  unmappedAgents: string[];
  rows: ImportPreviewRow[];
  summary: RowClassificationTotals;
  fileSummary: FilePreviewSummary;
  agents: AgentPreviewSummary[];
};

export type AgentHoursFilenameRange = {
  startDate: string;
  endDate: string;
  multiDay: boolean;
};

type ParsedCsvMetric = {
  sourceAgentName: string;
  agentKey: string;
  granularity: ImportGranularity;
  metricDate: string;
  metricHour: number | null;
  metricKey: string;
  calls: number;
  durations: DurationTotals;
};

type ParseCsvMetricResult =
  | { metric: ParsedCsvMetric }
  | { error: string; sourceAgentName: string; agentKey: string };

type AgentBuilder = {
  agentKey: string;
  dialerAgentName: string;
  mappingStatus: AgentMappingStatus;
  dashboardUserId: string | null;
  dashboardUserName: string | null;
  teamNames: string[];
  accountStatus?:
    | "invited"
    | "active"
    | "deactivated"
    | "revoked"
    | "deleted";
  warningMessage?: string;
  granularity: ImportGranularity;
  csvRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  earliest: string | null;
  latest: string | null;
  calls: number;
  durations: DurationTotals;
  rowCounts: RowClassificationTotals;
  sourceRows: ImportPreviewRow[];
};

type MappingLookup =
  | { status: "mapped"; mapping: SourceMapping }
  | { status: "invalid_mapping"; mappings: SourceMapping[] };

const DURATION_KEYS = [
  "loggedInSeconds",
  "readySeconds",
  "talkSeconds",
  "ringingSeconds",
  "wrapSeconds",
  "pausedSeconds",
  "systemPauseSeconds",
  "netSeconds",
  "idleSeconds",
  "untrackedSeconds",
] as const satisfies (keyof DurationTotals)[];

export function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeDialerHeader(header: string) {
  const normalized = header
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*sec\s*\)$/i, " (sec)")
    .toLowerCase();

  return DIALER_HEADER_ALIASES[normalized] ?? normalized;
}

export function normalizeAgentName(name: string | undefined) {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function displayAgentName(name: string | undefined) {
  const displayName = (name ?? "").trim().replace(/\s+/g, " ");

  return displayName.length > 0 ? displayName : "(missing agent)";
}

export function detectDialerGranularity(headers: string[]) {
  const normalized = new Set(headers.map(normalizeDialerHeader));

  if (normalized.has("date") || normalized.has("hour")) {
    return "hourly" as const;
  }

  if (
    normalized.has("system_pause_seconds") ||
    normalized.has("net_seconds") ||
    normalized.has("agent")
  ) {
    return "daily" as const;
  }

  return null;
}

export function validateDialerHeaders(
  headers: string[],
  granularity = detectDialerGranularity(headers),
) {
  const required =
    granularity === "daily"
      ? AGENT_HOURS_DAILY_HEADERS
      : HOURLY_DIALER_HEADERS;

  return required.filter((header) => !headers.includes(header));
}

export function inspectDialerCsvFormat(fileContent: string) {
  try {
    const [headers = []] = parse(fileContent, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      to_line: 1,
      trim: true,
    }) as string[][];
    const detectedHeaders = headers.map((header) =>
      header.replace(/^\uFEFF/, "").trim(),
    );
    const granularity = detectDialerGranularity(detectedHeaders);

    return {
      detectedHeaders,
      granularity,
      missingHeaders: validateDialerHeaders(
        detectedHeaders.map(normalizeDialerHeader),
        granularity,
      ),
    };
  } catch {
    return {
      detectedHeaders: [],
      granularity: null,
      missingHeaders: [...HOURLY_DIALER_HEADERS],
    };
  }
}

export function parseAgentHoursFilenameRange(
  fileName: string,
): AgentHoursFilenameRange | null {
  const match =
    /^agent-hours_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})(?: \([1-9]\d*\))?\.csv$/i.exec(
      fileName.trim(),
    );

  if (!match) {
    return null;
  }

  const startDate = parseDialerDate(match[1]);
  const endDate = parseDialerDate(match[2]);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  return {
    startDate,
    endDate,
    multiDay: startDate !== endDate,
  };
}

export function getImportConfirmationBlockReasons(preview: ImportPreview) {
  const reasons: string[] = [];
  const mappedRowsToImport = preview.fileSummary.mappedRowsToImport;

  if (preview.missingHeaders.length > 0) {
    reasons.push(
      `Missing required CSV headers: ${preview.missingHeaders.join(", ")}`,
    );
  }

  if (preview.duplicateFile && mappedRowsToImport === 0) {
    reasons.push("Duplicate file blocked.");
  }

  if (preview.fileSummary.uniqueInvalidMappingAgents > 0) {
    reasons.push(
      `${preview.fileSummary.uniqueInvalidMappingAgents} dialer agent(s) have invalid mappings.`,
    );
  }

  if (preview.fileSummary.invalidMappedRows > 0) {
    reasons.push(
      `${preview.fileSummary.invalidMappedRows} invalid mapped row(s) must be resolved before import.`,
    );
  }

  if (mappedRowsToImport === 0) {
    reasons.push("No mapped new or changed rows exist.");
  }

  return reasons;
}

export function getImportConfirmationBlockReason(preview: ImportPreview) {
  const reasons = getImportConfirmationBlockReasons(preview);

  return reasons.length > 0 ? reasons.join(" ") : null;
}

export function hourlyKey(
  metric: Pick<
    DialerMetricInput,
    "source" | "agentProfileId" | "metricDate" | "metricHour"
  > &
    Partial<Pick<DialerMetricInput, "granularity" | "metricKey">>,
) {
  const granularity =
    metric.granularity ?? (metric.metricHour === null ? "daily" : "hourly");

  return granularity === "daily"
    ? `${metric.source}:${metric.agentProfileId}:${metric.metricDate}:daily`
    : `${metric.source}:${metric.agentProfileId}:${metric.metricDate}:${metric.metricHour}`;
}

export function metricKeyFor(
  granularity: ImportGranularity,
  metricHour: number | null,
) {
  return granularity === "daily"
    ? "daily"
    : `hour:${String(metricHour).padStart(2, "0")}`;
}

export function metricRowHash(metric: DialerMetricInput) {
  return sha256(
    JSON.stringify({
      granularity: metric.granularity,
      metricDate: metric.metricDate,
      metricKey: metric.metricKey,
      calls: metric.calls,
      loggedInSeconds: metric.loggedInSeconds,
      readySeconds: metric.readySeconds,
      talkSeconds: metric.talkSeconds,
      ringingSeconds: metric.ringingSeconds,
      wrapSeconds: metric.wrapSeconds,
      pausedSeconds: metric.pausedSeconds,
      systemPauseSeconds: metric.systemPauseSeconds,
      netSeconds: metric.netSeconds,
      idleSeconds: metric.idleSeconds,
      untrackedSeconds: metric.untrackedSeconds,
    }),
  );
}

function emptyDurations(): DurationTotals {
  return {
    loggedInSeconds: 0,
    readySeconds: 0,
    talkSeconds: 0,
    ringingSeconds: null,
    wrapSeconds: 0,
    pausedSeconds: 0,
    systemPauseSeconds: null,
    netSeconds: null,
    idleSeconds: null,
    untrackedSeconds: null,
  };
}

function emptySummary(): RowClassificationTotals {
  return {
    new: 0,
    changed: 0,
    unchanged: 0,
    invalid: 0,
    unknown: 0,
    out_of_scope: 0,
  };
}

function addDurations(target: DurationTotals, source: DurationTotals) {
  for (const key of DURATION_KEYS) {
    const sourceValue = source[key];

    if (sourceValue === null) {
      continue;
    }

    target[key] = (target[key] ?? 0) + sourceValue;
  }
}

function normalizeSeconds(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{1,3}:\d{2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes, seconds] = trimmed.split(":").map(Number);
    if (minutes > 59 || seconds > 59) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  return null;
}

function parseNonNegativeInteger(value: string | undefined) {
  const trimmed = (value ?? "").trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function normalizeDateParts(year: number, month: number, day: number) {
  if (year < 1) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function parseDialerHour(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  const integerMatch = /^(\d{1,2})$/.exec(trimmed);
  const wholeHourMatch = /^(\d{1,2}):00$/.exec(trimmed);
  const hour = Number(integerMatch?.[1] ?? wholeHourMatch?.[1]);

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function parseDialerDate(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (isoMatch) {
    return normalizeDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);

  if (slashMatch) {
    return normalizeDateParts(
      Number(slashMatch[3]),
      Number(slashMatch[1]),
      Number(slashMatch[2]),
    );
  }

  return null;
}

function parseCsvMetric(
  row: Record<string, string>,
  granularity: ImportGranularity,
  selectedReportingDate: string | null,
): ParseCsvMetricResult {
  const sourceAgentName = displayAgentName(row.agent);
  const agentKey = normalizeAgentName(row.agent);
  const metricDate =
    granularity === "daily"
      ? selectedReportingDate
      : parseDialerDate(row.date);
  const metricHour =
    granularity === "daily" ? null : parseDialerHour(row.hour);
  const calls = parseNonNegativeInteger(row.calls);

  if (agentKey.length === 0) {
    return {
      error: "Missing agent name.",
      sourceAgentName,
      agentKey: `missing-agent:${sourceAgentName}`,
    };
  }

  if (!metricDate) {
    return {
      error:
        granularity === "daily"
          ? "Choose the reporting date represented by this Agent Hours file."
          : "Invalid date. Expected YYYY-MM-DD or M/D/YYYY.",
      sourceAgentName,
      agentKey,
    };
  }

  if (granularity === "hourly" && metricHour === null) {
    return {
      error: "Invalid hour. Expected 0-23 or H:00/HH:00 on the hour.",
      sourceAgentName,
      agentKey,
    };
  }

  if (calls === null) {
    return {
      error: "Invalid calls. Expected a non-negative integer.",
      sourceAgentName,
      agentKey,
    };
  }

  const durations = {
    loggedInSeconds: normalizeSeconds(row.logged_in_seconds),
    readySeconds: normalizeSeconds(row.ready_seconds),
    talkSeconds: normalizeSeconds(row.talk_seconds),
    ringingSeconds:
      granularity === "hourly"
        ? normalizeSeconds(row.ringing_seconds)
        : null,
    wrapSeconds: normalizeSeconds(row.wrap_seconds),
    pausedSeconds: normalizeSeconds(row.paused_seconds),
    systemPauseSeconds:
      granularity === "daily"
        ? normalizeSeconds(row.system_pause_seconds)
        : null,
    netSeconds:
      granularity === "daily" ? normalizeSeconds(row.net_seconds) : null,
    idleSeconds:
      granularity === "hourly" ? normalizeSeconds(row.idle_seconds) : null,
    untrackedSeconds:
      granularity === "hourly"
        ? normalizeSeconds(row.untracked_seconds)
        : null,
  };
  const requiredDurationKeys: (keyof DurationTotals)[] =
    granularity === "daily"
      ? [
          "loggedInSeconds",
          "readySeconds",
          "talkSeconds",
          "wrapSeconds",
          "pausedSeconds",
          "systemPauseSeconds",
          "netSeconds",
        ]
      : [
          "loggedInSeconds",
          "readySeconds",
          "talkSeconds",
          "ringingSeconds",
          "wrapSeconds",
          "pausedSeconds",
          "idleSeconds",
          "untrackedSeconds",
        ];
  const invalidDuration = requiredDurationKeys.find(
    (key) => durations[key] === null || durations[key] < 0,
  );

  if (invalidDuration) {
    return {
      error: `Invalid ${invalidDuration} duration.`,
      sourceAgentName,
      agentKey,
    };
  }

  return {
    metric: {
      sourceAgentName,
      agentKey,
      granularity,
      metricDate,
      metricHour,
      metricKey: metricKeyFor(granularity, metricHour),
      calls,
      durations: durations as DurationTotals,
    } satisfies ParsedCsvMetric,
  };
}

function buildMappingLookup(mappings: SourceMapping[]) {
  const grouped = new Map<string, SourceMapping[]>();

  for (const mapping of mappings) {
    const key = normalizeAgentName(mapping.sourceAgentName);
    const current = grouped.get(key) ?? [];
    current.push(mapping);
    grouped.set(key, current);
  }

  const lookup = new Map<string, MappingLookup>();

  for (const [key, group] of grouped.entries()) {
    const profileIds = new Set(group.map((mapping) => mapping.profileId));

    if (profileIds.size > 1) {
      lookup.set(key, { status: "invalid_mapping", mappings: group });
      continue;
    }

    lookup.set(key, { status: "mapped", mapping: mergeMappingGroup(group) });
  }

  return lookup;
}

function mergeMappingGroup(group: SourceMapping[]) {
  const first = group[0];
  const teamPairs = Array.from(
    new Map(
      group.flatMap((mapping) =>
        mapping.teamIds.map((teamId, index) => [
          teamId,
          { teamId, teamName: mapping.teamNames[index] ?? teamId },
        ] as const),
      ),
    ).values(),
  ).sort((left, right) => left.teamName.localeCompare(right.teamName));

  return {
    ...first,
    teamIds: teamPairs.map((team) => team.teamId),
    teamNames: teamPairs.map((team) => team.teamName),
  } satisfies SourceMapping;
}

function createAgentBuilder(
  agentKey: string,
  dialerAgentName: string,
  granularity: ImportGranularity,
): AgentBuilder {
  return {
    agentKey,
    dialerAgentName,
    mappingStatus: "unmapped",
    dashboardUserId: null,
    dashboardUserName: null,
    teamNames: [],
    accountStatus: undefined,
    warningMessage: undefined,
    granularity,
    csvRowCount: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    earliest: null,
    latest: null,
    calls: 0,
    durations: emptyDurations(),
    rowCounts: emptySummary(),
    sourceRows: [],
  };
}

function updateAgentMapping(
  builder: AgentBuilder,
  status: AgentMappingStatus,
  mapping?: SourceMapping,
) {
  const precedence: Record<AgentMappingStatus, number> = {
    invalid_mapping: 4,
    out_of_scope: 3,
    mapped: 2,
    unmapped: 1,
  };

  if (precedence[status] >= precedence[builder.mappingStatus]) {
    builder.mappingStatus = status;
  }

  if (mapping) {
    builder.dashboardUserId = mapping.profileId;
    builder.dashboardUserName = mapping.profileName;
    builder.teamNames = mapping.teamNames;
    builder.accountStatus = mapping.accountStatus;
    builder.warningMessage =
      mapping.accountStatus === "deactivated" || mapping.accountStatus === "revoked"
        ? `Mapped account is ${mapping.accountStatus}. Historical rows may still be imported by authorized users.`
        : undefined;
  }
}

function dateMetricKey(
  metric: Pick<
    ParsedCsvMetric,
    "granularity" | "metricDate" | "metricHour"
  >,
) {
  return metric.granularity === "daily"
    ? metric.metricDate
    : `${metric.metricDate} ${String(metric.metricHour).padStart(2, "0")}:00`;
}

function addValidMetric(builder: AgentBuilder, parsed: ParsedCsvMetric) {
  builder.validRowCount += 1;
  builder.calls += parsed.calls;
  addDurations(builder.durations, parsed.durations);

  const currentDateHour = dateMetricKey(parsed);

  if (!builder.earliest || currentDateHour < builder.earliest) {
    builder.earliest = currentDateHour;
  }

  if (!builder.latest || currentDateHour > builder.latest) {
    builder.latest = currentDateHour;
  }
}

function calculatePerformance(
  calls: number,
  durations: DurationTotals,
): DerivedPerformanceMetrics {
  const loggedInSeconds = durations.loggedInSeconds;

  if (loggedInSeconds === 0) {
    return {
      talkPercentage: null,
      readyPercentage: null,
      wrapPercentage: null,
      pausedPercentage: null,
      idlePercentage: null,
      callsPerLoggedInHour: null,
    };
  }

  return {
    talkPercentage: (durations.talkSeconds / loggedInSeconds) * 100,
    readyPercentage: (durations.readySeconds / loggedInSeconds) * 100,
    wrapPercentage: (durations.wrapSeconds / loggedInSeconds) * 100,
    pausedPercentage: (durations.pausedSeconds / loggedInSeconds) * 100,
    idlePercentage:
      durations.idleSeconds === null
        ? null
        : (durations.idleSeconds / loggedInSeconds) * 100,
    callsPerLoggedInHour: calls / (loggedInSeconds / 3600),
  };
}

function formattedTotals(durations: DurationTotals) {
  return DURATION_KEYS.reduce(
    (acc, key) => {
      acc[key] =
        durations[key] === null
          ? "N/A"
          : formatDurationSeconds(durations[key]).hms;
      return acc;
    },
    {} as Record<keyof DurationTotals, string>,
  );
}

function decimalHours(durations: DurationTotals) {
  return DURATION_KEYS.reduce(
    (acc, key) => {
      acc[key] =
        durations[key] === null
          ? "N/A"
          : formatDurationSeconds(durations[key]).decimalHoursLabel;
      return acc;
    },
    {} as Record<keyof DurationTotals, string>,
  );
}

function importStatusForAgent(builder: AgentBuilder) {
  if (builder.mappingStatus === "invalid_mapping") {
    return "Blocked: invalid mapping";
  }

  if (builder.mappingStatus === "unmapped") {
    return "Blocked: unmapped";
  }

  if (builder.mappingStatus === "out_of_scope") {
    return "Blocked: out of scope";
  }

  if (builder.invalidRowCount > 0) {
    return "Blocked: invalid rows";
  }

  if (builder.rowCounts.new + builder.rowCounts.changed > 0) {
    return "Ready";
  }

  return "No changes";
}

function buildAgentSummary(builder: AgentBuilder): AgentPreviewSummary {
  const performance = calculatePerformance(builder.calls, builder.durations);
  const loggedInHours = builder.durations.loggedInSeconds / 3600;

  return {
    agentKey: builder.agentKey,
    dialerAgentName: builder.dialerAgentName,
    mappingStatus: builder.mappingStatus,
    dashboardUserId: builder.dashboardUserId,
    dashboardUserName: builder.dashboardUserName,
    teamNames: builder.teamNames,
    accountStatus: builder.accountStatus,
    warningMessage: builder.warningMessage,
    granularity: builder.granularity,
    csvRowCount: builder.csvRowCount,
    validRowCount: builder.validRowCount,
    invalidRowCount: builder.invalidRowCount,
    dateRange: {
      earliest: builder.earliest?.slice(0, 10) ?? null,
      latest: builder.latest?.slice(0, 10) ?? null,
    },
    calls: builder.calls,
    durations: builder.durations,
    performance,
    rowCounts: builder.rowCounts,
    importStatus: importStatusForAgent(builder),
    hourlyRows:
      builder.granularity === "hourly" ? builder.sourceRows : [],
    calculationDetails: {
      hourlyRowsIncluded:
        builder.granularity === "hourly" ? builder.validRowCount : 0,
      invalidRowsExcluded: builder.invalidRowCount,
      earliestDateHour: builder.earliest,
      latestDateHour: builder.latest,
      formulas: [
        builder.granularity === "daily"
          ? "Duration totals use the supplied daily aggregate row."
          : "Duration totals are the sum of valid hourly rows.",
        "Talk Percentage = Talk Seconds / Logged In Seconds * 100",
        "Ready Percentage = Ready Seconds / Logged In Seconds * 100",
        "Wrap Percentage = Wrap Seconds / Logged In Seconds * 100",
        "Paused Percentage = Paused Seconds / Logged In Seconds * 100",
        "Idle Percentage = Idle Seconds / Logged In Seconds * 100",
        "Calls Per Logged-In Hour = Calls / (Logged In Seconds / 3600)",
      ],
      rawTotalsSeconds: builder.durations,
      formattedTotals: formattedTotals(builder.durations),
      decimalHours: decimalHours(builder.durations),
      rowClassificationTotals: builder.rowCounts,
      callsPerLoggedInHourFormula:
        performance.callsPerLoggedInHour === null
          ? "N/A"
          : `${formatNumber(builder.calls)} calls / ${formatRatio(loggedInHours)} logged-in hours = ${formatRatio(performance.callsPerLoggedInHour)}`,
    },
  };
}

function buildFileSummary(input: {
  totalCsvRows: number;
  duplicateFile: boolean;
  headers: string[];
  missingHeaders: string[];
  agents: AgentPreviewSummary[];
  summary: RowClassificationTotals;
}) {
  const durationTotals = emptyDurations();
  let totalCalls = 0;

  for (const agent of input.agents) {
    totalCalls += agent.calls;
    addDurations(durationTotals, agent.durations);
  }
  const eligibleMappedRows =
    input.summary.new + input.summary.changed + input.summary.unchanged;
  const mappedRowsToImport = input.summary.new + input.summary.changed;
  const unmappedRowsToSkip = input.summary.unknown;
  const outOfScopeRowsToSkip = input.summary.out_of_scope;
  const unchangedRowsToSkip = input.summary.unchanged;
  const invalidMappedRows = input.agents
    .filter((agent) => agent.mappingStatus === "mapped")
    .reduce((total, agent) => total + agent.rowCounts.invalid, 0);

  return {
    totalCsvRows: input.totalCsvRows,
    uniqueAgentsDetected: input.agents.length,
    uniqueMappedAgents: input.agents.filter(
      (agent) => agent.mappingStatus === "mapped",
    ).length,
    uniqueUnmappedAgents: input.agents.filter(
      (agent) => agent.mappingStatus === "unmapped",
    ).length,
    uniqueOutOfScopeAgents: input.agents.filter(
      (agent) => agent.mappingStatus === "out_of_scope",
    ).length,
    uniqueInvalidMappingAgents: input.agents.filter(
      (agent) => agent.mappingStatus === "invalid_mapping",
    ).length,
    unknownRows: input.summary.unknown,
    newRows: input.summary.new,
    changedRows: input.summary.changed,
    unchangedRows: input.summary.unchanged,
    invalidRows: input.summary.invalid,
    invalidMappedRows,
    outOfScopeRows: input.summary.out_of_scope,
    eligibleMappedRows,
    mappedRowsToImport,
    unmappedRowsToSkip,
    outOfScopeRowsToSkip,
    unchangedRowsToSkip,
    skippedRows:
      unmappedRowsToSkip +
      outOfScopeRowsToSkip +
      unchangedRowsToSkip +
      input.summary.invalid,
    includedValidRows:
      input.summary.new +
      input.summary.changed +
      input.summary.unchanged +
      input.summary.unknown +
      input.summary.out_of_scope,
    excludedInvalidRows: input.summary.invalid,
    mappedValidRows:
      input.summary.new + input.summary.changed + input.summary.unchanged,
    unmappedValidRows: input.summary.unknown,
    outOfScopeValidRows: input.summary.out_of_scope,
    totalCalls,
    durationTotals,
    duplicateFile: input.duplicateFile,
    detectedHeaders: input.headers,
    missingRequiredHeaders: input.missingHeaders,
  } satisfies FilePreviewSummary;
}

function emptyPreview(input: {
  fileHash: string;
  duplicateFile: boolean;
  granularity: ImportGranularity | null;
  selectedReportingDate: string | null;
  filenameRange: AgentHoursFilenameRange | null;
  parseError?: string;
  headers: string[];
  missingHeaders: string[];
  totalCsvRows: number;
  summary: RowClassificationTotals;
}) {
  const fileSummary = buildFileSummary({
    ...input,
    agents: [],
  });

  return {
    granularity: input.granularity,
    selectedReportingDate: input.selectedReportingDate,
    filenameRange: input.filenameRange,
    fileHash: input.fileHash,
    duplicateFile: input.duplicateFile,
    parseError: input.parseError,
    headers: input.headers,
    missingHeaders: input.missingHeaders,
    totalCsvRows: input.totalCsvRows,
    mappedAgents: [],
    unmappedAgents: [],
    rows: [],
    summary: input.summary,
    fileSummary,
    agents: [],
  } satisfies ImportPreview;
}

export function previewDialerCsv(input: {
  source: string;
  fileName?: string;
  fileContent: string;
  selectedReportingDate?: string | null;
  existingFileHashes: Set<string>;
  mappings: SourceMapping[];
  existingMetrics: ExistingDialerMetric[];
  actor: Actor;
}) {
  const fileHash = sha256(input.fileContent);
  const duplicateFile = input.existingFileHashes.has(fileHash);
  const selectedReportingDate = input.selectedReportingDate
    ? parseDialerDate(input.selectedReportingDate)
    : null;
  let detectedHeaders: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(input.fileContent, {
      bom: true,
      columns: (headers: string[]) => {
        detectedHeaders = headers.map((header) =>
          header.replace(/^\uFEFF/, "").trim(),
        );
        return headers.map(normalizeDialerHeader);
      },
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    const inspected = inspectDialerCsvFormat(input.fileContent);

    return emptyPreview({
      granularity: inspected.granularity,
      selectedReportingDate,
      filenameRange: null,
      fileHash,
      duplicateFile,
      parseError: "The CSV is malformed and could not be parsed.",
      headers: detectedHeaders,
      missingHeaders: inspected.missingHeaders,
      totalCsvRows: 0,
      summary: emptySummary(),
    });
  }
  const headers = detectedHeaders;
  const normalizedHeaders = detectedHeaders.map(normalizeDialerHeader);
  const granularity = detectDialerGranularity(normalizedHeaders);
  const missingHeaders = validateDialerHeaders(
    normalizedHeaders,
    granularity,
  );
  const filenameRange =
    granularity === "daily" && input.fileName
      ? parseAgentHoursFilenameRange(input.fileName)
      : null;
  const summary = emptySummary();

  if (!granularity || missingHeaders.length > 0) {
    return emptyPreview({
      granularity,
      selectedReportingDate,
      filenameRange,
      fileHash,
      duplicateFile,
      headers,
      missingHeaders,
      totalCsvRows: records.length,
      summary,
    });
  }

  const mappingLookup = buildMappingLookup(input.mappings);
  const existingByKey = new Map(
    input.existingMetrics.map((metric) => [hourlyKey(metric), metric]),
  );
  const agentBuilders = new Map<string, AgentBuilder>();
  const rows: ImportPreviewRow[] = [];

  for (const [index, rawRow] of records.entries()) {
    const rowNumber = index + 2;
    const parsed = parseCsvMetric(
      rawRow,
      granularity,
      selectedReportingDate,
    );
    const agentKey =
      "metric" in parsed ? parsed.metric.agentKey : parsed.agentKey;
    const dialerAgentName =
      "metric" in parsed ? parsed.metric.sourceAgentName : parsed.sourceAgentName;
    const builder =
      agentBuilders.get(agentKey) ??
      createAgentBuilder(agentKey, dialerAgentName, granularity);
    const mappingLookupResult = mappingLookup.get(agentKey);

    builder.csvRowCount += 1;

    let row: ImportPreviewRow;

    if ("error" in parsed) {
      summary.invalid += 1;
      builder.invalidRowCount += 1;
      builder.rowCounts.invalid += 1;

      if (mappingLookupResult?.status === "mapped") {
        const mapping = mappingLookupResult.mapping;
        const mappingStatus = canImportForProfile(input.actor, {
          id: mapping.profileId,
          teamIds: mapping.teamIds,
        })
          ? "mapped"
          : "out_of_scope";

        updateAgentMapping(builder, mappingStatus, mapping);
      } else if (mappingLookupResult?.status === "invalid_mapping") {
        updateAgentMapping(builder, "invalid_mapping");
      }

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        granularity,
        date:
          granularity === "daily"
            ? selectedReportingDate
            : rawRow.date ?? null,
        hour:
          granularity === "daily"
            ? null
            : rawRow.hour
              ? Number(rawRow.hour)
              : null,
        calls: null,
        durations: null,
        status: "invalid",
        validationMessage: parsed.error,
        importable: false,
        rawRow,
      };
    } else if (mappingLookupResult?.status === "invalid_mapping") {
      summary.invalid += 1;
      builder.invalidRowCount += 1;
      builder.rowCounts.invalid += 1;
      updateAgentMapping(builder, "invalid_mapping");

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        granularity,
        date: parsed.metric.metricDate,
        hour: parsed.metric.metricHour,
        calls: parsed.metric.calls,
        durations: parsed.metric.durations,
        status: "invalid",
        validationMessage:
          "Multiple dashboard users are mapped to this dialer agent name.",
        importable: false,
        rawRow,
      };
    } else if (!mappingLookupResult) {
      summary.unknown += 1;
      builder.rowCounts.unknown += 1;
      updateAgentMapping(builder, "unmapped");
      addValidMetric(builder, parsed.metric);

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        granularity,
        date: parsed.metric.metricDate,
        hour: parsed.metric.metricHour,
        calls: parsed.metric.calls,
        durations: parsed.metric.durations,
        status: "unknown",
        validationMessage: "No source user mapping exists for this agent name.",
        importable: false,
        rawRow,
      };
    } else if (
      !canImportForProfile(input.actor, {
        id: mappingLookupResult.mapping.profileId,
        teamIds: mappingLookupResult.mapping.teamIds,
      })
    ) {
      summary.out_of_scope += 1;
      builder.rowCounts.out_of_scope += 1;
      updateAgentMapping(builder, "out_of_scope", mappingLookupResult.mapping);
      addValidMetric(builder, parsed.metric);

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        granularity,
        date: parsed.metric.metricDate,
        hour: parsed.metric.metricHour,
        calls: parsed.metric.calls,
        durations: parsed.metric.durations,
        status: "out_of_scope",
        validationMessage: "Mapped agent is outside the uploader's team scope.",
        importable: false,
        rawRow,
      };
    } else {
      const warningMessage =
        mappingLookupResult.mapping.accountStatus === "deactivated" ||
        mappingLookupResult.mapping.accountStatus === "revoked"
          ? `Mapped account is ${mappingLookupResult.mapping.accountStatus}.`
          : undefined;
      const snapshotIndex = Math.max(
        0,
        mappingLookupResult.mapping.teamIds.findIndex((teamId) =>
          input.actor.teamIds.includes(teamId),
        ),
      );
      const metric = {
        source: input.source,
        sourceAgentName: parsed.metric.sourceAgentName,
        agentProfileId: mappingLookupResult.mapping.profileId,
        granularity: parsed.metric.granularity,
        metricDate: parsed.metric.metricDate,
        metricHour: parsed.metric.metricHour,
        metricKey: parsed.metric.metricKey,
        calls: parsed.metric.calls,
        teamIdSnapshot:
          mappingLookupResult.mapping.teamIds[snapshotIndex] ?? null,
        teamNameSnapshot:
          mappingLookupResult.mapping.teamNames[snapshotIndex] ?? null,
        ...parsed.metric.durations,
      } satisfies DialerMetricInput;
      const rowHash = metricRowHash(metric);
      const existing = existingByKey.get(hourlyKey(metric));
      const status = !existing
        ? "new"
        : existing.rowHash === rowHash
          ? "unchanged"
          : "changed";

      summary[status] += 1;
      builder.rowCounts[status] += 1;
      updateAgentMapping(builder, "mapped", mappingLookupResult.mapping);
      addValidMetric(builder, parsed.metric);

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        granularity,
        date: parsed.metric.metricDate,
        hour: parsed.metric.metricHour,
        calls: parsed.metric.calls,
        durations: parsed.metric.durations,
        status,
        warningMessage,
        importable: status === "new" || status === "changed",
        metric,
        rowHash,
        rawRow,
      };
    }

    builder.sourceRows.push(row);
    rows.push(row);
    agentBuilders.set(agentKey, builder);
  }

  const agents = Array.from(agentBuilders.values())
    .map(buildAgentSummary)
    .sort((left, right) =>
      left.dialerAgentName.localeCompare(right.dialerAgentName),
    );
  const fileSummary = buildFileSummary({
    totalCsvRows: records.length,
    duplicateFile,
    headers,
    missingHeaders,
    agents,
    summary,
  });

  return {
    granularity,
    selectedReportingDate,
    filenameRange,
    fileHash,
    duplicateFile,
    headers,
    missingHeaders,
    totalCsvRows: records.length,
    mappedAgents: agents
      .filter((agent) => agent.mappingStatus === "mapped")
      .map((agent) => agent.dialerAgentName),
    unmappedAgents: agents
      .filter((agent) => agent.mappingStatus === "unmapped")
      .map((agent) => agent.dialerAgentName),
    rows,
    summary,
    fileSummary,
    agents,
  } satisfies ImportPreview;
}

export {
  formatDurationSeconds,
  formatRatio,
};
