import { describe, expect, it } from "vitest";

import {
  MAX_USER_CSV_ROWS,
  parseUserImportCsv,
} from "@/admin/user-import-csv";

const requiredHeaders = "Real Name,American Name,Shift,Email";

describe("user provisioning CSV", () => {
  it("accepts the required headers and returns the correct preview values", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\n Ava Rivera , Ava Dialer , Night   Shift , AVA@EXAMPLE.COM \n`,
    });

    expect(preview.fatalErrors).toEqual([]);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      realName: "Ava Rivera",
      americanName: "Ava Dialer",
      shift: "Night   Shift",
      email: "ava@example.com",
      role: null,
      teamId: null,
      validForAssignment: true,
    });
  });

  it("accepts columns in a different order", () => {
    const preview = parseUserImportCsv({
      content:
        "Email,Shift,American Name,Real Name\nava@example.com,Morning,Ava Dialer,Ava Rivera",
    });

    expect(preview.fatalErrors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({
      realName: "Ava Rivera",
      americanName: "Ava Dialer",
      shift: "Morning",
      email: "ava@example.com",
    });
  });

  it("matches capitalization and surrounding whitespace and handles a BOM", () => {
    const preview = parseUserImportCsv({
      content:
        "\uFEFF REAL NAME , american NAME , SHIFT , email \nAva Rivera,Ava Dialer,Night,ava@example.com",
    });

    expect(preview.fatalErrors).toEqual([]);
    expect(preview.rows).toHaveLength(1);
  });

  it.each([
    ["Real Name", "American Name,Shift,Email"],
    ["American Name", "Real Name,Shift,Email"],
    ["Shift", "Real Name,American Name,Email"],
    ["Email", "Real Name,American Name,Shift"],
  ])("reports the missing %s header by its display name", (missing, headers) => {
    const preview = parseUserImportCsv({
      content: `${headers}\nvalue,value,value`,
    });

    expect(preview.fatalErrors).toContain(
      `Missing required CSV header: ${missing}.`,
    );
  });

  it("reports every missing required header", () => {
    const preview = parseUserImportCsv({ content: "" });

    expect(preview.fatalErrors).toEqual([
      "Missing required CSV header: Real Name.",
      "Missing required CSV header: American Name.",
      "Missing required CSV header: Shift.",
      "Missing required CSV header: Email.",
    ]);
  });

  it.each([
    ["Real Name", ",Ava Dialer,Night,ava@example.com", "Real Name is required."],
    [
      "American Name",
      "Ava Rivera,,Night,ava@example.com",
      "American Name is required.",
    ],
    ["Shift", "Ava Rivera,Ava Dialer,,ava@example.com", "Shift is required."],
    ["Email", "Ava Rivera,Ava Dialer,Night,", "Email is required."],
  ])("blocks an empty %s value", (_field, row, message) => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\n${row}`,
    });

    expect(preview.rows[0].validForAssignment).toBe(false);
    expect(preview.rows[0].errors).toContain(message);
  });

  it("blocks invalid email addresses", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\nAva Rivera,Ava Dialer,Night,not-an-email`,
    });

    expect(preview.rows[0].errors).toContain("Email format is invalid.");
  });

  it("detects duplicate emails inside the CSV after normalization", () => {
    const preview = parseUserImportCsv({
      content: [
        requiredHeaders,
        "Ava Rivera,Ava Dialer,Night,AVA@example.com",
        "Bea Rivera,Bea Dialer,Morning, ava@example.com ",
      ].join("\n"),
    });

    expect(preview.rows.every((row) =>
      row.errors.includes("Email is duplicated inside this CSV."),
    )).toBe(true);
  });

  it("detects existing email and American Name conflicts", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\nAva Rivera,Ava Dialer,Night,AVA@example.com`,
      existingEmails: ["ava@example.com"],
      existingDialerNames: ["ava dialer"],
    });

    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining([
        "A user with this email already exists.",
        "This American Name is already assigned.",
      ]),
    );
  });

  it("rejects unsupported extra headers without mapping them", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders},Surprise\nAva,Ava Dialer,Night,ava@example.com,x`,
    });

    expect(preview.rows).toEqual([]);
    expect(preview.fatalErrors).toContain(
      "Unsupported CSV header: Surprise.",
    );
  });

  it("does not silently normalize an unknown header", () => {
    const preview = parseUserImportCsv({
      content:
        "Real  Name,American Name,Shift,Email\nAva,Ava Dialer,Night,ava@example.com",
    });

    expect(preview.fatalErrors).toEqual(
      expect.arrayContaining([
        "Unsupported CSV header: Real  Name.",
        "Missing required CSV header: Real Name.",
      ]),
    );
  });

  it("does not accept the legacy format because Shift would be missing", () => {
    const preview = parseUserImportCsv({
      content: "Username,Dialer name,Email\nAva,Ava Dialer,ava@example.com",
    });

    expect(preview.rows).toEqual([]);
    expect(preview.fatalErrors).toEqual(
      expect.arrayContaining([
        "Unsupported CSV header: Username.",
        "Unsupported CSV header: Dialer name.",
        "Missing required CSV header: Real Name.",
        "Missing required CSV header: American Name.",
        "Missing required CSV header: Shift.",
      ]),
    );
  });

  it("keeps role and team assignment outside the CSV", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\nAva,Ava Dialer,Night,ava@example.com`,
    });

    expect(preview.rows[0]).toMatchObject({
      role: null,
      teamId: null,
      teamName: null,
      warnings: [
        "Assign a role before import.",
        "Assign a team before import.",
      ],
    });
  });

  it("keeps row counters accurate and ignores only empty rows", () => {
    const preview = parseUserImportCsv({
      content: [
        requiredHeaders,
        "Ava,Ava Dialer,Night,ava@example.com",
        ",,,",
        "Bea,Bea Dialer,Morning,invalid",
      ].join("\n"),
    });

    expect(preview.rows).toHaveLength(2);
    expect(preview.rows.filter((row) => row.validForAssignment)).toHaveLength(1);
    expect(preview.rows.filter((row) => !row.validForAssignment)).toHaveLength(1);
    expect(preview.ignoredEmptyRows).toBe(1);
  });

  it("blocks spreadsheet formulas in every imported field", () => {
    const preview = parseUserImportCsv({
      content: `${requiredHeaders}\n=Ava,Ava Dialer,Night,ava@example.com`,
    });

    expect(preview.rows[0].errors).toContain(
      "Values beginning with =, +, -, or @ are not allowed.",
    );
  });

  it("rejects malformed and oversized CSVs", () => {
    expect(
      parseUserImportCsv({
        content: `${requiredHeaders}\n"unclosed`,
      }).fatalErrors[0],
    ).toContain("malformed");

    const rows = Array.from(
      { length: MAX_USER_CSV_ROWS + 1 },
      (_, index) =>
        `User ${index},Dialer ${index},Night,user${index}@example.com`,
    );
    expect(
      parseUserImportCsv({
        content: [requiredHeaders, ...rows].join("\n"),
      }).fatalErrors[0],
    ).toContain(`${MAX_USER_CSV_ROWS}-row limit`);
  });
});
