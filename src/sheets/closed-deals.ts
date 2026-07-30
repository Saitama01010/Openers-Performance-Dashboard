import { z } from "zod";

import type {
  ClosedDealDiagnostic,
  ClosedDealReadResult,
  NormalizedClosedDeal,
} from "@/sheets/contracts";
import {
  extractOpenerAmericanName,
  normalizeAmericanName,
  normalizeSheetHeader,
  sheetCellText,
} from "@/sheets/normalization";
import { parseSheetTimestamp } from "@/sheets/timestamp";

export const REQUIRED_CLOSED_HEADERS = [
  "Timestamp",
  "Closer",
  "Customer Name",
  "File Number",
  "Debt Amount",
  "Ready For Submission",
  "Opener",
] as const;

export const CLOSED_DEALS_UNCONFIGURED_MESSAGE =
  "Closed-deal performance is available on the LeaderBoard from the server-side Apps Script source.";

const MAX_ROWS = 100_000;
const closedRowsSchema = z.array(z.array(z.unknown())).max(MAX_ROWS);

export const closedAppsScriptSuccessSchema = z
  .object({
    ok: z.literal(true),
    worksheet: z.literal("Closed"),
    headers: z.array(z.string()),
    rows: closedRowsSchema,
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
        message: "rowCount must match the number of Closed rows.",
      });
    }
    if (
      payload.sourceRowNumbers !== undefined &&
      payload.sourceRowNumbers.length !== payload.rows.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRowNumbers"],
        message: "sourceRowNumbers must align with the Closed rows.",
      });
    }
  });

export const closedAppsScriptFailureSchema = z
  .object({
    ok: z.literal(false),
    worksheet: z.literal("Closed"),
    error: z.string().optional(),
    missingHeaders: z.array(z.string()).optional(),
  })
  .passthrough();

export type ClosedSourceErrorKind = "configuration" | "unavailable";

export class ClosedSheetConfigurationError extends Error {}

function closedHeaderIndexes(headers: readonly unknown[]) {
  const indexes = new Map<string, number>();
  const required = new Map(
    REQUIRED_CLOSED_HEADERS.map((header) => [
      normalizeSheetHeader(header),
      header,
    ]),
  );

  headers.forEach((value, index) => {
    const header = normalizeSheetHeader(value);
    if (!header) return;
    if (indexes.has(header) && required.has(header)) {
      throw new ClosedSheetConfigurationError(
        `Closed source contains the required header more than once: ${required.get(header)}.`,
      );
    }
    if (!indexes.has(header)) indexes.set(header, index);
  });

  const missing = REQUIRED_CLOSED_HEADERS.filter(
    (header) => !indexes.has(normalizeSheetHeader(header)),
  );
  if (missing.length > 0) {
    throw new ClosedSheetConfigurationError(
      `Closed source is missing required headers: ${missing.join(", ")}.`,
    );
  }
  return indexes;
}

function diagnostic(
  sourceRowNumber: number | null,
  code: ClosedDealDiagnostic["code"],
  message: string,
): ClosedDealDiagnostic {
  return { sourceRowNumber, code, message };
}

export function parseClosedRows(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
  config: { timeZone: string; sourceRowNumbers?: readonly number[] },
): ClosedDealReadResult {
  const indexes = closedHeaderIndexes(headers);
  const records: NormalizedClosedDeal[] = [];
  const diagnostics: ClosedDealDiagnostic[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const sourceRowNumber = config.sourceRowNumbers?.[index] ?? index + 2;
    const trimmedCells = row.map(sheetCellText);
    if (trimmedCells.every((cell) => cell === "")) continue;

    const validationErrors: string[] = [];
    let hasInvalidCell = false;
    const value = (header: (typeof REQUIRED_CLOSED_HEADERS)[number]) => {
      const cell = sheetCellText(
        row[indexes.get(normalizeSheetHeader(header)) ?? -1],
      );
      if (cell === null) {
        validationErrors.push(`invalid ${header} value`);
        hasInvalidCell = true;
        return "";
      }
      return cell;
    };

    const rawTimestamp = value("Timestamp");
    const closer = value("Closer");
    const customerName = value("Customer Name");
    const fileNumber = value("File Number");
    const debtAmount = value("Debt Amount");
    const readyForSubmission = value("Ready For Submission");
    const sheetOpener = value("Opener");
    const timestamp = parseSheetTimestamp(rawTimestamp, config.timeZone);
    const opener = extractOpenerAmericanName(sheetOpener);

    if (!rawTimestamp) {
      validationErrors.push("missing Timestamp");
      diagnostics.push(
        diagnostic(
          sourceRowNumber,
          "missing_timestamp",
          `Closed row ${sourceRowNumber} has an empty Timestamp.`,
        ),
      );
    } else if (!timestamp.ok) {
      validationErrors.push("invalid Timestamp");
      diagnostics.push(
        diagnostic(
          sourceRowNumber,
          "invalid_timestamp",
          `Closed row ${sourceRowNumber} has an invalid Timestamp.`,
        ),
      );
    }

    if (!sheetOpener) {
      validationErrors.push("missing Opener");
      diagnostics.push(
        diagnostic(
          sourceRowNumber,
          "missing_opener",
          `Closed row ${sourceRowNumber} has an empty Opener.`,
        ),
      );
    } else if (!opener?.sheetAmericanName) {
      validationErrors.push("empty extracted American Name");
      diagnostics.push(
        diagnostic(
          sourceRowNumber,
          "invalid_opener",
          `Closed row ${sourceRowNumber} has an invalid Opener.`,
        ),
      );
    }

    if (hasInvalidCell) {
      diagnostics.push(
        diagnostic(
          sourceRowNumber,
          "invalid_cell",
          `Closed row ${sourceRowNumber} contains an unsupported cell value.`,
        ),
      );
    }

    const extractedAmericanName = opener?.sheetAmericanName ?? "";
    records.push({
      sourceRowNumber,
      timestamp: timestamp.ok ? timestamp.value : null,
      timestampIso: timestamp.ok ? timestamp.value.toISOString() : null,
      closer,
      customerName,
      fileNumber,
      debtAmount,
      readyForSubmission,
      sheetOpener,
      extractedAmericanName,
      normalizedAmericanName: normalizeAmericanName(extractedAmericanName),
      matchedUserId: null,
      matchStatus: validationErrors.length > 0 ? "invalid" : "unmatched",
      validationErrors,
    });
  }

  return {
    worksheet: "Closed",
    generatedAt: null,
    headerValidationStatus: "valid",
    totalNonEmptyRows: records.length,
    records,
    diagnostics,
  };
}

export function parseClosedAppsScriptSuccess(
  value: unknown,
  config: { timeZone: string },
) {
  const parsed = closedAppsScriptSuccessSchema.safeParse(value);
  if (!parsed.success) {
    throw new ClosedSheetConfigurationError(
      "The Closed worksheet response has an invalid shape.",
    );
  }

  const result = parseClosedRows(parsed.data.headers, parsed.data.rows, {
    timeZone: config.timeZone,
    sourceRowNumbers: parsed.data.sourceRowNumbers,
  });
  return {
    ...result,
    generatedAt: parsed.data.generatedAt ?? null,
  };
}
