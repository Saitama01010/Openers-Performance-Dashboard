import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildTransferLeaderboardRows } from "@/leaderboard/data";
import type { MatchedTransfer } from "@/leaderboard/matching";

const users = {
  gia: {
    id: "gia",
    realName: "Amira Ayman",
    americanName: "Gia Monroe",
    teamId: "team-1",
    teamName: "Team One",
  },
  zoe: {
    id: "zoe",
    realName: "Mona Ali",
    americanName: "Zoe Stone",
    teamId: "team-2",
    teamName: "Team Two",
  },
};

function matched(
  user: (typeof users)[keyof typeof users],
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

describe("transfer LeaderBoard aggregation", () => {
  it("counts only valid matched transfers and ranks deterministically", () => {
    const rows = buildTransferLeaderboardRows(
      [
        matched(users.gia, new Date("2026-07-28T20:00:00.000Z"), 2),
        matched(users.gia, new Date("2026-07-28T21:00:00.000Z"), 3),
        matched(users.gia, null, 4),
        matched(users.zoe, new Date("2026-07-28T20:00:00.000Z"), 5),
        {
          status: "unmatched",
          transfer: matched(
            users.zoe,
            new Date("2026-07-28T20:00:00.000Z"),
            6,
          ).transfer,
          candidates: [],
        },
      ],
      {},
      "Africa/Cairo",
    );

    expect(rows.map((row) => [row.profileId, row.transferCount, row.rank])).toEqual([
      ["gia", 2, 1],
      ["zoe", 1, 2],
    ]);
  });

  it("applies Cairo calendar dates, team, and name filters", () => {
    const matches = [
      matched(users.gia, new Date("2026-07-28T20:59:59.000Z"), 2),
      matched(users.gia, new Date("2026-07-28T21:00:00.000Z"), 3),
      matched(users.zoe, new Date("2026-07-28T21:30:00.000Z"), 4),
    ];

    expect(
      buildTransferLeaderboardRows(
        matches,
        {
          from: "2026-07-29",
          to: "2026-07-29",
          teamId: "team-1",
          query: "gia mon",
        },
        "Africa/Cairo",
      ),
    ).toEqual([
      expect.objectContaining({
        profileId: "gia",
        transferCount: 1,
        rank: 1,
      }),
    ]);
  });
});
