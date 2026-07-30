import {
  IMPORT_ANOMALY_THRESHOLDS,
  MAX_DIALER_CSV_ROWS,
} from "@/import/config";
import {
  normalizeDialerHeader,
  type ImportPreview,
} from "@/import/dialer";
import {
  compareMetrics,
  type ComparableMetric,
  type ImportComparison,
} from "@/import/versioning";

export type DuplicateImportReference = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: Date;
  scopeKeys?: string[];
};

export type ImportValidationResult = {
  errors: string[];
  warnings: string[];
  notices: string[];
  reportingDates: string[];
  emptyRowCount: number;
  duplicateRowNumbers: number[];
  duplicateAgents: string[];
  comparison: ImportComparison;
};

function addUnique(target: string[], message: string) {
  if (!target.includes(message)) {
    target.push(message);
  }
}

function percentDecreaseWarning(input: {
  label: string;
  before: number;
  after: number;
  threshold: number;
}) {
  if (input.before <= 0 || input.after >= input.before) {
    return null;
  }

  const decrease = ((input.before - input.after) / input.before) * 100;

  return decrease >= input.threshold
    ? `${input.label} decreased by ${decrease.toFixed(1)}% compared with the active version.`
    : null;
}

function percentIncreaseWarning(input: {
  label: string;
  before: number;
  after: number;
  threshold: number;
}) {
  if (input.before <= 0 || input.after <= input.before) {
    return null;
  }

  const increase = ((input.after - input.before) / input.before) * 100;

  return increase >= input.threshold
    ? `${input.label} increased by ${increase.toFixed(1)}% compared with the active version.`
    : null;
}

function countEmptyRows(fileContent: string) {
  const lines = fileContent.replaceAll("\r\n", "\n").split("\n").slice(1);
  return lines.filter((line) => line.trim().length === 0).length;
}

function duplicateRows(preview: ImportPreview) {
  const seenRows = new Map<string, number>();
  const seenKeys = new Map<string, number>();
  const duplicateRowNumbers = new Set<number>();
  const duplicateAgents = new Set<string>();

  for (const row of preview.rows) {
    const rawKey = JSON.stringify(
      Object.entries(row.rawRow).map(([key, value]) => [
        normalizeDialerHeader(key),
        value.trim(),
      ]),
    );
    const firstRawRow = seenRows.get(rawKey);

    if (firstRawRow) {
      duplicateRowNumbers.add(firstRawRow);
      duplicateRowNumbers.add(row.rowNumber);
    } else {
      seenRows.set(rawKey, row.rowNumber);
    }

    if (row.date && row.agentKey) {
      const metricKey =
        row.granularity === "daily"
          ? `${row.agentKey}:${row.date}:daily`
          : row.hour !== null
            ? `${row.agentKey}:${row.date}:hour:${row.hour}`
            : null;
      const firstMetricRow = metricKey ? seenKeys.get(metricKey) : undefined;

      if (firstMetricRow) {
        duplicateRowNumbers.add(firstMetricRow);
        duplicateRowNumbers.add(row.rowNumber);
        duplicateAgents.add(row.dialerAgentName);
      } else if (metricKey) {
        seenKeys.set(metricKey, row.rowNumber);
      }
    }
  }

  return {
    duplicateRowNumbers: Array.from(duplicateRowNumbers).sort(
      (left, right) => left - right,
    ),
    duplicateAgents: Array.from(duplicateAgents).sort(),
  };
}

