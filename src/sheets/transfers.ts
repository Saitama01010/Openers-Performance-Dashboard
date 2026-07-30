import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  ClosedDealReadResult,
  TransferDiagnostic,
  TransferReadResult,
  TransferRecord,
  TransfersProvider,
} from "@/sheets/contracts";
import {
  closedAppsScriptFailureSchema,
  ClosedSheetConfigurationError,
  parseClosedAppsScriptSuccess,
  type ClosedSourceErrorKind,
} from "@/sheets/closed-deals";
import {
  extractOpenerAmericanName,
  normalizeAmericanName as normalizeSharedAmericanName,
  normalizeSheetHeader,
  sheetCellText,
} from "@/sheets/normalization";
import { parseSheetTimestamp } from "@/sheets/timestamp";

const REQUIRED_HEADERS = [
  "Timestamp",
  "Opener",
  "Customer Name",
  "Phone Number",
] as const;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 100_000;

const rowCollectionSchema = z.array(z.unknown()).max(MAX_ROWS);
const matrixRowsSchema = z
  .array(z.array(z.unknown()))
  .max(MAX_ROWS);
const appsScriptMatrixPayloadSchema = z
  .object({
    ok: z.literal(true),
    worksheet: z.literal("Xfers"),
    headers: z.array(z.string()),
    rows: matrixRowsSchema,
    rowCount: z.number().int().nonnegative().optional(),
    sourceRowNumbers: z
      .array(z.number().int().positive())
      .max(MAX_ROWS)
      .optional(),
    generatedAt: z.string().optional(),
  })
  .passthrough()
  .superRefine((payload, ctx) => {
    if (
      payload.rowCount !== undefined &&
      payload.rowCount !== payload.rows.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowCount"],
        message: "rowCount must match the number of transfer rows.",
      });
    }
    if (
      payload.sourceRowNumbers !== undefined &&
      payload.sourceRowNumbers.length !== payload.rows.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRowNumbers"],
        message: "sourceRowNumbers must align with the transfer rows.",
      });
    }
  });
const appsScriptPayloadSchema = z.union([
  rowCollectionSchema,
  z
    .object({
      success: z.boolean().optional(),
      ok: z.boolean().optional(),
      data: rowCollectionSchema.optional(),
      rows: rowCollectionSchema.optional(),
      transfers: rowCollectionSchema.optional(),
    })
    .passthrough(),
]);

export type TransferSheetConfig = {
  endpointUrl: string;
  secret: string;
  timeZone: string;
};

export class TransferSheetConfigurationError extends Error {}

export function parseOpener(value: string) {
  const opener = extractOpenerAmericanName(value);
  if (!opener?.sheetRealName) return null;
  return {
    sheetRealName: opener.sheetRealName,
    sheetAmericanName: opener.sheetAmericanName,
  };
}

export function normalizeAmericanName(value: string) {
  return normalizeSharedAmericanName(value);
}

function headerIndexes(headers: readonly unknown[]) {
  const indexByHeader = new Map<string, number>();
  const requiredByNormalizedHeader = new Map(
    REQUIRED_HEADERS.map((header) => [
      normalizeSheetHeader(header),
      header,
    ]),
  );

  headers.forEach((rawHeader, index) => {
    const header = normalizeSheetHeader(rawHeader);
    if (!header) return;
    if (
      indexByHeader.has(header) &&
      requiredByNormalizedHeader.has(header)
    ) {
      throw new TransferSheetConfigurationError(
        `Transfer source contains the required header more than once: ${requiredByNormalizedHeader.get(header)}.`,
      );
    }
    if (!indexByHeader.has(header)) indexByHeader.set(header, index);
  });

  const missing = REQUIRED_HEADERS.filter(
    (header) => !indexByHeader.has(normalizeSheetHeader(header)),
  );
  if (missing.length > 0) {
    throw new TransferSheetConfigurationError(
      `Transfer source is missing required headers: ${missing.join(", ")}.`,
    );
  }

  return indexByHeader;
}

function cellText(value: unknown, header: string) {
  const text = sheetCellText(value);
  if (text !== null) return text;
  throw new TransferSheetConfigurationError(
    `Transfer source contains an invalid ${header} value.`,
  );
}

type NormalizedSourceRow = {
  rowNumber: number;
  timestamp: string;
  opener: string;
  customerName: string;
  phoneNumber: string;
};

function normalizeMatrixRows(
  rows: readonly unknown[],
  sourceRowNumbers?: readonly number[],
) {
  const matrix = rows as unknown[][];
  if (matrix.length === 0) return [];
  const indexes = headerIndexes(matrix[0]);
  const value = (
    row: readonly unknown[],
    header: (typeof REQUIRED_HEADERS)[number],
  ) =>
    cellText(
      row[indexes.get(normalizeSheetHeader(header)) ?? -1],
      header,
    );

  return matrix.slice(1).map(
    (row, index): NormalizedSourceRow => ({
      rowNumber: sourceRowNumbers?.[index] ?? index + 2,
      timestamp: value(row, "Timestamp"),
      opener: value(row, "Opener"),
      customerName: value(row, "Customer Name"),
      phoneNumber: value(row, "Phone Number"),
    }),
  );
}

