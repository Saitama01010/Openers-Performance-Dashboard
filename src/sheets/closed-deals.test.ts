import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchClosedDealsToUsers } from "@/leaderboard/matching";
import {
  parseClosedAppsScriptSuccess,
  parseClosedRows,
  REQUIRED_CLOSED_HEADERS,
} from "@/sheets/closed-deals";

const headers = [...REQUIRED_CLOSED_HEADERS];

function row(
  timestamp: unknown,
  opener: unknown,
  overrides: Partial<Record<(typeof headers)[number], unknown>> = {},
) {
  const values: Record<string, unknown> = {
    Timestamp: timestamp,
    Closer: "Closer",
    "Customer Name": "Customer",
    "File Number": "F-1",
    "Debt Amount": "1000",
    "Ready For Submission": "",
    Opener: opener,
    ...overrides,
  };
  return headers.map((header) => values[header]);
}

describe("Closed worksheet parsing", () => {
  it("accepts exact required headers and extra optional columns", () => {
    const result = parseClosedRows(
      [...headers, "Notes"],
      [[...row("2026-07-28T18:47:27.547Z", "Gia Monroe"), "ignored"]],
      { timeZone: "Africa/Cairo" },
    );

    expect(result.totalNonEmptyRows).toBe(1);
    expect(result.records[0]).toMatchObject({
      timestampIso: "2026-07-28T18:47:27.547Z",
      extractedAmericanName: "Gia Monroe",
      normalizedAmericanName: "gia monroe",
      matchStatus: "unmatched",
    });
  });

  it("matches reordered headers despite case, whitespace, repeated whitespace, and BOM", () => {
    const result = parseClosedRows(
      [
        " opener ",
        "READY   FOR submission",
        "Debt Amount",
        "File Number",
        "Customer Name",
        "CLOSER",
        "\uFEFF Timestamp ",
      ],
      [
        [
          "GIA   MONROE",
          "No",
          "1000",
          "F-1",
          "Customer",
          "Closer",
          "2026-07-28T18:47:27.547Z",
        ],
      ],
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records[0]).toMatchObject({
      extractedAmericanName: "GIA MONROE",
      normalizedAmericanName: "gia monroe",
      readyForSubmission: "No",
    });
  });

  it("rejects a genuinely missing required header", () => {
    expect(() =>
      parseClosedRows(headers.filter((header) => header !== "Opener"), [], {
        timeZone: "UTC",
      }),
    ).toThrow("missing required headers: Opener");
  });

  it.each([
    {
      label: "alternating separator rows",
      rows: [
        row("2026-07-28T18:47:27.547Z", "Gia Monroe"),
        ["", "", "", "", "", "", ""],
        row("2026-07-29T18:47:27.547Z", "Gia Monroe"),
        ["", "", "", "", "", "", ""],
      ],
      count: 2,
    },
    {
      label: "consecutive submissions",
      rows: [
        row("2026-07-28T18:47:27.547Z", "Gia Monroe"),
        row("2026-07-29T18:47:27.547Z", "Gia Monroe"),
        row("2026-07-30T18:47:27.547Z", "Gia Monroe"),
      ],
      count: 3,
    },
    {
      label: "leading, multiple, trailing, and whitespace-only blanks",
      rows: [
        [" ", " ", "", "", "", "", ""],
        [],
        row("2026-07-28T18:47:27.547Z", "Gia Monroe"),
        [],
        ["", "", "", "", "", "", ""],
        row("2026-07-29T18:47:27.547Z", "Gia Monroe"),
        ["\t"],
      ],
      count: 2,
    },
  ])("processes every non-empty row once with $label", ({ rows, count }) => {
    const result = parseClosedRows(headers, rows, {
      timeZone: "Africa/Cairo",
    });
    expect(result.totalNonEmptyRows).toBe(count);
    expect(result.records).toHaveLength(count);
  });

  it("preserves optional source row numbers through invalid-row diagnostics", () => {
    const result = parseClosedAppsScriptSuccess(
      {
        ok: true,
        worksheet: "Closed",
        headers,
        rows: [
          row("not-a-date", "Gia Monroe"),
          row("2026-07-28T18:47:27.547Z", ""),
        ],
        rowCount: 2,
        sourceRowNumbers: [14, 28],
        generatedAt: "2026-07-30T10:00:00.000Z",
      },
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records.map((record) => record.sourceRowNumber)).toEqual([
      14, 28,
    ]);
    expect(result.records.every((record) => record.matchStatus === "invalid"))
      .toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRowNumber: 14,
          code: "invalid_timestamp",
        }),
        expect.objectContaining({
          sourceRowNumber: 28,
          code: "missing_opener",
        }),
      ]),
    );
  });

  it("parses UTC, Apps Script ISO, and Cairo-local timestamps without guessing invalid dates", () => {
    const result = parseClosedRows(
      headers,
      [
        row("2026-07-28T18:47:27.547Z", "Gia Monroe"),
        row("2026-07-28T18:47:27.000Z", "Gia Monroe"),
        row("2026-05-01 20:34:33", "Gia Monroe"),
        row("invalid", "Gia Monroe"),
        row("", "Gia Monroe"),
      ],
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records.map((record) => record.timestampIso)).toEqual([
      "2026-07-28T18:47:27.547Z",
      "2026-07-28T18:47:27.000Z",
      "2026-05-01T17:34:33.000Z",
      null,
      null,
    ]);
    expect(result.records.slice(3).every((record) => record.matchStatus === "invalid"))
      .toBe(true);
  });

  it.each([
    ["Gia Monroe", "Gia Monroe"],
    ["gia monroe", "gia monroe"],
    ["GIA   MONROE", "GIA MONROE"],
    ["Amira Ayman-Gia Monroe", "Gia Monroe"],
    ["Amira Ayman - Gia Monroe", "Gia Monroe"],
  ])("extracts the authoritative American Name from %s", (value, expected) => {
    const result = parseClosedRows(
      headers,
      [row("2026-07-28T18:47:27.547Z", value)],
      { timeZone: "UTC" },
    );
    expect(result.records[0].extractedAmericanName).toBe(expected);
  });

  it("classifies missing and empty-after-separator opener values as invalid", () => {
    const result = parseClosedRows(
      headers,
      [
        row("2026-07-28T18:47:27.547Z", ""),
        row("2026-07-28T18:47:27.547Z", "Amira Ayman - "),
      ],
      { timeZone: "UTC" },
    );
    expect(result.records.map((record) => record.matchStatus)).toEqual([
      "invalid",
      "invalid",
    ]);
  });
});

