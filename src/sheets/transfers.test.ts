import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let parseOpener: typeof import("@/sheets/transfers").parseOpener;
let normalizeAmericanName: typeof import("@/sheets/transfers").normalizeAmericanName;
let parseTransferRows: typeof import("@/sheets/transfers").parseTransferRows;
let parseAppsScriptTransferResponse: typeof import("@/sheets/transfers").parseAppsScriptTransferResponse;
let GoogleAppsScriptTransfersProvider: typeof import("@/sheets/transfers").GoogleAppsScriptTransfersProvider;
let parseSheetTimestamp: typeof import("@/sheets/timestamp").parseSheetTimestamp;
let matchTransfersToUsers: typeof import("@/leaderboard/matching").matchTransfersToUsers;

beforeAll(async () => {
  ({
    parseOpener,
    normalizeAmericanName,
    parseTransferRows,
    parseAppsScriptTransferResponse,
    GoogleAppsScriptTransfersProvider,
  } = await import("@/sheets/transfers"));
  ({ parseSheetTimestamp } = await import("@/sheets/timestamp"));
  ({ matchTransfersToUsers } = await import("@/leaderboard/matching"));
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("Google Apps Script transfer parsing", () => {
  it("parses the deployed Apps Script headers-and-rows envelope", () => {
    const result = parseAppsScriptTransferResponse(
      JSON.stringify({
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [
          [
            "2026-07-28T18:47:27.547Z",
            "Amira Ayman-Gia Monroe",
            "Customer",
            "Phone",
          ],
        ],
        rowCount: 1,
        generatedAt: "2026-07-29T10:30:00.000Z",
      }),
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceRowId: "Xfers:2",
      rawTimestamp: "2026-07-28T18:47:27.547Z",
      sheetRealName: "Amira Ayman",
      sheetAmericanName: "Gia Monroe",
      customerName: "Customer",
      phoneNumber: "Phone",
    });
  });

  it("keeps a valid zero-row response connected but empty", () => {
    const result = parseAppsScriptTransferResponse(
      JSON.stringify({
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [],
        rowCount: 0,
        generatedAt: "2026-07-29T10:30:00.000Z",
      }),
      { timeZone: "Africa/Cairo" },
    );

    expect(result).toEqual({ records: [], diagnostics: [] });
  });

  it("matches headers without case, whitespace, BOM, or column-order sensitivity", () => {
    const result = parseAppsScriptTransferResponse(
      JSON.stringify({
        ok: true,
        worksheet: "Xfers",
        headers: [
          " phone NUMBER ",
          "CUSTOMER NAME",
          " \uFEFFtimestamp ",
          " opener",
        ],
        rows: [
          [
            "Phone",
            "Customer",
            "2026-07-28T18:47:27.547Z",
            "Amira Ayman-Gia Monroe",
          ],
        ],
        rowCount: 1,
      }),
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records[0]).toMatchObject({
      rawTimestamp: "2026-07-28T18:47:27.547Z",
      sheetAmericanName: "Gia Monroe",
      customerName: "Customer",
      phoneNumber: "Phone",
    });
  });

  it("treats missing trailing row cells as empty values", () => {
    const result = parseAppsScriptTransferResponse(
      JSON.stringify({
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [
          [
            "2026-07-28T18:47:27.547Z",
            "Amira Ayman-Gia Monroe",
          ],
        ],
        rowCount: 1,
      }),
      { timeZone: "Africa/Cairo" },
    );

    expect(result.records[0]).toMatchObject({
      customerName: "",
      phoneNumber: "",
    });
  });

  it.each([
    {
      label: "one required header is missing",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: ["Timestamp", "Opener", "Customer Name"],
        rows: [],
      },
      message: "Phone Number",
    },
    {
      label: "headers are empty",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: [],
        rows: [],
      },
      message: "Timestamp, Opener, Customer Name, Phone Number",
    },
    {
      label: "the worksheet is unexpected",
      payload: {
        ok: true,
        worksheet: "Closed",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [],
      },
      message: 'unexpected worksheet "Closed"',
    },
    {
      label: "ok is false",
      payload: {
        ok: false,
        worksheet: "Xfers",
        headers: [],
        rows: [],
      },
      message: "request was rejected",
    },
  ])("rejects the response when $label", ({ payload, message }) => {
    expect(() =>
      parseAppsScriptTransferResponse(JSON.stringify(payload), {
        timeZone: "UTC",
      }),
    ).toThrow(message);
  });

  it.each([
    {
      label: "headers contain a non-string",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: ["Timestamp", 7],
        rows: [],
      },
    },
    {
      label: "rows are not a matrix",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [{ Timestamp: "2026-07-28T18:47:27.547Z" }],
      },
    },
    {
      label: "rowCount does not match rows",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [],
        rowCount: 1,
      },
    },
    {
      label: "generatedAt is not a string",
      payload: {
        ok: true,
        worksheet: "Xfers",
        headers: [
          "Timestamp",
          "Opener",
          "Customer Name",
          "Phone Number",
        ],
        rows: [],
        generatedAt: 123,
      },
    },
  ])("rejects malformed envelope data when $label", ({ payload }) => {
    expect(() =>
      parseAppsScriptTransferResponse(JSON.stringify(payload), {
        timeZone: "UTC",
      }),
    ).toThrow("headers-and-rows response has an invalid shape");
  });

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

  it("accepts object rows and supported response envelopes", () => {
    const content = JSON.stringify({
      success: true,
      data: [
        {
          " Timestamp ": "2026-07-28T18:47:27.547Z",
          Opener: "Amira Ayman-Gia Monroe",
          "Customer Name": "Customer",
          "Phone Number": 123,
        },
      ],
    });
    const result = parseAppsScriptTransferResponse(content, {
      timeZone: "Africa/Cairo",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceRowId: "Xfers:2",
      sheetRealName: "Amira Ayman",
      sheetAmericanName: "Gia Monroe",
      phoneNumber: "123",
    });
  });

  it("accepts header-and-row matrices and rejects missing or duplicate headers", () => {
    const result = parseTransferRows(
      [
        ["\uFEFF timestamp ", " OPENER", "Customer Name ", "phone number"],
        [
          "2026-07-28T18:47:27.547Z",
          "Amira Ayman-Gia Monroe",
          "Customer",
          "123",
        ],
      ],
      { timeZone: "Africa/Cairo" },
    );
    expect(result.records).toHaveLength(1);

    expect(() =>
      parseTransferRows(
        [
          ["Timestamp", "Opener"],
          ["x", "y"],
        ],
        { timeZone: "UTC" },
      ),
    ).toThrow("Customer Name, Phone Number");
    expect(() =>
      parseTransferRows(
        [
          [
            "Timestamp",
            "Opener",
            "Customer Name",
            "Phone Number",
            "Opener",
          ],
        ],
        { timeZone: "UTC" },
      ),
    ).toThrow("required header more than once: Opener");
  });

  it("keeps invalid timestamps diagnostic without crashing ingestion", () => {
    const result = parseTransferRows(
      [
        {
          Timestamp: "bad",
          Opener: "Amira-Gia Monroe",
          "Customer Name": "A",
          "Phone Number": "1",
        },
        {
          Timestamp: "2026-05-01 20:34:33",
          Opener: "Amira-Gia Monroe",
          "Customer Name": "B",
          "Phone Number": "2",
        },
      ],
      { timeZone: "Africa/Cairo" },
    );
    expect(result.records).toHaveLength(2);
    expect(result.records[0].occurredAt).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ rowNumber: 2, code: "invalid_timestamp" }),
    ]);
  });

  it("uses a fresh server-side POST and sends the secret only in its JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleAppsScriptTransfersProvider({
      endpointUrl:
        "https://script.google.com/macros/s/deployment-id/exec",
      secret: "server-secret",
      timeZone: "Africa/Cairo",
    });

    await expect(provider.listTransfers()).resolves.toEqual({
      records: [],
      diagnostics: [],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toContain("server-secret");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      body: JSON.stringify({ secret: "server-secret" }),
    });
  });

  it("rejects malformed, failed, and non-JSON endpoint responses", () => {
    expect(() =>
      parseAppsScriptTransferResponse("not-json", { timeZone: "UTC" }),
    ).toThrow("not valid JSON");
    expect(() =>
      parseAppsScriptTransferResponse(
        JSON.stringify({ success: false, error: "secret details" }),
        { timeZone: "UTC" },
      ),
    ).toThrow("request was rejected");
    expect(() =>
      parseAppsScriptTransferResponse(JSON.stringify({ success: true }), {
        timeZone: "UTC",
      }),
    ).toThrow("does not contain transfer rows");
  });
});

describe("transfer matching", () => {
  it("matches only by normalized American Name and never overwrites Real Name", () => {
    const transfer = {
      sourceRowId: "Xfers:2",
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
      sourceRowId: "Xfers:8",
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
