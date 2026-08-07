import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildClosedDealLeaderboardRows,
  buildLeaderboardAnalyticsRows,
  countScopedTransfers,
} from "@/leaderboard/data";
import type {
  MatchableUser,
  MatchedTransfer,
} from "@/leaderboard/matching";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

const users = {
  gia: {
    id: "gia",
    realName: "Amira Ayman",
    americanName: "Gia Monroe",
    teamId: "team-1",
    teamName: "Team One",
  },
  ada: {
    id: "ada",
    realName: "Ada Real",
    americanName: "Ada Lane",
    teamId: "team-1",
    teamName: "Team One",
  },
  zoe: {
    id: "zoe",
    realName: "Zoe Real",
    americanName: "Zoe Lane",
    teamId: "team-2",
    teamName: "Team Two",
  },
} satisfies Record<string, MatchableUser>;

function closedDeal(
  matchedUserId: string | null,
  timestamp: Date | null,
  overrides: Partial<NormalizedClosedDeal> = {},
): NormalizedClosedDeal {
  return {
    sourceRowNumber: 2,
    timestamp,
    timestampIso: timestamp?.toISOString() ?? null,
    closer: "Closer",
    customerName: "Private Customer",
    fileNumber: "F-1",
    debtAmount: "1000",
    readyForSubmission: "",
    sheetOpener: "Gia Monroe",
    extractedAmericanName: "Gia Monroe",
    normalizedAmericanName: "gia monroe",
    matchedUserId,
    matchStatus: matchedUserId ? "matched" : "unmatched",
    validationErrors: [],
    ...overrides,
  };
}

function matchedTransfer(
  user: MatchableUser,
  occurredAt: Date | null,
  row: number,
): MatchedTransfer {
  return {
    status: "matched",
    user,
    transfer: {
      sourceRowId: `Xfers:${row}`,
      rawTimestamp: occurredAt?.toISOString() ?? "invalid",
      occurredAt,
      sheetRealName: user.realName,
      sheetAmericanName: user.americanName,
      customerName: `Customer ${row}`,
      phoneNumber: String(row),
    },
  };
}

describe("Closed LeaderBoard aggregation", () => {
  it("counts every valid matched Closed row exactly once and ranks deterministically", () => {
    const rows = buildClosedDealLeaderboardRows(
      [users.gia, users.ada, users.zoe],
      [
        closedDeal("gia", new Date("2026-07-28T20:00:00.000Z")),
        closedDeal("gia", new Date("2026-07-28T21:00:00.000Z"), {
          sourceRowNumber: 4,
          fileNumber: "F-1",
          readyForSubmission: "No",
        }),
        closedDeal("zoe", new Date("2026-07-28T20:00:00.000Z")),
        closedDeal(null, new Date("2026-07-28T20:00:00.000Z")),
        closedDeal(null, null, {
          matchStatus: "invalid",
          validationErrors: ["invalid Timestamp"],
        }),
      ],
      {},
      "Africa/Cairo",
    );

    expect(
      rows.map((row) => [row.profileId, row.closedDeals, row.rank]),
    ).toEqual([
      ["gia", 2, 1],
      ["zoe", 1, 2],
      ["ada", 0, 3],
    ]);
  });

  it("does not filter by Ready For Submission or deduplicate File Number", () => {
    const rows = buildClosedDealLeaderboardRows(
      [users.gia],
      [
        closedDeal("gia", new Date("2026-07-28T20:00:00.000Z"), {
          fileNumber: "same",
          readyForSubmission: "",
        }),
        closedDeal("gia", new Date("2026-07-28T20:00:00.000Z"), {
          fileNumber: "same",
          readyForSubmission: "No",
        }),
      ],
      {},
      "Africa/Cairo",
    );
    expect(rows[0].closedDeals).toBe(2);
  });

  it("uses Closed timestamps for Cairo date filtering and preserves team/search filters", () => {
    const rows = buildClosedDealLeaderboardRows(
      [users.gia, users.ada, users.zoe],
      [
        closedDeal("gia", new Date("2026-07-28T20:59:59.000Z")),
        closedDeal("gia", new Date("2026-07-28T21:00:00.000Z")),
        closedDeal("zoe", new Date("2026-07-28T21:30:00.000Z")),
      ],
      {
        from: "2026-07-29",
        to: "2026-07-29",
        teamId: "team-1",
        query: "gia mon",
      },
      "Africa/Cairo",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        profileId: "gia",
        closedDeals: 1,
        rank: 1,
      }),
    ]);
  });

  it("includes active agents with zero deals and orders zero ties by American Name", () => {
    const rows = buildClosedDealLeaderboardRows(
      [users.zoe, users.gia, users.ada],
      [],
      {},
      "Africa/Cairo",
    );
    expect(rows.map((row) => row.profileId)).toEqual(["ada", "gia", "zoe"]);
    expect(rows.every((row) => row.closedDeals === 0)).toBe(true);
  });

  it("does not use Xfers rows as closed-deal counts", () => {
    const rows = buildClosedDealLeaderboardRows(
      [users.gia],
      [],
      {},
      "Africa/Cairo",
    );
    expect(rows[0].closedDeals).toBe(0);
  });

  it("builds honest Cairo daily trends and equivalent-period comparisons", () => {
    const rows = buildLeaderboardAnalyticsRows(
      [users.gia],
      [
        closedDeal("gia", new Date("2026-08-01T20:59:59.000Z")),
        closedDeal("gia", new Date("2026-08-01T21:00:00.000Z")),
        closedDeal("gia", new Date("2026-07-01T21:00:00.000Z")),
      ],
      { from: "2026-08-01", to: "2026-08-02" },
      "Africa/Cairo",
      [
        matchedTransfer(users.gia, new Date("2026-08-01T21:30:00.000Z"), 2),
        matchedTransfer(users.gia, new Date("2026-07-01T21:30:00.000Z"), 3),
      ],
      { from: "2026-07-01", to: "2026-07-02" },
    );

    expect(rows[0]).toMatchObject({
      transferCount: 1,
      closedDeals: 2,
      comparison: { transferCount: 1, closedDeals: 1 },
      trend: [
        { date: "2026-08-01", transferCount: 0, closedDeals: 1 },
        { date: "2026-08-02", transferCount: 1, closedDeals: 1 },
      ],
    });
  });
});

describe("Overview Xfers aggregation", () => {
  it("continues counting Xfers inside the actor and date scope", () => {
    const matches = [
      matchedTransfer(
        users.gia,
        new Date("2026-07-28T21:00:00.000Z"),
        2,
      ),
      matchedTransfer(
        users.zoe,
        new Date("2026-07-28T21:30:00.000Z"),
        3,
      ),
      matchedTransfer(
        users.gia,
        new Date("2026-06-28T21:00:00.000Z"),
        4,
      ),
      matchedTransfer(users.gia, null, 5),
    ];
    const window = { from: "2026-07-01", to: "2026-07-31" };

    expect(
      countScopedTransfers(
        matches,
        { id: "admin", role: "admin", teamIds: [] },
        window,
        "Africa/Cairo",
      ),
    ).toBe(2);
    expect(
      countScopedTransfers(
        matches,
        { id: "manager", role: "manager", teamIds: ["team-1"] },
        window,
        "Africa/Cairo",
      ),
    ).toBe(1);
    expect(
      countScopedTransfers(
        matches,
        { id: "zoe", role: "agent", teamIds: ["team-2"] },
        window,
        "Africa/Cairo",
      ),
    ).toBe(1);
  });
});
