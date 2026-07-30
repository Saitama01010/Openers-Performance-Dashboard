import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  ingestAndMatchTransfers: vi.fn(),
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
    mocks.ingestAndMatchTransfers.mockRejectedValueOnce(
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
    mocks.ingestAndMatchTransfers.mockRejectedValueOnce(
      new Error("Database or network failure"),
    );

    await expect(
      getLeaderboardData(
        { id: "admin-1", role: "admin", teamIds: [] },
        {},
      ),
    ).rejects.toThrow("Database or network failure");
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
