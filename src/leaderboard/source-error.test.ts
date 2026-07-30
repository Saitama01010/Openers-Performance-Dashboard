import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  ingestAndMatchTransfers: vi.fn(),
  ingestAndMatchLeaderboardSources: vi.fn(),
  config: {
    endpointUrl:
      "https://script.google.com/macros/s/deployment-id/exec",
    secret: "server-secret",
    timeZone: "Africa/Cairo",
  },
}));

vi.mock("@/leaderboard/transfers", () => ({
  transferSheetConfigFromEnv: () => mocks.config,
  ingestAndMatchTransfers: mocks.ingestAndMatchTransfers,
  ingestAndMatchLeaderboardSources:
    mocks.ingestAndMatchLeaderboardSources,
}));

vi.mock("@/db", () => {
  function query(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "leftJoin",
      "where",
      "orderBy",
    ]) {
      chain[method] = () => chain;
    }
    chain.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return chain;
  }

  return {
    getDb: () => ({
      select: (selection: Record<string, unknown>) =>
        query(
          "realName" in selection
            ? []
            : [{ id: "team-1", name: "Team One" }],
        ),
    }),
  };
});

import {
  getLeaderboardData,
  getTransferSummary,
} from "@/leaderboard/data";
import { TransferSheetConfigurationError } from "@/sheets/transfers";

