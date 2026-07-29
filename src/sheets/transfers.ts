import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  TransferDiagnostic,
  TransferReadResult,
  TransferRecord,
  TransfersProvider,
} from "@/sheets/contracts";
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

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function parseOpener(value: string) {
  const normalized = value.trim();
  const separator = normalized.indexOf("-");
  if (separator < 1 || separator === normalized.length - 1) return null;
  const sheetRealName = normalized.slice(0, separator).trim();
  const sheetAmericanName = normalized.slice(separator + 1).trim();
  if (!sheetRealName || !sheetAmericanName) return null;
  return { sheetRealName, sheetAmericanName };
}

export function normalizeAmericanName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[.’'`]/gu, "")
    .replace(/[\p{Pd},;:()[\]{}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIndexes(headers: readonly unknown[]) {
  const indexByHeader = new Map<string, number>();
  const requiredByNormalizedHeader = new Map(
    REQUIRED_HEADERS.map((header) => [normalizeHeader(header), header]),
  );

  headers.forEach((rawHeader, index) => {
    const header = normalizeHeader(rawHeader);
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
    (header) => !indexByHeader.has(normalizeHeader(header)),
  );
  if (missing.length > 0) {
    throw new TransferSheetConfigurationError(
      `Transfer source is missing required headers: ${missing.join(", ")}.`,
    );
  }

  return indexByHeader;
}

function cellText(value: unknown, header: string) {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
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

function normalizeMatrixRows(rows: readonly unknown[]) {
  const matrix = rows as unknown[][];
  if (matrix.length === 0) return [];
  const indexes = headerIndexes(matrix[0]);
  const value = (
    row: readonly unknown[],
    header: (typeof REQUIRED_HEADERS)[number],
  ) => cellText(row[indexes.get(normalizeHeader(header)) ?? -1], header);

  return matrix.slice(1).map(
    (row, index): NormalizedSourceRow => ({
      rowNumber: index + 2,
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
      const header = normalizeHeader(rawHeader);
      if (!header) continue;
      if (
        values.has(header) &&
        REQUIRED_HEADERS.some(
          (requiredHeader) => normalizeHeader(requiredHeader) === header,
        )
      ) {
        const requiredHeader = REQUIRED_HEADERS.find(
          (candidate) => normalizeHeader(candidate) === header,
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
  ) => cellText(row.get(normalizeHeader(header)), header);

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
  const normalizedRows = normalizeRows(rows);
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

export function parseAppsScriptTransferResponse(
  content: string,
  config: Pick<TransferSheetConfig, "timeZone">,
) {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response is not valid JSON.",
    );
  }

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

    return parseTransferRows(
      [matrixPayload.data.headers, ...matrixPayload.data.rows],
      config,
    );
  }

  const rows = payload.transfers ?? payload.rows ?? payload.data;
  if (!rows) {
    throw new TransferSheetConfigurationError(
      "The Google Apps Script response does not contain transfer rows.",
    );
  }
  return parseTransferRows(rows, config);
}

async function readAppsScriptTransfers(config: TransferSheetConfig) {
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
  return parseAppsScriptTransferResponse(content, config);
}

export class GoogleAppsScriptTransfersProvider implements TransfersProvider {
  constructor(private readonly config: TransferSheetConfig) {}

  async listTransfers() {
    return readAppsScriptTransfers(this.config);
  }
}
