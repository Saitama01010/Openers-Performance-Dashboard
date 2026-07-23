import { createHash } from "crypto";
import { parse } from "csv-parse/sync";

import { canImportForProfile, type Actor } from "@/auth/authorization";
import {
  formatDurationSeconds,
  formatNumber,
  formatRatio,
} from "@/import/format";

export const REQUIRED_DIALER_HEADERS = [
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

export type DialerHeader = (typeof REQUIRED_DIALER_HEADERS)[number];

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
  ringingSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  idleSeconds: number;
  untrackedSeconds: number;
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
  accountStatus?: "invited" | "active" | "deactivated" | "revoked";
  warningMessage?: string;
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
  outOfScopeRows: number;
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
  metricDate: string;
  metricHour: number;
  calls: number;
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number;
  wrapSeconds: number;
  pausedSeconds: number;
  idleSeconds: number;
  untrackedSeconds: number;
  teamIdSnapshot: string | null;
  teamNameSnapshot: string | null;
};

export type ExistingDialerMetric = Pick<
  DialerMetricInput,
  "source" | "agentProfileId" | "metricDate" | "metricHour"
> & {
  rowHash: string;
};

export type SourceMapping = {
  sourceAgentName: string;
  profileId: string;
  profileName: string;
  teamIds: string[];
  teamNames: string[];
  accountStatus?: "invited" | "active" | "deactivated" | "revoked";
};

export type ImportPreviewRow = HourlyPreviewRow & {
  metric?: DialerMetricInput;
  rowHash?: string;
};

