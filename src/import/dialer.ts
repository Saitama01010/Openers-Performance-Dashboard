import { createHash } from "crypto";
import { parse } from "csv-parse/sync";

import { canImportForProfile, type Actor } from "@/auth/authorization";

export const REQUIRED_DIALER_HEADERS = [
  "agent",
  "date",
  "hour",
  "calls",
  "login_time",
  "ready_time",
  "talk_time",
  "ringing_time",
  "wrap_time",
  "paused_time",
  "idle_time",
  "untracked_time",
] as const;

export type DialerHeader = (typeof REQUIRED_DIALER_HEADERS)[number];

export type DialerMetricInput = {
  source: string;
  sourceAgentName: string;
  agentProfileId: string;
  metricDate: string;
  metricHour: number;
  calls: number;
  loginTime: string;
  readyTime: string;
  talkTime: string;
  ringingTime: string;
  wrapTime: string;
  pausedTime: string;
  idleTime: string;
  untrackedTime: string;
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
  rows: ImportPreviewRow[];
  summary: Record<ImportPreviewRow["status"], number>;
};

export function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export function validateDialerHeaders(headers: string[]) {
  return REQUIRED_DIALER_HEADERS.filter((header) => !headers.includes(header));
}

export function hourlyKey(metric: Pick<DialerMetricInput, "source" | "agentProfileId" | "metricDate" | "metricHour">) {
  return `${metric.source}:${metric.agentProfileId}:${metric.metricDate}:${metric.metricHour}`;
}

export function metricRowHash(metric: DialerMetricInput) {
  return sha256(
    JSON.stringify({
      calls: metric.calls,
      loginTime: metric.loginTime,
      readyTime: metric.readyTime,
      talkTime: metric.talkTime,
      ringingTime: metric.ringingTime,
      wrapTime: metric.wrapTime,
      pausedTime: metric.pausedTime,
      idleTime: metric.idleTime,
      untrackedTime: metric.untrackedTime,
    }),
  );
}

function normalizeTime(value: string) {
  const trimmed = value.trim();

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes, seconds] = trimmed.split(":").map(Number);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const totalSeconds = Math.round(Number(trimmed));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

  const times = {
    loginTime: normalizeTime(row.login_time),
    readyTime: normalizeTime(row.ready_time),
    talkTime: normalizeTime(row.talk_time),
    ringingTime: normalizeTime(row.ringing_time),
    wrapTime: normalizeTime(row.wrap_time),
    pausedTime: normalizeTime(row.paused_time),
    idleTime: normalizeTime(row.idle_time),
    untrackedTime: normalizeTime(row.untracked_time),
  };

  const invalidTime = Object.entries(times).find(([, value]) => !value);

  if (invalidTime) {
    return { error: `Invalid ${invalidTime[0]} duration.` };
  }

  const validTimes = times as Record<keyof typeof times, string>;

  return {
    metric: {
      source,
      sourceAgentName: row.agent.trim(),
      agentProfileId: mapping.profileId,
      metricDate,
      metricHour,
      calls,
      loginTime: validTimes.loginTime,
      readyTime: validTimes.readyTime,
      talkTime: validTimes.talkTime,
      ringingTime: validTimes.ringingTime,
      wrapTime: validTimes.wrapTime,
      pausedTime: validTimes.pausedTime,
      idleTime: validTimes.idleTime,
      untrackedTime: validTimes.untrackedTime,
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
  const records = parse(input.fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const missingHeaders = validateDialerHeaders(headers);
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
      rows: [],
      summary,
    } satisfies ImportPreview;
  }

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
    rows,
    summary,
  } satisfies ImportPreview;
}
