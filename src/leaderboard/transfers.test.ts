import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  invalidateLeaderboardSourceCache,
  loadLeaderboardSources,
  resetLeaderboardSourceCacheForTests,
} from "@/leaderboard/transfers";

const config = {
  endpointUrl: "https://script.google.com/macros/s/deployment-id/exec",
  secret: "server-secret",
  timeZone: "Africa/Cairo",
};

function payload(closedRows: unknown[][] = []) {
  return {
    ok: true,
    worksheet: "Xfers",
    headers: ["Timestamp", "Opener", "Customer Name", "Phone Number"],
    rows: [],
    rowCount: 0,
    generatedAt: "2026-07-30T10:00:00.000Z",
    closed: {
      ok: true,
      worksheet: "Closed",
      headers: [
        "Timestamp",
        "Closer",
        "Customer Name",
        "File Number",
        "Debt Amount",
        "Ready For Submission",
        "Opener",
      ],
      rows: closedRows,
      rowCount: closedRows.length,
      generatedAt: "2026-07-30T10:00:00.000Z",
    },
  };
}

describe("LeaderBoard source cache", () => {
  beforeEach(() => {
    resetLeaderboardSourceCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces concurrent callers and caches both sources from one POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      loadLeaderboardSources(config),
      loadLeaderboardSources(config),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.sources.transfers.records).toEqual([]);
    expect(first.sources.closed.status).toBe("ready");
    expect(second.sources).toEqual(first.sources);
  });

  it("manual invalidation refreshes Xfers and Closed together", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload()), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            payload([
              [
                "2026-07-30T10:00:00.000Z",
                "Closer",
                "Customer",
                "F-1",
                "1000",
                "No",
                "Gia Monroe",
              ],
            ]),
          ),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await loadLeaderboardSources(config);
    invalidateLeaderboardSourceCache();
    const refreshed = await loadLeaderboardSources(config);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      refreshed.sources.closed.status === "ready" &&
        refreshed.sources.closed.data.records,
    ).toHaveLength(1);
  });

  it("preserves the last fully successful result when a later refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload()), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("temporary outage"));
    vi.stubGlobal("fetch", fetchMock);

    await loadLeaderboardSources(config);
    invalidateLeaderboardSourceCache();
    const stale = await loadLeaderboardSources(config);

    expect(stale.stale).toBe(true);
    expect(stale.sources.closed.status).toBe("ready");
  });
});
