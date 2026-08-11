import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), getData: vi.fn() }));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/leaderboard/data", () => ({ getLeaderboardData: mocks.getData }));

import { GET } from "@/app/api/leaderboard/export/route";

const row = {
  profileId: "agent-1", realName: "Agent One", americanName: "Amy One", teamId: "east", teamName: "East",
  transferCount: 4, closedDeals: 2, comparison: null, trend: [],
};

describe("leaderboard export route", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.getData.mockReset();
  });

  it("requires authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/leaderboard/export"));
    expect(response.status).toBe(401);
  });

  it.each(["admin", "manager", "agent"] as const)("exports only the normalized %s scope returned by the server loader", async (role) => {
    const actor = { id: `${role}-id`, role, teamIds: role === "manager" ? ["east"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.getData.mockResolvedValue({ status: "ready", rows: [row] });
    const response = await GET(new Request("http://localhost/api/leaderboard/export?range=this-month&metric=conversion&top=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("leaderboard.csv");
    expect(await response.text()).toContain("1,Agent One,Amy One,East,4,2,50.00,Unavailable,conversion");
    expect(mocks.getData).toHaveBeenCalledWith(actor, expect.objectContaining({ comparison: expect.any(Object) }));
  });

  it("fails closed when an authoritative source is unavailable", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin", role: "admin", teamIds: [] });
    mocks.getData.mockResolvedValue({
      status: "ready",
      rows: [row],
      closedMetricsAvailable: false,
    });
    const response = await GET(new Request("http://localhost/api/leaderboard/export"));
    expect(response.status).toBe(503);
  });

  it("exports usable transfer rankings while marking Closed metrics unavailable", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin", role: "admin", teamIds: [] });
    mocks.getData.mockResolvedValue({
      status: "ready",
      rows: [row],
      closedMetricsAvailable: false,
    });
    const response = await GET(
      new Request("http://localhost/api/leaderboard/export?metric=transfers"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "1,Agent One,Amy One,East,4,Unavailable,Unavailable,Unavailable,transfers",
    );
  });
});