function normalizeObjectRows(rows: readonly unknown[]) {
  if (rows.length === 0) return [];
  const objects = rows as Record<string, unknown>[];
  const normalizedRows = objects.map((row) => {
    const values = new Map<string, unknown>();
    for (const [rawHeader, value] of Object.entries(row)) {
      const header = normalizeSheetHeader(rawHeader);
      if (!header) continue;
      if (
        values.has(header) &&
        REQUIRED_HEADERS.some(
          (requiredHeader) =>
            normalizeSheetHeader(requiredHeader) === header,
        )
      ) {
        const requiredHeader = REQUIRED_HEADERS.find(
          (candidate) => normalizeSheetHeader(candidate) === header,
        );
        throw new TransferSheetConfigurationError(
          `Transfer source contains the required header more than once: ${requiredHeader}.`,
        );
      }
      values.set(header, value);
    }
    return values;
  });
  headerIndexes(
    Array.from(
      new Set(normalizedRows.flatMap((row) => Array.from(row.keys()))),
    ),
  );

  const value = (
    row: Map<string, unknown>,
    header: (typeof REQUIRED_HEADERS)[number],
  ) => cellText(row.get(normalizeSheetHeader(header)), header);

  return normalizedRows.map(
    (row, index): NormalizedSourceRow => ({
      rowNumber: index + 2,
      timestamp: value(row, "Timestamp"),
      opener: value(row, "Opener"),
      customerName: value(row, "Customer Name"),
      phoneNumber: value(row, "Phone Number"),
    }),
  );
}

function normalizeRows(rows: readonly unknown[]) {
  if (rows.length === 0) return [];
  if (rows.every(Array.isArray)) return normalizeMatrixRows(rows);
  if (
    rows.every(
      (row) =>
        typeof row === "object" && row !== null && !Array.isArray(row),
    )
  ) {
    return normalizeObjectRows(rows);
  }
  throw new TransferSheetConfigurationError(
    "The Google Apps Script response contains an invalid row collection.",
  );
}

export function parseTransferRows(
  rows: readonly unknown[],
  config: Pick<TransferSheetConfig, "timeZone">,
): TransferReadResult {
  return parseNormalizedTransferRows(normalizeRows(rows), config);
}

function parseNormalizedTransferRows(
  normalizedRows: readonly NormalizedSourceRow[],
  config: Pick<TransferSheetConfig, "timeZone">,
): TransferReadResult {
  const records: TransferRecord[] = [];
  const diagnostics: TransferDiagnostic[] = [];
  const seen = new Set<string>();

  for (const row of normalizedRows) {
    if (
      !row.timestamp &&
      !row.opener &&
      !row.customerName &&
      !row.phoneNumber
    ) {
      continue;
    }

    const opener = parseOpener(row.opener);
    const timestamp = parseSheetTimestamp(row.timestamp, config.timeZone);
    const fingerprint = createHash("sha256")
      .update(
        [row.timestamp, row.opener, row.customerName, row.phoneNumber].join(
          "\u001f",
        ),
      )
      .digest("hex");

    if (seen.has(fingerprint)) {
      diagnostics.push({
        rowNumber: row.rowNumber,
        code: "duplicate",
        message: `Row ${row.rowNumber} duplicates an earlier transfer row.`,
      });
      continue;
    }
    seen.add(fingerprint);

    if (!opener) {
      diagnostics.push({
        rowNumber: row.rowNumber,
        code: "malformed_opener",
        message: `Row ${row.rowNumber} has an invalid Opener value.`,
      });
      continue;
    }
    if (!timestamp.ok) {
      diagnostics.push({
        rowNumber: row.rowNumber,
        code: "invalid_timestamp",
        message: `Row ${row.rowNumber} has an ${timestamp.reason} Timestamp value.`,
        sheetAmericanName: opener.sheetAmericanName,
      });
    }

    records.push({
      sourceRowId: `Xfers:${row.rowNumber}`,
      rawTimestamp: row.timestamp,
      occurredAt: timestamp.ok ? timestamp.value : null,
      ...opener,
      customerName: row.customerName,
      phoneNumber: row.phoneNumber,
    });
  }

  return { records, diagnostics };
}

function parseTransferMatrixPayload(
  payload: z.infer<typeof appsScriptMatrixPayloadSchema>,
  config: Pick<TransferSheetConfig, "timeZone">,
) {
  return parseNormalizedTransferRows(
    normalizeMatrixRows(
      [payload.headers, ...payload.rows],
      payload.sourceRowNumbers,
    ),
    config,
  );
}

function parseAppsScriptJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response is not valid JSON.",
    );
  }
}

function parseTransferPayload(
  json: unknown,
  config: Pick<TransferSheetConfig, "timeZone">,
) {
  const parsed = appsScriptPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response has an invalid shape.",
    );
  }

  const payload = parsed.data;
  if (Array.isArray(payload)) return parseTransferRows(payload, config);
  if (payload.success === false || payload.ok === false) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script transfer request was rejected.",
    );
  }

  if ("headers" in payload || "worksheet" in payload) {
    if (
      typeof payload.worksheet === "string" &&
      payload.worksheet !== "Xfers"
    ) {
      throw new TransferSheetConfigurationError(
        `The Google Apps Script returned the unexpected worksheet "${payload.worksheet}".`,
      );
    }

    const matrixPayload = appsScriptMatrixPayloadSchema.safeParse(payload);
    if (!matrixPayload.success) {
      throw new TransferSheetConfigurationError(
        "The Google Apps Script headers-and-rows response has an invalid shape.",
      );
    }

    return parseTransferMatrixPayload(matrixPayload.data, config);
  }

  const rows = payload.transfers ?? payload.rows ?? payload.data;
  if (!rows) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response does not contain transfer rows.",
    );
  }
  return parseTransferRows(rows, config);
}

export function parseAppsScriptTransferResponse(
  content: string,
  config: Pick<TransferSheetConfig, "timeZone">,
) {
  return parseTransferPayload(parseAppsScriptJson(content), config);
}

export type ClosedSourceResult =
  | {
      status: "ready";
      data: ClosedDealReadResult;
    }
  | {
      status: "source_error";
      kind: ClosedSourceErrorKind;
      message: string;
      worksheet: "Closed";
      headerValidationStatus: "invalid" | "unknown";
    };

export type AppsScriptLeaderboardSources = {
  transfers: TransferReadResult;
  closed: ClosedSourceResult;
};

function parseClosedSource(
  json: unknown,
  config: Pick<TransferSheetConfig, "timeZone">,
): ClosedSourceResult {
  if (
    typeof json !== "object" ||
    json === null ||
    Array.isArray(json) ||
    !("closed" in json)
  ) {
    return {
      status: "source_error",
      kind: "unavailable",
      message: "The closed-deals source could not be processed.",
      worksheet: "Closed",
      headerValidationStatus: "unknown",
    };
  }

  const closed = (json as { closed?: unknown }).closed;
  const failed = closedAppsScriptFailureSchema.safeParse(closed);
  if (failed.success) {
    const missingHeaders =
      failed.data.missingHeaders &&
      failed.data.missingHeaders.length > 0;
    return {
      status: "source_error",
      kind: missingHeaders ? "configuration" : "unavailable",
      message: missingHeaders
        ? "The Closed worksheet does not contain all required headers."
        : "The closed-deals source could not be processed.",
      worksheet: "Closed",
      headerValidationStatus: missingHeaders ? "invalid" : "unknown",
    };
  }

  try {
    return {
      status: "ready",
      data: parseClosedAppsScriptSuccess(closed, config),
    };
  } catch (error) {
    const missingHeaders =
      error instanceof ClosedSheetConfigurationError &&
      error.message.includes("missing required headers");
    return {
      status: "source_error",
      kind: missingHeaders ? "configuration" : "unavailable",
      message: missingHeaders
        ? "The Closed worksheet does not contain all required headers."
        : "The closed-deals source could not be processed.",
      worksheet: "Closed",
      headerValidationStatus: missingHeaders ? "invalid" : "unknown",
    };
  }
}

export function parseAppsScriptLeaderboardResponse(
  content: string,
  config: Pick<TransferSheetConfig, "timeZone">,
): AppsScriptLeaderboardSources {
  const json = parseAppsScriptJson(content);
  return {
    transfers: parseTransferPayload(json, config),
    closed: parseClosedSource(json, config),
  };
}

async function readAppsScriptSources(config: TransferSheetConfig) {
  const response = await fetch(config.endpointUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ secret: config.secret }),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Google Apps Script transfer request failed (${response.status}).`,
    );
  }

  const declaredSize = Number(response.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_RESPONSE_BYTES) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response is too large.",
    );
  }
  const content = await response.text();
  if (Buffer.byteLength(content, "utf8") > MAX_RESPONSE_BYTES) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response is too large.",
    );
  }
  return parseAppsScriptLeaderboardResponse(content, config);
}

export class GoogleAppsScriptTransfersProvider implements TransfersProvider {
  constructor(private readonly config: TransferSheetConfig) {}

  async listTransfers() {
    return (await readAppsScriptSources(this.config)).transfers;
  }

  async listSources() {
    return readAppsScriptSources(this.config);
  }
}
