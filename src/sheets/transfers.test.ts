import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let parseOpener: typeof import("@/sheets/transfers").parseOpener;
let normalizeAmericanName: typeof import("@/sheets/transfers").normalizeAmericanName;
let parseTransferCsv: typeof import("@/sheets/transfers").parseTransferCsv;
let parseSheetTimestamp: typeof import("@/sheets/timestamp").parseSheetTimestamp;
let matchTransfersToUsers: typeof import("@/leaderboard/matching").matchTransfersToUsers;

beforeAll(async () => {
  ({ parseOpener, normalizeAmericanName, parseTransferCsv } = await import(
    "@/sheets/transfers"
  ));
  ({ parseSheetTimestamp } = await import("@/sheets/timestamp"));
  ({ matchTransfersToUsers } = await import("@/leaderboard/matching"));
});

describe("transfer timestamp parsing", () => {
  it("preserves ISO UTC timestamps including milliseconds", () => {
    const result = parseSheetTimestamp(" 2026-07-28T18:47:27.547Z ");
    expect(result.ok && result.value.toISOString()).toBe(
      "2026-07-28T18:47:27.547Z",
    );
  });

  it("uses the configured timezone for timezone-less values", () => {
    const cairo = parseSheetTimestamp("2026-05-01 20:34:33", "Africa/Cairo");
    expect(cairo.ok && cairo.value.toISOString()).toBe(
      "2026-05-01T17:34:33.000Z",
    );
    const utc = parseSheetTimestamp("2026-05-01 20:34:33.125", "UTC");
    expect(utc.ok && utc.value.toISOString()).toBe(
      "2026-05-01T20:34:33.125Z",
    );
  });

  it("handles day and month boundaries and reports empty or invalid input", () => {
    const boundary = parseSheetTimestamp("2026-06-01 00:15:00", "UTC");
    expect(boundary.ok && boundary.value.toISOString()).toBe(
      "2026-06-01T00:15:00.000Z",
    );
    expect(parseSheetTimestamp("")).toEqual({ ok: false, reason: "empty" });
    expect(parseSheetTimestamp("2026-02-31 10:00:00")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parseSheetTimestamp("not a date")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("transfer parsing and matching", () => {
  it.each([
    "Amira Ayman-Gia Monroe",
    "Amira Ayman - Gia Monroe",
    "Amira Ayman- Gia Monroe",
    "Amira Ayman -Gia Monroe",
  ])("extracts American Name from %s", (value) => {
    expect(parseOpener(value)).toEqual({
      sheetRealName: "Amira Ayman",
      sheetAmericanName: "Gia Monroe",
    });
  });

  it("normalizes safe case, whitespace, Unicode, and punctuation differences", () => {
    expect(normalizeAmericanName(" GIA   MONROE ")).toBe("gia monroe");
    expect(normalizeAmericanName("Ｇｉａ Monroe")).toBe("gia monroe");
    expect(normalizeAmericanName("Gia-Monroe")).toBe("gia monroe");
    expect(normalizeAmericanName("Gina Monroe")).not.toBe(
      normalizeAmericanName("Gia Monroe"),
    );
  });

  it("trims BOM and header whitespace without guessing missing columns", () => {
    const result = parseTransferCsv(
      "\uFEFF Timestamp , Opener,Customer Name , Phone Number \n2026-07-28T18:47:27.547Z,Amira Ayman-Gia Monroe,Customer,123",
      { gid: "7", timeZone: "Africa/Cairo" },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceRowId: "7:2",
      sheetRealName: "Amira Ayman",
      sheetAmericanName: "Gia Monroe",
    });

    expect(() =>
      parseTransferCsv("Timestamp,Opener\nx,y", {
        gid: "7",
        timeZone: "UTC",
      }),
    ).toThrow("Customer Name, Phone Number");
    expect(() =>
      parseTransferCsv(
        "Timestamp,Opener,Customer Name,Phone Number,Opener\nx,a-b,c,d,e-f",
        { gid: "7", timeZone: "UTC" },
      ),
    ).toThrow("required header more than once: Opener");
  });

  it("keeps invalid timestamps diagnostic without crashing the import", () => {
    const result = parseTransferCsv(
      "Timestamp,Opener,Customer Name,Phone Number\nbad,Amira-Gia Monroe,A,1\n2026-05-01 20:34:33,Amira-Gia Monroe,B,2",
      { gid: "7", timeZone: "Africa/Cairo" },
    );
    expect(result.records).toHaveLength(2);
    expect(result.records[0].occurredAt).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ rowNumber: 2, code: "invalid_timestamp" }),
    ]);
  });

  it("matches only by normalized American Name and never overwrites Real Name", () => {
    const transfer = {
      sourceRowId: "7:2",
      rawTimestamp: "",
      occurredAt: null,
      sheetRealName: "Wrong Real Name",
      sheetAmericanName: " GIA   MONROE ",
      customerName: "",
      phoneNumber: "",
    };
    const user = {
      id: "user-1",
      realName: "Correct Real Name",
      americanName: "Gia Monroe",
      teamId: null,
      teamName: null,
    };
    const matched = matchTransfersToUsers([transfer], [user]);
    expect(matched.results[0]).toMatchObject({
      status: "matched",
      user: { realName: "Correct Real Name" },
      transfer: { sheetRealName: "Wrong Real Name" },
    });
  });

  it("reports unmatched and ambiguous names without guessing", () => {
    const transfer = {
      sourceRowId: "7:8",
      rawTimestamp: "",
      occurredAt: null,
      sheetRealName: "Sheet Name",
      sheetAmericanName: "Gia Monroe",
      customerName: "",
      phoneNumber: "",
    };
    const user = (id: string, americanName: string) => ({
      id,
      realName: id,
      americanName,
      teamId: null,
      teamName: null,
    });
    expect(matchTransfersToUsers([transfer], []).results[0].status).toBe(
      "unmatched",
    );
    const ambiguous = matchTransfersToUsers(
      [transfer],
      [user("one", "Gia Monroe"), user("two", "GIA MONROE")],
    );
    expect(ambiguous.results[0].status).toBe("ambiguous");
    expect(ambiguous.duplicateAmericanNames).toHaveLength(1);
  });
});
