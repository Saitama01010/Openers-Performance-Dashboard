import { parse } from "csv-parse/sync";

export const MAX_USER_CSV_BYTES = 1024 * 1024;
export const MAX_USER_CSV_ROWS = 500;

export const USER_CSV_HEADERS = {
  realName: "Real Name",
  americanName: "American Name",
  shift: "Shift",
  email: "Email",
} as const;

type CanonicalHeader = keyof typeof USER_CSV_HEADERS;
export type ImportRole = "admin" | "manager" | "agent";

export type UserImportPreviewRow = {
  rowNumber: number;
  realName: string;
  americanName: string;
  shift: string;
  email: string;
  role: ImportRole | null;
  teamId: string | null;
  teamName: string | null;
  errors: string[];
  warnings: string[];
  validForAssignment: boolean;
};

export type UserImportPreview = {
  headers: string[];
  rows: UserImportPreviewRow[];
  ignoredEmptyRows: number;
  fatalErrors: string[];
};

function normalizedCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedKey(value: string) {
  return normalizedCell(value).replace(/\s+/g, " ").toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function hasSpreadsheetFormulaRisk(value: string) {
  return /^[=+\-@]/.test(value.trimStart());
}

function canonicalHeader(value: string): CanonicalHeader | null {
  const normalized = normalizedCell(value.replace(/^\uFEFF/, "")).toLowerCase();

  for (const [canonical, label] of Object.entries(USER_CSV_HEADERS)) {
    if (label.toLowerCase() === normalized) {
      return canonical as CanonicalHeader;
    }
  }
  return null;
}

export function parseUserImportCsv(input: {
  content: string;
  existingEmails?: Iterable<string>;
  existingDialerNames?: Iterable<string>;
  teams?: { id: string; name: string; active: boolean }[];
}): UserImportPreview {
  if (Buffer.byteLength(input.content, "utf8") > MAX_USER_CSV_BYTES) {
    return {
      headers: [],
      rows: [],
      ignoredEmptyRows: 0,
      fatalErrors: ["The CSV exceeds the 1 MB file limit."],
    };
  }

  let records: string[][];
  try {
    records = parse(input.content, {
      bom: true,
      relax_column_count: false,
      skip_empty_lines: false,
    }) as string[][];
  } catch {
    return {
      headers: [],
      rows: [],
      ignoredEmptyRows: 0,
      fatalErrors: ["The CSV is malformed and could not be read."],
    };
  }

  const rawHeaders = (records.shift() ?? []).map((header) =>
    normalizedCell(header.replace(/^\uFEFF/, "")),
  );
  const fatalErrors: string[] = [];
  const headerIndexes = new Map<CanonicalHeader, number>();

  rawHeaders.forEach((header, index) => {
    const canonical = canonicalHeader(header);
    if (!canonical) {
      fatalErrors.push(`Unsupported CSV header: ${header || "(blank)"}.`);
      return;
    }
    if (headerIndexes.has(canonical)) {
      fatalErrors.push(
        `Multiple columns map to ${USER_CSV_HEADERS[canonical]}.`,
      );
      return;
    }
    headerIndexes.set(canonical, index);
  });

  for (const required of Object.keys(USER_CSV_HEADERS) as CanonicalHeader[]) {
    if (!headerIndexes.has(required)) {
      fatalErrors.push(
        `Missing required CSV header: ${USER_CSV_HEADERS[required]}.`,
      );
    }
  }

  if (records.length > MAX_USER_CSV_ROWS) {
    fatalErrors.push(`The CSV exceeds the ${MAX_USER_CSV_ROWS}-row limit.`);
  }

  if (fatalErrors.length > 0) {
    return { headers: rawHeaders, rows: [], ignoredEmptyRows: 0, fatalErrors };
  }

  const existingEmails = new Set(
    Array.from(input.existingEmails ?? [], normalizedKey),
  );
  const existingAmericanNames = new Set(
    Array.from(input.existingDialerNames ?? [], normalizedKey),
  );
  const emailCounts = new Map<string, number>();
  const americanNameCounts = new Map<string, number>();
  const exactCounts = new Map<string, number>();
  const normalizedRows = records.map((record, index) => {
    const value = (header: CanonicalHeader) =>
      normalizedCell(record[headerIndexes.get(header) ?? -1]);
    const realName = value("realName");
    const americanName = value("americanName");
    const shift = value("shift");
    const email = value("email").toLowerCase();
    const empty = record.every((cell) => normalizedCell(cell).length === 0);
    const emailKey = normalizedKey(email);
    const americanNameKey = normalizedKey(americanName);
    const exactKey = [
      normalizedKey(realName),
      americanNameKey,
      normalizedKey(shift),
      emailKey,
    ].join("|");

    if (!empty) {
      emailCounts.set(emailKey, (emailCounts.get(emailKey) ?? 0) + 1);
      americanNameCounts.set(
        americanNameKey,
        (americanNameCounts.get(americanNameKey) ?? 0) + 1,
      );
      exactCounts.set(exactKey, (exactCounts.get(exactKey) ?? 0) + 1);
    }

    return {
      rowNumber: index + 2,
      realName,
      americanName,
      shift,
      email,
      emailKey,
      americanNameKey,
      exactKey,
      empty,
    };
  });

  let ignoredEmptyRows = 0;
  const rows: UserImportPreviewRow[] = [];

  for (const row of normalizedRows) {
    if (row.empty) {
      ignoredEmptyRows += 1;
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.realName) errors.push("Real Name is required.");
    if (!row.americanName) errors.push("American Name is required.");
    if (!row.shift) errors.push("Shift is required.");
    if (!row.email) errors.push("Email is required.");
    else if (!isEmail(row.email)) errors.push("Email format is invalid.");
    if (
      [row.realName, row.americanName, row.shift, row.email].some(
        hasSpreadsheetFormulaRisk,
      )
    ) {
      errors.push("Values beginning with =, +, -, or @ are not allowed.");
    }
    if ((emailCounts.get(row.emailKey) ?? 0) > 1) {
      errors.push("Email is duplicated inside this CSV.");
    }
    if ((americanNameCounts.get(row.americanNameKey) ?? 0) > 1) {
      errors.push("American Name is duplicated inside this CSV.");
    }
    if ((exactCounts.get(row.exactKey) ?? 0) > 1) {
      errors.push("This row is duplicated inside the CSV.");
    }
    if (existingEmails.has(row.emailKey)) {
      errors.push("A user with this email already exists.");
    }
    if (existingAmericanNames.has(row.americanNameKey)) {
      errors.push("This American Name is already assigned.");
    }

    warnings.push("Assign a role before import.");
    warnings.push("Assign a team before import.");

    rows.push({
      rowNumber: row.rowNumber,
      realName: row.realName,
      americanName: row.americanName,
      shift: row.shift,
      email: row.email,
      role: null,
      teamId: null,
      teamName: null,
      errors,
      warnings,
      validForAssignment: errors.length === 0,
    });
  }

  return { headers: rawHeaders, rows, ignoredEmptyRows, fatalErrors };
}
