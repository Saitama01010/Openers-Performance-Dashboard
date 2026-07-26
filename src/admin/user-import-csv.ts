import { parse } from "csv-parse/sync";

export const MAX_USER_CSV_BYTES = 1024 * 1024;
export const MAX_USER_CSV_ROWS = 500;

export const USER_CSV_HEADER_ALIASES = {
  username: ["username", "user name", "name"],
  dialerName: ["dialer name", "dialer", "dialer username"],
  email: ["email", "email address"],
  role: ["role", "user role"],
  team: ["team", "team name"],
} as const;

type CanonicalHeader = keyof typeof USER_CSV_HEADER_ALIASES;
export type ImportRole = "admin" | "manager" | "agent";

export type UserImportPreviewRow = {
  rowNumber: number;
  username: string;
  dialerName: string;
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

const ROLE_ALIASES: Record<string, ImportRole> = {
  admin: "admin",
  administrator: "admin",
  manager: "manager",
  "team manager": "manager",
  agent: "agent",
};

function normalizedCell(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedKey(value: string) {
  return normalizedCell(value).toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function hasSpreadsheetFormulaRisk(value: string) {
  return /^[=+\-@]/.test(value.trimStart());
}

function canonicalHeader(value: string): CanonicalHeader | null {
  const normalized = normalizedKey(value.replace(/^\uFEFF/, ""));

  for (const [canonical, aliases] of Object.entries(USER_CSV_HEADER_ALIASES)) {
    if ((aliases as readonly string[]).includes(normalized)) {
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
      fatalErrors.push(`Multiple columns map to ${canonical}.`);
      return;
    }
    headerIndexes.set(canonical, index);
  });

  for (const required of ["username", "dialerName", "email"] as const) {
    if (!headerIndexes.has(required)) {
      fatalErrors.push(`Missing required CSV header: ${required}.`);
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
  const existingDialerNames = new Set(
    Array.from(input.existingDialerNames ?? [], normalizedKey),
  );
  const teamsByName = new Map<string, { id: string; name: string; active: boolean }>();
  for (const team of input.teams ?? []) {
    teamsByName.set(normalizedKey(team.name), team);
  }

  const emailCounts = new Map<string, number>();
  const dialerCounts = new Map<string, number>();
  const exactCounts = new Map<string, number>();
  const normalizedRows = records.map((record, index) => {
    const value = (header: CanonicalHeader) =>
      normalizedCell(record[headerIndexes.get(header) ?? -1]);
    const username = value("username");
    const dialerName = value("dialerName");
    const email = value("email").toLowerCase();
    const roleInput = value("role");
    const teamInput = value("team");
    const empty = record.every((cell) => normalizedCell(cell).length === 0);
    const emailKey = normalizedKey(email);
    const dialerKey = normalizedKey(dialerName);
    const exactKey = [normalizedKey(username), dialerKey, emailKey].join("|");

    if (!empty) {
      emailCounts.set(emailKey, (emailCounts.get(emailKey) ?? 0) + 1);
      dialerCounts.set(dialerKey, (dialerCounts.get(dialerKey) ?? 0) + 1);
      exactCounts.set(exactKey, (exactCounts.get(exactKey) ?? 0) + 1);
    }

    return {
      rowNumber: index + 2,
      username,
      dialerName,
      email,
      roleInput,
      teamInput,
      emailKey,
      dialerKey,
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
    if (!row.username) errors.push("Username is required.");
    if (!row.dialerName) errors.push("Dialer name is required.");
    if (!row.email) errors.push("Email is required.");
    else if (!isEmail(row.email)) errors.push("Email format is invalid.");
    if (
      [row.username, row.dialerName, row.email, row.roleInput, row.teamInput].some(
        hasSpreadsheetFormulaRisk,
      )
    ) {
      errors.push("Values beginning with =, +, -, or @ are not allowed.");
    }
    if ((emailCounts.get(row.emailKey) ?? 0) > 1) {
      errors.push("Email is duplicated inside this CSV.");
    }
    if ((dialerCounts.get(row.dialerKey) ?? 0) > 1) {
      errors.push("Dialer name is duplicated inside this CSV.");
    }
    if ((exactCounts.get(row.exactKey) ?? 0) > 1) {
      errors.push("This row is duplicated inside the CSV.");
    }
    if (existingEmails.has(row.emailKey)) {
      errors.push("A user with this email already exists.");
    }
    if (existingDialerNames.has(row.dialerKey)) {
      errors.push("This dialer name is already assigned.");
    }

    const role = row.roleInput
      ? ROLE_ALIASES[normalizedKey(row.roleInput)] ?? null
      : null;
    if (row.roleInput && !role) errors.push(`Unknown role: ${row.roleInput}.`);
    if (!row.roleInput) warnings.push("Assign a role before import.");

    const team = row.teamInput
      ? teamsByName.get(normalizedKey(row.teamInput)) ?? null
      : null;
    if (row.teamInput && !team) errors.push(`Unknown team: ${row.teamInput}.`);
    if (team && !team.active) errors.push(`Team ${team.name} is inactive.`);
    if (!row.teamInput) warnings.push("Assign a team before import.");

    rows.push({
      rowNumber: row.rowNumber,
      username: row.username,
      dialerName: row.dialerName,
      email: row.email,
      role,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      errors,
      warnings,
      validForAssignment: errors.length === 0,
    });
  }

  return { headers: rawHeaders, rows, ignoredEmptyRows, fatalErrors };
}
