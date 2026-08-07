import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), exportRows: vi.fn() }));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/teams/performance", () => ({ getTeamPerformanceExportRows: mocks.exportRows }));

import { GET } from "@/app/api/teams/performance/export/route";

const row = {
  teamId: "east",
  teamName: "East Openers",
  activeAgents: 2,
  agentsWithDialerData: 2,
  transfers: 10,
  closedDeals: 4,
  conversion: 40,
  averageLoggedInSeconds: 3600,
  averageTalkPercentage: 25,
  comparison: null,
  health: "healthy",
  healthLabel: "Target achieved",
  targetMetric: "transfers",
  targetValue: 8,
  trend: [],
};

describe("team performance export route", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.exportRows.mockReset();
  });

  it("requires authentication and rejects agents", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/teams/performance/export"))).status).toBe(401);
    mocks.currentUser.mockResolvedValue({ id: "agent", role: "agent", teamIds: ["east"] });
    expect((await GET(new Request("http://localhost/api/teams/performance/export"))).status).toBe(403);
  });

  it.each(["admin", "manager"] as const)("exports the revalidated %s scope", async (role) => {
    const actor = { id: role, role, teamIds: role === "manager" ? ["east"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.exportRows.mockResolvedValue({ rows: [row], sources: { transfers: "ready", closedDeals: "ready" } });
    const response = await GET(new Request("http://localhost/api/teams/performance/export?metric=conversion"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("east,East Openers,Target achieved,2,2,10,4,40.00");
    expect(mocks.exportRows).toHaveBeenCalledWith(actor, expect.objectContaining({
      filters: expect.objectContaining({ metric: "conversion" }),
    }));
  });

  it("fails closed when an outcome source is unavailable", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin", role: "admin", teamIds: [] });
    mocks.exportRows.mockResolvedValue({ rows: [row], sources: { transfers: "ready", closedDeals: "unavailable" } });
    expect((await GET(new Request("http://localhost/api/teams/performance/export"))).status).toBe(503);
  });
});
