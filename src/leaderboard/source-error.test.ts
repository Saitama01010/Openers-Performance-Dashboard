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

  it("renders unexpected transfer-source failures as a controlled unavailable state", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockRejectedValueOnce(
      new Error("Database or network failure"),
    );

    await expect(
      getLeaderboardData(
        { id: "admin-1", role: "admin", teamIds: [] },
        {},
      ),
    ).resolves.toEqual({
      status: "source_error",
      message:
        "The transfer source could not be loaded right now. Retry after checking the Xfers connection.",
      rows: [],
      teams: [{ id: "team-1", name: "Team One" }],
      filters: {},
    });
  });

  it("isolates a Closed configuration error while preserving safe Xfers status", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce({
      status: "closed_error",
      message: "The Closed worksheet does not contain all required headers.",
      errorKind: "configuration",
      headerValidationStatus: "invalid",
      timeZone: "Africa/Cairo",
      users: [],
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
      status: "ready",
      rows: [],
      teams: [{ id: "team-1", name: "Team One" }],
      filters: {},
      totalTransfers: 0,
      totalClosedDeals: null,
      closedMetricsAvailable: false,
      closedMessage:
        "The Closed worksheet does not contain all required headers. Transfer rankings remain available.",
      closedSourceEmpty: false,
      transferSourceRecordCount: 1,
      transferDiagnosticCount: 0,
      closedDiagnosticCount: 0,
      latestSynchronization: "2026-07-30T10:00:00.000Z",
      stale: false,
      overall: {
        transfers: 0,
        closedDeals: null,
        conversion: null,
        trend: [],
        comparison: null,
      },
      closedErrorDiagnostics: {
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
      users: [],
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
    expect(result.status).toBe("ready");
    expect(
      result.status === "ready" && result.closedErrorDiagnostics,
    ).toBeUndefined();
    expect(result.status === "ready" && result.overall).toBeUndefined();
  });

  it.each([
    { role: "admin" as const, receivesOverall: true },
    { role: "manager" as const, receivesOverall: true },
    { role: "agent" as const, receivesOverall: false },
  ])("applies the $role overall-total data contract", async ({ role, receivesOverall }) => {
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce({
      status: "ready",
      timeZone: "Africa/Cairo",
      users: [],
      transferRecords: [
        {
          sourceRowId: "Xfers:2",
          rawTimestamp: "2026-08-05T08:00:00.000Z",
          occurredAt: new Date("2026-08-05T08:00:00.000Z"),
          sheetRealName: "Former Employee",
          sheetAmericanName: "Former Agent",
          customerName: "Private Customer",
          phoneNumber: "1",
        },
      ],
      transferMatches: [],
      transferDiagnostics: [{ code: "unmatched_opener" }],
      closedRecords: [
        {
          sourceRowNumber: 2,
          timestamp: new Date("2026-08-05T08:00:00.000Z"),
          timestampIso: "2026-08-05T08:00:00.000Z",
          closer: "Private Closer",
          customerName: "Private Customer",
          fileNumber: "Private File",
          debtAmount: "Private Debt",
          readyForSubmission: "",
          sheetOpener: "Former Agent",
          extractedAmericanName: "Former Agent",
          normalizedAmericanName: "former agent",
          matchedUserId: null,
          matchStatus: "unmatched",
          validationErrors: [],
        },
      ],
      closedDiagnostics: [{ code: "unmatched_opener" }],
      closedGeneratedAt: "2026-08-10T10:00:00.000Z",
      totalNonEmptyClosedRows: 1,
      duplicateAmericanNames: [],
      stale: false,
      fetchedAt: "2026-08-10T10:00:01.000Z",
    });

    const result = await getLeaderboardData(
      {
        id: `${role}-1`,
        role,
        teamIds: role === "manager" ? ["team-1"] : [],
      },
      { from: "2026-08-01", to: "2026-08-31" },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.rows).toEqual([]);
    expect(result.overall).toEqual(
      receivesOverall
        ? {
            transfers: 1,
            closedDeals: 1,
            conversion: 100,
            trend: [
              { date: "2026-08-05", transferCount: 1, closedDeals: 1 },
            ],
            comparison: null,
          }
        : undefined,
    );
    if (!receivesOverall) {
      expect(JSON.stringify(result)).not.toContain('"overall"');
    }
  });

  it("does not represent an entirely unattributable Closed worksheet as zero deals", async () => {
    mocks.ingestAndMatchLeaderboardSources.mockResolvedValueOnce({
      status: "ready",
      timeZone: "Africa/Cairo",
      users: [],
      transferRecords: [],
      transferMatches: [],
      transferDiagnostics: [],
      closedRecords: [
        {
          sourceRowNumber: 2,
          timestamp: new Date("2026-08-07T08:00:00.000Z"),
          timestampIso: "2026-08-07T08:00:00.000Z",
          closer: "",
          customerName: "",
          fileNumber: "",
          debtAmount: "",
          readyForSubmission: "",
          sheetOpener: "",
          extractedAmericanName: "",
          normalizedAmericanName: "",
          matchedUserId: null,
          matchStatus: "invalid",
          validationErrors: ["Closed row 2 has an empty Opener."],
        },
      ],
      closedDiagnostics: [{ code: "missing_opener" }],
      closedGeneratedAt: "2026-08-10T10:00:00.000Z",
      totalNonEmptyClosedRows: 1,
      duplicateAmericanNames: [],
      stale: false,
      fetchedAt: "2026-08-10T10:00:01.000Z",
    });

    const result = await getLeaderboardData(
      { id: "admin-1", role: "admin", teamIds: [] },
      { from: "2026-08-01", to: "2026-08-10" },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.closedMetricsAvailable).toBe(false);
    expect(result.totalClosedDeals).toBeNull();
    expect(result.closedMessage).toContain("valid Opener");
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
    expect(result.closedMetricsAvailable).toBe(true);
    expect(result.rows[0]).toEqual({
      profileId: "agent-1",
      realName: "Database Real Name",
      americanName: "Gia Monroe",
      teamId: "team-1",
      teamName: "Team One",
      transferCount: 0,
      closedDeals: 1,
      rank: 1,
      comparison: null,
      trend: [
        {
          date: "2026-07-12",
          transferCount: 0,
          closedDeals: 1,
        },
      ],
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
