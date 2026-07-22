import { createHash } from "crypto";
import { parse } from "csv-parse/sync";

import { canImportForProfile, type Actor } from "@/auth/authorization";

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
  "logged in (sec)": "logged_in_seconds",
  logged_in_seconds: "logged_in_seconds",
  ready: "ready_seconds",
  "ready (sec)": "ready_seconds",
  ready_seconds: "ready_seconds",
  talk: "talk_seconds",
  "talk (sec)": "talk_seconds",
  talk_seconds: "talk_seconds",
  ringing: "ringing_seconds",
  "ringing (sec)": "ringing_seconds",
  ringing_seconds: "ringing_seconds",
  wrap: "wrap_seconds",
  "wrap (sec)": "wrap_seconds",
  wrap_seconds: "wrap_seconds",
  paused: "paused_seconds",
  "paused (sec)": "paused_seconds",
  paused_seconds: "paused_seconds",
  idle: "idle_seconds",
  "idle (sec)": "idle_seconds",
  idle_seconds: "idle_seconds",
  untracked: "untracked_seconds",
  "untracked (sec)": "untracked_seconds",
  untracked_seconds: "untracked_seconds",
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
  teamIds: string[];
};

export type ImportPreviewRow = {
  rowNumber: number;
  status:
    | "new"
    | "changed"
    | "unchanged"
    | "invalid"
    | "unknown"
    | "out_of_scope";
  message?: string;
  metric?: DialerMetricInput;
  rowHash?: string;
  rawRow: Record<string, string>;
};

export type ImportPreview = {
  fileHash: string;
  duplicateFile: boolean;
  headers: string[];
  missingHeaders: string[];
  totalCsvRows: number;
  mappedAgents: string[];
  rows: ImportPreviewRow[];
  summary: Record<ImportPreviewRow["status"], number>;
};

export function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeDialerHeader(header: string) {
  const normalized = header.replace(/^\uFEFF/, "").trim().toLowerCase();

  return DIALER_HEADER_ALIASES[normalized] ?? normalized;
}

export function validateDialerHeaders(headers: string[]) {
  return REQUIRED_DIALER_HEADERS.filter((header) => !headers.includes(header));
}

export function getImportConfirmationBlockReason(preview: ImportPreview) {
  if (preview.missingHeaders.length > 0) {
    return `Missing required CSV headers: ${preview.missingHeaders.join(", ")}`;
  }

  if (preview.duplicateFile) {
    return "Duplicate file blocked.";
  }

  if (preview.summary.new + preview.summary.changed === 0) {
    return "No valid new or changed rows exist.";
  }

  return null;
}

export function hourlyKey(metric: Pick<DialerMetricInput, "source" | "agentProfileId" | "metricDate" | "metricHour">) {
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

function normalizeSeconds(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes, seconds] = trimmed.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  return null;
}

function parseMetric(
  source: string,
  row: Record<string, string>,
  mapping: SourceMapping,
) {
  const metricHour = Number(row.hour);
  const calls = Number(row.calls);
  const metricDate = row.date?.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) {
    return { error: "Invalid date. Expected YYYY-MM-DD." };
  }

  if (!Number.isInteger(metricHour) || metricHour < 0 || metricHour > 23) {
    return { error: "Invalid hour. Expected 0 through 23." };
  }

  if (!Number.isInteger(calls) || calls < 0) {
    return { error: "Invalid calls. Expected a non-negative integer." };
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
    return { error: `Invalid ${invalidDuration[0]} duration.` };
  }

  const validDurations = durations as Record<keyof typeof durations, number>;

  return {
    metric: {
      source,
      sourceAgentName: row.agent.trim(),
      agentProfileId: mapping.profileId,
      metricDate,
      metricHour,
      calls,
      loggedInSeconds: validDurations.loggedInSeconds,
      readySeconds: validDurations.readySeconds,
      talkSeconds: validDurations.talkSeconds,
      ringingSeconds: validDurations.ringingSeconds,
      wrapSeconds: validDurations.wrapSeconds,
      pausedSeconds: validDurations.pausedSeconds,
      idleSeconds: validDurations.idleSeconds,
      untrackedSeconds: validDurations.untrackedSeconds,
    } satisfies DialerMetricInput,
  };
}

function emptySummary(): ImportPreview["summary"] {
  return {
    new: 0,
    changed: 0,
    unchanged: 0,
    invalid: 0,
    unknown: 0,
    out_of_scope: 0,
  };
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
  const mappingByName = new Map(
    input.mappings.map((mapping) => [
      mapping.sourceAgentName.toLowerCase(),
      mapping,
    ]),
  );
  const existingByKey = new Map(
    input.existingMetrics.map((metric) => [hourlyKey(metric), metric]),
  );
  const summary = emptySummary();

  if (missingHeaders.length > 0) {
    return {
      fileHash,
      duplicateFile,
      headers,
      missingHeaders,
      totalCsvRows: records.length,
      mappedAgents: [],
      rows: [],
      summary,
    } satisfies ImportPreview;
  }
  const mappedAgents = new Set<string>();

  const rows = records.map((rawRow, index) => {
    const rowNumber = index + 2;
    const mapping = mappingByName.get(rawRow.agent?.trim().toLowerCase());

    if (!mapping) {
      summary.unknown += 1;
      return {
        rowNumber,
        status: "unknown",
        message: "No source user mapping exists for this agent name.",
        rawRow,
      } satisfies ImportPreviewRow;
    }

    if (
      !canImportForProfile(input.actor, {
        id: mapping.profileId,
        teamIds: mapping.teamIds,
      })
    ) {
      summary.out_of_scope += 1;
      return {
        rowNumber,
        status: "out_of_scope",
        message: "Mapped agent is outside the uploader's team scope.",
        rawRow,
      } satisfies ImportPreviewRow;
    }

    mappedAgents.add(mapping.sourceAgentName);
    const parsed = parseMetric(input.source, rawRow, mapping);

    if ("error" in parsed) {
      summary.invalid += 1;
      return {
        rowNumber,
        status: "invalid",
        message: parsed.error,
        rawRow,
      } satisfies ImportPreviewRow;
    }

    const rowHash = metricRowHash(parsed.metric);
    const existing = existingByKey.get(hourlyKey(parsed.metric));
    const status = !existing
      ? "new"
      : existing.rowHash === rowHash
        ? "unchanged"
        : "changed";

    summary[status] += 1;

    return {
      rowNumber,
      status,
      metric: parsed.metric,
      rowHash,
      rawRow,
    } satisfies ImportPreviewRow;
  });

  return {
    fileHash,
    duplicateFile,
    headers,
    missingHeaders,
    totalCsvRows: records.length,
    mappedAgents: Array.from(mappedAgents).sort(),
    rows,
    summary,
  } satisfies ImportPreview;
}
