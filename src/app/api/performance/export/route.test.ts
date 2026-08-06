import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getData: vi.fn(),
}));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/performance/data", () => ({ getPerformancePageData: mocks.getData }));

import { GET } from "@/app/api/performance/export/route";

const series = [{
  key: "2026-05-01",
  date: "2026-05-01",
  rangeStart: "2026-05-01",
  rangeEnd: "2026-05-01",
  transfers: 2,
  closedDeals: 1,
  closedDealRate: 50,
  loggedInSeconds: 3600,
  readySeconds: 0,
  talkSeconds: 0,
  ringingSeconds: null,
  wrapSeconds: 0,
  pausedSeconds: 0,
  systemPauseSeconds: null,
  idleSeconds: null,
  untrackedSeconds: null,
  netSeconds: null,
  sourceRows: 4,
}];

describe("performance export route", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.getData.mockReset();
  });

  it("requires authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/performance/export"));
    expect(response.status).toBe(401);
    expect(mocks.getData).not.toHaveBeenCalled();
  });

  it.each(["admin", "manager", "agent"] as const)("exports the normalized %s scope returned by the server loader", async (role) => {
    const actor = { id: `${role}-id`, role, teamIds: role === "manager" ? ["team-1"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.getData.mockResolvedValue({ series });
    const response = await GET(new Request("http://localhost/api/performance/export?range=this-month"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("performance-data.csv");
    expect(await response.text()).toContain("2026-05-01,2026-05-01,2,1,3600,50,4");
    expect(mocks.getData).toHaveBeenCalledWith(actor, expect.objectContaining({ timeZone: "Africa/Cairo" }));
  });
});
