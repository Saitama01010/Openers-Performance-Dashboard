import "server-only";

import { createHash, createSign } from "node:crypto";
import { parse } from "csv-parse/sync";

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

export type TransferSheetConfig = {
  sheetId: string;
  gid: string;
  range?: string;
  timeZone: string;
  serviceAccountEmail?: string;
  serviceAccountPrivateKey?: string;
};

export class TransferSheetConfigurationError extends Error {}

let cachedServiceAccountToken:
  | { email: string; token: string; expiresAt: number }
  | null = null;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
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

export function parseTransferCsv(
  content: string,
  config: Pick<TransferSheetConfig, "gid" | "timeZone">,
): TransferReadResult {
  let rows: string[][];
  try {
    rows = parse(content, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as string[][];
  } catch {
    throw new TransferSheetConfigurationError(
      "The transfer Sheet response is not valid CSV.",
    );
  }

  const headers = (rows.shift() ?? []).map(normalizeHeader);
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!header) return;
    if (indexByHeader.has(header) && REQUIRED_HEADERS.includes(
      header as (typeof REQUIRED_HEADERS)[number],
    )) {
      throw new TransferSheetConfigurationError(
        `Transfer Sheet contains the required header more than once: ${header}.`,
      );
    }
    if (!indexByHeader.has(header)) indexByHeader.set(header, index);
  });
  const missing = REQUIRED_HEADERS.filter(
    (header) => !indexByHeader.has(header),
  );
  if (missing.length > 0) {
    throw new TransferSheetConfigurationError(
      `Transfer Sheet is missing required headers: ${missing.join(", ")}.`,
    );
  }

  const records: TransferRecord[] = [];
  const diagnostics: TransferDiagnostic[] = [];
  const seen = new Set<string>();
  const value = (row: string[], header: (typeof REQUIRED_HEADERS)[number]) =>
    String(row[indexByHeader.get(header) ?? -1] ?? "").trim();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((cell) => String(cell ?? "").trim() === "")) return;
    const rawTimestamp = value(row, "Timestamp");
    const opener = parseOpener(value(row, "Opener"));
    const timestamp = parseSheetTimestamp(rawTimestamp, config.timeZone);
    const customerName = value(row, "Customer Name");
    const phoneNumber = value(row, "Phone Number");
    const fingerprint = createHash("sha256")
      .update(
        [rawTimestamp, value(row, "Opener"), customerName, phoneNumber].join(
          "\u001f",
        ),
      )
      .digest("hex");

    if (seen.has(fingerprint)) {
      diagnostics.push({
        rowNumber,
        code: "duplicate",
        message: `Row ${rowNumber} duplicates an earlier transfer row.`,
      });
      return;
    }
    seen.add(fingerprint);

    if (!opener) {
      diagnostics.push({
        rowNumber,
        code: "malformed_opener",
        message: `Row ${rowNumber} has an invalid Opener value.`,
      });
      return;
    }
    if (!timestamp.ok) {
      diagnostics.push({
        rowNumber,
        code: "invalid_timestamp",
        message: `Row ${rowNumber} has an ${timestamp.reason} Timestamp value.`,
        sheetAmericanName: opener.sheetAmericanName,
      });
    }

    records.push({
      sourceRowId: `${config.gid}:${rowNumber}`,
      rawTimestamp,
      occurredAt: timestamp.ok ? timestamp.value : null,
      ...opener,
      customerName,
      phoneNumber,
    });
  });

  return { records, diagnostics };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64url");
}

async function getServiceAccountToken(config: TransferSheetConfig) {
  if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
    return null;
  }
  if (
    cachedServiceAccountToken?.email === config.serviceAccountEmail &&
    cachedServiceAccountToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedServiceAccountToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(
    config.serviceAccountPrivateKey,
    "base64url",
  )}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("Google service-account authentication failed.");
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Google did not return an access token.");
  }
  cachedServiceAccountToken = {
    email: config.serviceAccountEmail,
    token: body.access_token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };
  return body.access_token;
}

async function readSheetCsv(config: TransferSheetConfig) {
  const token = await getServiceAccountToken(config);
  if (token) {
    if (!config.range) {
      throw new TransferSheetConfigurationError(
        "An authenticated transfer Sheet requires GOOGLE_TRANSFERS_SHEET_RANGE.",
      );
    }
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        config.sheetId,
      )}/values/${encodeURIComponent(config.range)}`,
    );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Google Sheets API request failed (${response.status}).`);
    }
    const body = (await response.json()) as { values?: unknown[][] };
    const values = body.values ?? [];
    return values
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "");
            return /[",\r\n]/.test(value)
              ? `"${value.replaceAll('"', '""')}"`
              : value;
          })
          .join(","),
      )
      .join("\n");
  }

  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      config.sheetId,
    )}/export`,
  );
  url.searchParams.set("format", "csv");
  url.searchParams.set("gid", config.gid);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Google transfer Sheet request failed (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/csv")) {
    throw new TransferSheetConfigurationError(
      "The transfer Sheet is not publicly readable; configure server-side service-account credentials and a range.",
    );
  }
  return response.text();
}

export class GoogleTransfersProvider implements TransfersProvider {
  constructor(private readonly config: TransferSheetConfig) {}

  async listTransfers() {
    const csv = await readSheetCsv(this.config);
    return parseTransferCsv(csv, this.config);
  }
}