describe("Closed opener matching", () => {
  const user = (id: string, americanName: string) => ({
    id,
    realName: `Database ${id}`,
    americanName,
    teamId: null,
    teamName: null,
  });

  function deal(opener: string) {
    return parseClosedRows(
      headers,
      [row("2026-07-28T18:47:27.547Z", opener)],
      { timeZone: "UTC" },
    ).records[0];
  }

  it("matches one exact normalized name without overwriting database names", () => {
    const result = matchClosedDealsToUsers(
      [deal("Amira Ayman - GIA   MONROE")],
      [user("one", "Gia Monroe")],
    );
    expect(result.records[0]).toMatchObject({
      matchedUserId: "one",
      matchStatus: "matched",
      extractedAmericanName: "GIA MONROE",
    });
  });

  it("reports unmatched and ambiguous names and never fuzzy-matches", () => {
    expect(
      matchClosedDealsToUsers(
        [deal("Gia Munroe")],
        [user("one", "Gia Monroe")],
      ).records[0].matchStatus,
    ).toBe("unmatched");

    const ambiguous = matchClosedDealsToUsers(
      [deal("Gia Monroe")],
      [user("one", "Gia Monroe"), user("two", "GIA MONROE")],
    );
    expect(ambiguous.records[0].matchStatus).toBe("ambiguous");
    expect(ambiguous.records[0].matchedUserId).toBeNull();
  });
});