export function validateImport(input: {
  preview: ImportPreview;
  fileContent: string;
  currentMetrics: ComparableMetric[];
  selectedReportingDate?: string | null;
  duplicateImports: DuplicateImportReference[];
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];
  const emptyRowCount = countEmptyRows(input.fileContent);
  const duplicates = duplicateRows(input.preview);
  const normalizedHeaders = input.preview.headers.map(normalizeDialerHeader);
  const duplicateHeaders = normalizedHeaders.filter(
    (header, index) => normalizedHeaders.indexOf(header) !== index,
  );
  const mappedMetrics = input.preview.rows
    .filter((row) => row.metric)
    .map((row) => row.metric as ComparableMetric);
  const reportingDates = Array.from(
    new Set(
      input.preview.rows
        .map((row) => row.date)
        .filter((date): date is string => Boolean(date)),
    ),
  ).sort();
  const unmatchedAgentCount = input.preview.agents.filter(
    (agent) => agent.mappingStatus !== "mapped",
  ).length;
  const comparison = compareMetrics({
    current: input.currentMetrics,
    uploaded: mappedMetrics,
    uploadedAgentCount: input.preview.agents.length,
    unmatchedAgentCount,
    duplicateAgents: duplicates.duplicateAgents,
  });

  if (input.preview.parseError) {
    addUnique(errors, input.preview.parseError);
  }

  if (input.preview.missingHeaders.length > 0) {
    addUnique(
      errors,
      input.preview.granularity === "daily"
        ? "Agent Hours CSV must contain: Agent, Logged In (sec), Ready (sec), Talk (sec), Wrap (sec), Paused (sec), System Pause (sec), Net (sec), and Calls."
        : `Missing required CSV headers: ${input.preview.missingHeaders.join(", ")}.`,
    );
  }

  if (
    input.preview.granularity === "daily" &&
    !input.selectedReportingDate
  ) {
    addUnique(
      errors,
      "Choose the reporting date represented by this Agent Hours file.",
    );
  }

  if (duplicateHeaders.length > 0) {
    addUnique(
      errors,
      `Duplicate CSV headers are not allowed: ${Array.from(new Set(duplicateHeaders)).join(", ")}.`,
    );
  }

  if (input.preview.totalCsvRows === 0) {
    addUnique(errors, "The CSV does not contain any data rows.");
  }

  if (input.preview.totalCsvRows > MAX_DIALER_CSV_ROWS) {
    addUnique(
      errors,
      `The CSV exceeds the ${MAX_DIALER_CSV_ROWS.toLocaleString("en-US")}-row validation limit.`,
    );
  }

  if (duplicates.duplicateRowNumbers.length > 0) {
    addUnique(
      errors,
      input.preview.granularity === "daily"
        ? `Duplicate agent/reporting-date rows were found at CSV rows ${duplicates.duplicateRowNumbers.join(", ")}.`
        : `Duplicate agent/date/hour rows were found at CSV rows ${duplicates.duplicateRowNumbers.join(", ")}.`,
    );
  }

  if (input.preview.fileSummary.uniqueInvalidMappingAgents > 0) {
    addUnique(
      errors,
      `${input.preview.fileSummary.uniqueInvalidMappingAgents} agent name(s) map ambiguously to more than one dashboard user.`,
    );
  }

  if (input.preview.fileSummary.invalidMappedRows > 0) {
    addUnique(
      errors,
      `${input.preview.fileSummary.invalidMappedRows} mapped row(s) contain blocking validation errors.`,
    );
  }

  if (mappedMetrics.length === 0) {
    addUnique(errors, "No valid mapped metric rows are available to publish.");
  }

  if (emptyRowCount > 0) {
    addUnique(
      notices,
      `${emptyRowCount} empty row(s) were ignored while parsing the CSV.`,
    );
  }

  if (input.duplicateImports.length > 0) {
    const previous = input.duplicateImports[0];
    addUnique(
      warnings,
      `This exact file was already uploaded as ${previous.fileName} on ${previous.uploadedAt.toISOString()} with status ${previous.status}.`,
    );
  }

  if (input.preview.fileSummary.uniqueUnmappedAgents > 0) {
    addUnique(
      warnings,
      `${input.preview.fileSummary.uniqueUnmappedAgents} agent name(s) are unmatched and will not be included.`,
    );
  }

  if (input.preview.fileSummary.uniqueOutOfScopeAgents > 0) {
    addUnique(
      warnings,
      `${input.preview.fileSummary.uniqueOutOfScopeAgents} agent name(s) belong outside the uploader's authorized team scope.`,
    );
  }

  if (
    input.preview.agents.length > 0 &&
    (unmatchedAgentCount / input.preview.agents.length) * 100 >=
      IMPORT_ANOMALY_THRESHOLDS.unmatchedAgentPercent
  ) {
    addUnique(
      warnings,
      `Unmatched agents meet or exceed the configured ${IMPORT_ANOMALY_THRESHOLDS.unmatchedAgentPercent}% warning threshold.`,
    );
  }

  if (
    input.preview.granularity === "hourly" &&
    input.selectedReportingDate &&
    (reportingDates.length !== 1 ||
      reportingDates[0] !== input.selectedReportingDate)
  ) {
    addUnique(
      warnings,
      `The CSV reporting date (${reportingDates.join(", ") || "none"}) differs from the selected date (${input.selectedReportingDate}).`,
    );
  }

  if (input.preview.filenameRange) {
    addUnique(
      notices,
      `Filename suggests a reporting period from ${input.preview.filenameRange.startDate} to ${input.preview.filenameRange.endDate}.`,
    );

    if (input.preview.filenameRange.multiDay && input.selectedReportingDate) {
      addUnique(
        warnings,
        `The filename suggests this file may contain totals for multiple days. All rows will be assigned to the selected reporting date ${input.selectedReportingDate}.`,
      );
    }
  }

  for (const row of input.preview.rows) {
    if (!row.metric) {
      continue;
    }

    if (row.metric.talkSeconds > row.metric.loggedInSeconds) {
      addUnique(
        warnings,
        `CSV row ${row.rowNumber} has talk time greater than login time.`,
      );
    }

    if (
      row.metric.loggedInSeconds >
      IMPORT_ANOMALY_THRESHOLDS.maximumLoginSecondsPerRow
    ) {
      addUnique(
        warnings,
        `CSV row ${row.rowNumber} exceeds the configured maximum login time per row.`,
      );
    }
  }

  const agentDateLogin = new Map<string, number>();

  for (const metric of mappedMetrics) {
    const key = `${metric.agentProfileId}:${metric.metricDate}`;
    agentDateLogin.set(
      key,
      (agentDateLogin.get(key) ?? 0) + metric.loggedInSeconds,
    );
  }

  if (
    Array.from(agentDateLogin.values()).some(
      (seconds) =>
        seconds >
        IMPORT_ANOMALY_THRESHOLDS.maximumLoginSecondsPerAgentDay,
    )
  ) {
    addUnique(
      warnings,
      "At least one agent exceeds the configured maximum daily login time.",
    );
  }

  const anomalyMessages = [
    percentDecreaseWarning({
      label: "Agent count",
      before: comparison.currentAgentCount,
      after: comparison.matchedAgentCount,
      threshold: IMPORT_ANOMALY_THRESHOLDS.agentCountDecreasePercent,
    }),
    percentDecreaseWarning({
      label: "Total login time",
      before: comparison.loggedInSeconds.before,
      after: comparison.loggedInSeconds.after,
      threshold: IMPORT_ANOMALY_THRESHOLDS.totalLoginDecreasePercent,
    }),
    percentDecreaseWarning({
      label: "Total calls",
      before: comparison.calls.before,
      after: comparison.calls.after,
      threshold: IMPORT_ANOMALY_THRESHOLDS.totalCallsDecreasePercent,
    }),
    percentIncreaseWarning({
      label: "Total login time",
      before: comparison.loggedInSeconds.before,
      after: comparison.loggedInSeconds.after,
      threshold: IMPORT_ANOMALY_THRESHOLDS.totalMetricIncreasePercent,
    }),
    percentIncreaseWarning({
      label: "Total calls",
      before: comparison.calls.before,
      after: comparison.calls.after,
      threshold: IMPORT_ANOMALY_THRESHOLDS.totalMetricIncreasePercent,
    }),
  ];

  for (const message of anomalyMessages) {
    if (message) {
      addUnique(warnings, message);
    }
  }

  if (comparison.missingAgents.length > 0) {
    addUnique(
      warnings,
      `${comparison.missingAgents.length} agent(s) present in the active version are missing from this upload.`,
    );
  }

  if (comparison.newAgents.length > 0) {
    addUnique(
      notices,
      `${comparison.newAgents.length} mapped agent(s) are new compared with the active version.`,
    );
  }

  return {
    errors,
    warnings,
    notices,
    reportingDates,
    emptyRowCount,
    duplicateRowNumbers: duplicates.duplicateRowNumbers,
    duplicateAgents: duplicates.duplicateAgents,
    comparison,
  } satisfies ImportValidationResult;
}