export type ImportPreview = {
  fileHash: string;
  duplicateFile: boolean;
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

type ParsedCsvMetric = {
  sourceAgentName: string;
  agentKey: string;
  metricDate: string;
  metricHour: number;
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
  accountStatus?: "invited" | "active" | "deactivated" | "revoked";
  warningMessage?: string;
  csvRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  earliest: string | null;
  latest: string | null;
  calls: number;
  durations: DurationTotals;
  rowCounts: RowClassificationTotals;
  hourlyRows: ImportPreviewRow[];
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

export function validateDialerHeaders(headers: string[]) {
  return REQUIRED_DIALER_HEADERS.filter((header) => !headers.includes(header));
}

export function getImportConfirmationBlockReasons(preview: ImportPreview) {
  const reasons: string[] = [];

  if (preview.missingHeaders.length > 0) {
    reasons.push(
      `Missing required CSV headers: ${preview.missingHeaders.join(", ")}`,
    );
  }

  if (preview.duplicateFile) {
    reasons.push("Duplicate file blocked.");
  }

  if (preview.fileSummary.uniqueUnmappedAgents > 0) {
    reasons.push(
      `${preview.fileSummary.uniqueUnmappedAgents} unmapped dialer agent(s) must be mapped before import.`,
    );
  }

  if (preview.fileSummary.uniqueOutOfScopeAgents > 0) {
    reasons.push(
      `${preview.fileSummary.uniqueOutOfScopeAgents} out-of-scope dialer agent(s) cannot be imported by this user.`,
    );
  }

  if (preview.fileSummary.uniqueInvalidMappingAgents > 0) {
    reasons.push(
      `${preview.fileSummary.uniqueInvalidMappingAgents} dialer agent(s) have invalid mappings.`,
    );
  }

  if (preview.fileSummary.invalidRows > 0) {
    reasons.push(
      `${preview.fileSummary.invalidRows} invalid row(s) must be resolved before import.`,
    );
  }

  if (preview.summary.new + preview.summary.changed === 0) {
    reasons.push("No valid new or changed rows exist.");
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
  >,
) {
  return `${metric.source}:${metric.agentProfileId}:${metric.metricDate}:${metric.metricHour}`;
}

export function metricRowHash(metric: DialerMetricInput) {
  return sha256(
    JSON.stringify({
      calls: metric.calls,
      loggedInSeconds: metric.loggedInSeconds,
      readySeconds: metric.readySeconds,
      talkSeconds: metric.talkSeconds,
      ringingSeconds: metric.ringingSeconds,
      wrapSeconds: metric.wrapSeconds,
      pausedSeconds: metric.pausedSeconds,
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
    ringingSeconds: 0,
    wrapSeconds: 0,
    pausedSeconds: 0,
    idleSeconds: 0,
    untrackedSeconds: 0,
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
    target[key] += source[key];
  }
}

function normalizeSeconds(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{1,3}:\d{2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes, seconds] = trimmed.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  return null;
}

function parseNonNegativeInteger(value: string | undefined) {
  const parsed = Number((value ?? "").trim());

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseHour(value: string | undefined) {
  const parsed = Number((value ?? "").trim());

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : null;
}

function parseDate(value: string | undefined) {
  const trimmed = (value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseCsvMetric(row: Record<string, string>): ParseCsvMetricResult {
  const sourceAgentName = displayAgentName(row.agent);
  const agentKey = normalizeAgentName(row.agent);
  const metricDate = parseDate(row.date);
  const metricHour = parseHour(row.hour);
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
      error: "Invalid date. Expected YYYY-MM-DD.",
      sourceAgentName,
      agentKey,
    };
  }

  if (metricHour === null) {
    return {
      error: "Invalid hour. Expected 0 through 23.",
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
    ringingSeconds: normalizeSeconds(row.ringing_seconds),
    wrapSeconds: normalizeSeconds(row.wrap_seconds),
    pausedSeconds: normalizeSeconds(row.paused_seconds),
    idleSeconds: normalizeSeconds(row.idle_seconds),
    untrackedSeconds: normalizeSeconds(row.untracked_seconds),
  };
  const invalidDuration = Object.entries(durations).find(
    ([, value]) => value === null || value < 0,
  );

  if (invalidDuration) {
    return {
      error: `Invalid ${invalidDuration[0]} duration.`,
      sourceAgentName,
      agentKey,
    };
  }

  return {
    metric: {
      sourceAgentName,
      agentKey,
      metricDate,
      metricHour,
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
    csvRowCount: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    earliest: null,
    latest: null,
    calls: 0,
    durations: emptyDurations(),
    rowCounts: emptySummary(),
    hourlyRows: [],
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

function dateHourKey(metric: Pick<ParsedCsvMetric, "metricDate" | "metricHour">) {
  return `${metric.metricDate} ${String(metric.metricHour).padStart(2, "0")}:00`;
}

function addValidMetric(builder: AgentBuilder, parsed: ParsedCsvMetric) {
  builder.validRowCount += 1;
  builder.calls += parsed.calls;
  addDurations(builder.durations, parsed.durations);

  const currentDateHour = dateHourKey(parsed);

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
    idlePercentage: (durations.idleSeconds / loggedInSeconds) * 100,
    callsPerLoggedInHour: calls / (loggedInSeconds / 3600),
  };
}

function formattedTotals(durations: DurationTotals) {
  return DURATION_KEYS.reduce(
    (acc, key) => {
      acc[key] = formatDurationSeconds(durations[key]).hms;
      return acc;
    },
    {} as Record<keyof DurationTotals, string>,
  );
}

function decimalHours(durations: DurationTotals) {
  return DURATION_KEYS.reduce(
    (acc, key) => {
      acc[key] = formatDurationSeconds(durations[key]).decimalHoursLabel;
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
    csvRowCount: builder.csvRowCount,
    validRowCount: builder.validRowCount,
    invalidRowCount: builder.invalidRowCount,
    dateRange: {
      earliest: builder.earliest,
      latest: builder.latest,
    },
    calls: builder.calls,
    durations: builder.durations,
    performance,
    rowCounts: builder.rowCounts,
    importStatus: importStatusForAgent(builder),
    hourlyRows: builder.hourlyRows,
    calculationDetails: {
      hourlyRowsIncluded: builder.validRowCount,
      invalidRowsExcluded: builder.invalidRowCount,
      earliestDateHour: builder.earliest,
      latestDateHour: builder.latest,
      formulas: [
        "Duration totals are the sum of valid hourly rows.",
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
    outOfScopeRows: input.summary.out_of_scope,
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
    fileHash: input.fileHash,
    duplicateFile: input.duplicateFile,
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
  fileContent: string;
  existingFileHashes: Set<string>;
  mappings: SourceMapping[];
  existingMetrics: ExistingDialerMetric[];
  actor: Actor;
}) {
  const fileHash = sha256(input.fileContent);
  const duplicateFile = input.existingFileHashes.has(fileHash);
  let detectedHeaders: string[] = [];
  const records = parse(input.fileContent, {
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
  const headers = detectedHeaders;
  const normalizedHeaders = detectedHeaders.map(normalizeDialerHeader);
  const missingHeaders = validateDialerHeaders(normalizedHeaders);
  const summary = emptySummary();

  if (missingHeaders.length > 0) {
    return emptyPreview({
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
    const parsed = parseCsvMetric(rawRow);
    const agentKey =
      "metric" in parsed ? parsed.metric.agentKey : parsed.agentKey;
    const dialerAgentName =
      "metric" in parsed ? parsed.metric.sourceAgentName : parsed.sourceAgentName;
    const builder =
      agentBuilders.get(agentKey) ??
      createAgentBuilder(agentKey, dialerAgentName);
    const mappingLookupResult = mappingLookup.get(agentKey);

    builder.csvRowCount += 1;

    let row: ImportPreviewRow;

    if ("error" in parsed) {
      summary.invalid += 1;
      builder.invalidRowCount += 1;
      builder.rowCounts.invalid += 1;

      if (mappingLookupResult?.status === "mapped") {
        updateAgentMapping(builder, "mapped", mappingLookupResult.mapping);
      } else if (mappingLookupResult?.status === "invalid_mapping") {
        updateAgentMapping(builder, "invalid_mapping");
      }

      row = {
        rowNumber,
        agentKey,
        dialerAgentName,
        date: rawRow.date ?? null,
        hour: rawRow.hour ? Number(rawRow.hour) : null,
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
        metricDate: parsed.metric.metricDate,
        metricHour: parsed.metric.metricHour,
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

    builder.hourlyRows.push(row);
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
