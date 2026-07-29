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

import { getLeaderboardData } from "@/leaderboard/data";
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
});