describe("LeaderBoard transfer-source errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an expected configuration failure for controlled rendering", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockRejectedValueOnce(
      new TransferSheetConfigurationError(
        "Transfer source is missing required headers: Opener.",
      ),
    );

    await expect(
      getLeaderboardData(
        { id: "admin-1", role: "admin", teamIds: [] },
        {},
      ),
    ).resolves.toEqual({
      status: "source_error",
      message: "Transfer source is missing required headers: Opener.",
      rows: [],
      teams: [{ id: "team-1", name: "Team One" }],
      filters: {},
    });
  });

  it("does not convert unexpected failures into configuration errors", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockRejectedValueOnce(
      new Error("Database or network failure"),
    );

    await expect(
      getLeaderboardData(
        { id: "admin-1", role: "admin", teamIds: [] },
        {},
      ),
    ).rejects.toThrow("Database or network failure");
  });

  it("isolates a Closed configuration error while preserving safe Xfers status", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce({
      status: "closed_error",
      message: "The Closed worksheet does not contain all required headers.",
      errorKind: "configuration",
      headerValidationStatus: "invalid",
      timeZone: "Africa/Cairo",
      transferRecords: [{ sourceRowId: "Xfers:2" }],
      transferMatches: [],
      transferDiagnostics: [],
      stale: false,
      fetchedAt: "2026-07-30T10:00:00.000Z",
    });

    await expect(
      getLeaderboardData(
        { id: "admin-1", role: "admin", teamIds: [] },
        {},
      ),
    ).resolves.toEqual({
      status: "closed_error",
      message: "The Closed worksheet does not contain all required headers.",
      rows: [],
      teams: [{ id: "team-1", name: "Team One" }],
      filters: {},
      transferSourceRecordCount: 1,
      transferDiagnosticCount: 0,
      closedDiagnostics: {
        connectionStatus: "configuration_error",
        worksheet: "Closed",
        headerValidationStatus: "invalid",
      },
    });
  });

  it("does not return Closed diagnostics to ordinary agents", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce({
      status: "closed_error",
      message: "The closed-deals source could not be processed.",
      errorKind: "unavailable",
      headerValidationStatus: "unknown",
      timeZone: "Africa/Cairo",
      transferRecords: [],
      transferMatches: [],
      transferDiagnostics: [],
      stale: false,
      fetchedAt: "2026-07-30T10:00:00.000Z",
    });

    const result = await getLeaderboardData(
      { id: "agent-1", role: "agent", teamIds: ["team-1"] },
      {},
    );
    expect(result.status).toBe("closed_error");
    expect(
      result.status === "closed_error" && result.closedDiagnostics,
    ).toBeUndefined();
  });

  it("returns only safe ranking fields and aggregate Closed diagnostics", async () => {
    const readyIngestion = {
      status: "ready" as const,
      timeZone: "Africa/Cairo",
      users: [
        {
          id: "agent-1",
          realName: "Database Real Name",
          americanName: "Gia Monroe",
          teamId: "team-1",
          teamName: "Team One",
        },
      ],
      transferRecords: [],
      transferMatches: [],
      transferDiagnostics: [],
      closedRecords: [
        {
          sourceRowNumber: 14,
          timestamp: new Date("2026-07-12T08:00:00.000Z"),
          timestampIso: "2026-07-12T08:00:00.000Z",
          closer: "Private Closer",
          customerName: "Private Customer",
          fileNumber: "Private File",
          debtAmount: "Private Debt",
          readyForSubmission: "Private Ready Value",
          sheetOpener: "Gia Monroe",
          extractedAmericanName: "Gia Monroe",
          normalizedAmericanName: "gia monroe",
          matchedUserId: "agent-1",
          matchStatus: "matched" as const,
          validationErrors: [],
        },
      ],
      closedDiagnostics: [],
      closedGeneratedAt: "2026-07-30T10:00:00.000Z",
      totalNonEmptyClosedRows: 1,
      duplicateAmericanNames: [],
      stale: false,
      fetchedAt: "2026-07-30T10:00:01.000Z",
    };
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce(
      readyIngestion,
    );

    const result = await getLeaderboardData(
      { id: "admin-1", role: "admin", teamIds: [] },
      { from: "2026-07-01", to: "2026-07-31" },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.rows[0]).toEqual({
      profileId: "agent-1",
      realName: "Database Real Name",
      americanName: "Gia Monroe",
      teamId: "team-1",
      teamName: "Team One",
      closedDeals: 1,
      rank: 1,
    });
    expect(result.closedDiagnostics).toMatchObject({
      matchedRows: 1,
      totalNonEmptyRows: 1,
    });
    expect(JSON.stringify(result)).not.toContain("Private Customer");
    expect(JSON.stringify(result)).not.toContain("Private File");
    expect(JSON.stringify(result)).not.toContain("Private Debt");
    expect(JSON.stringify(result)).not.toContain("Private Ready Value");
    expect(JSON.stringify(result)).not.toContain("server-secret");
    expect(JSON.stringify(result)).not.toContain("script.google.com");
  });

  it("returns date-compared, role-scoped transfer totals for Overview", async () => {
    mocks.ingestAndMatchTransfers.mockResolvedValueOnce({
      status: "ready",
      timeZone: "Africa/Cairo",
      records: [],
      diagnostics: [{ code: "duplicate" }],
      duplicateAmericanNames: [],
      matches: [
        {
          status: "matched",
          user: {
            id: "agent-1",
            realName: "Amira Ayman",
            americanName: "Gia Monroe",
            teamId: "team-1",
            teamName: "Team One",
          },
          transfer: {
            sourceRowId: "Xfers:2",
            rawTimestamp: "2026-07-12 10:00",
            occurredAt: new Date("2026-07-12T08:00:00.000Z"),
            sheetRealName: "Amira Ayman",
            sheetAmericanName: "Gia Monroe",
            customerName: "Customer One",
            phoneNumber: "1",
          },
        },
        {
          status: "matched",
          user: {
            id: "agent-1",
            realName: "Amira Ayman",
            americanName: "Gia Monroe",
            teamId: "team-1",
            teamName: "Team One",
          },
          transfer: {
            sourceRowId: "Xfers:3",
            rawTimestamp: "2026-06-12 10:00",
            occurredAt: new Date("2026-06-12T08:00:00.000Z"),
            sheetRealName: "Amira Ayman",
            sheetAmericanName: "Gia Monroe",
            customerName: "Customer Two",
            phoneNumber: "2",
          },
        },
      ],
    });

    await expect(
      getTransferSummary(
        { id: "manager-1", role: "manager", teamIds: ["team-1"] },
        {
          key: "this-month",
          label: "This Month",
          from: "2026-07-01",
          to: "2026-07-31",
          comparison: {
            from: "2026-06-01",
            to: "2026-06-30",
            label: "previous month",
          },
        },
      ),
    ).resolves.toEqual({
      status: "ready",
      totalTransfers: 1,
      comparisonTransfers: 1,
      comparisonLabel: "previous month",
      diagnosticCount: 1,
    });
  });

  it("keeps an Overview transfer-source outage inside the card state", async () => {
    mocks.ingestAndMatchTransfers.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    await expect(
      getTransferSummary(
        { id: "admin-1", role: "admin", teamIds: [] },
        {
          key: "today",
          label: "Today",
          from: "2026-07-30",
          to: "2026-07-30",
          comparison: {
            from: "2026-07-29",
            to: "2026-07-29",
            label: "previous day",
          },
        },
      ),
    ).resolves.toEqual({
      status: "source_error",
      message:
        "The transfer source could not be loaded right now. Retry after checking the Xfers connection.",
    });
  });
});
