import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), exportRows: vi.fn() }));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/agents/directory", () => ({ getAgentDirectoryExportRows: mocks.exportRows }));

import { GET } from "@/app/api/agents/export/route";

const row = {
  profileId: "agent-1", realName: "Agent One", americanName: "Amy One", teamId: "east", teamIds: ["east"], teamName: "East",
  accountStatus: "active", hasMetrics: true, loggedInSeconds: 3600, talkSeconds: 900, talkPercentage: 25,
  transfers: 4, closedDeals: 2, conversion: 50, comparison: null, trend: [],
};

describe("agent directory export route", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.exportRows.mockReset();
  });

  it("requires authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/agents/export"));
    expect(response.status).toBe(401);
  });

  it.each(["admin", "manager", "agent"] as const)("exports only the revalidated %s scope returned by the server loader", async (role) => {
    const actor = { id: `${role}-id`, role, teamIds: role === "manager" ? ["east"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.exportRows.mockResolvedValue({ rows: [row], sources: { transfers: "ready", closedDeals: "ready" } });
    const response = await GET(new Request("http://localhost/api/agents/export?range=this-month&team=east&sort=transfers"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("agents.csv");
    expect(await response.text()).toContain("Agent One,Amy One,East,active,Included,3600,900,25.00,4,2,50.00");
    expect(mocks.exportRows).toHaveBeenCalledWith(actor, expect.objectContaining({
      filters: expect.objectContaining({ teamId: "east", sortBy: "transfers" }),
    }));
  });

  it("fails closed when either authoritative outcome source is unavailable", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin", role: "admin", teamIds: [] });
    mocks.exportRows.mockResolvedValue({ rows: [row], sources: { transfers: "ready", closedDeals: "unavailable" } });
    const response = await GET(new Request("http://localhost/api/agents/export"));
    expect(response.status).toBe(503);
  });
});
