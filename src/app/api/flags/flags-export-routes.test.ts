import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), performance: vi.fn(), transfers: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/flags/data", () => ({ getPerformanceFlagsData: mocks.performance, getTransferFlagsData: mocks.transfers }));

import { GET as performanceExport } from "@/app/api/flags/performance/export/route";
import { GET as transferExport } from "@/app/api/flags/transfers/export/route";

describe("flag export routes", () => {
  beforeEach(() => { mocks.currentUser.mockReset(); mocks.performance.mockReset(); mocks.transfers.mockReset(); });

  it("requires authentication before loading either export", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await performanceExport(new Request("http://localhost/api/flags/performance/export"))).status).toBe(401);
    expect((await transferExport(new Request("http://localhost/api/flags/transfers/export"))).status).toBe(401);
    expect(mocks.performance).not.toHaveBeenCalled();
    expect(mocks.transfers).not.toHaveBeenCalled();
  });

  it.each(["admin", "manager", "agent"] as const)("revalidates and exports the authorized %s performance scope", async (role) => {
    const actor = { id: role, role, teamIds: role === "manager" ? ["east"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.performance.mockResolvedValue({ source: { status: "ready" }, rows: [{ agentId: "a", agentName: "Agent A", teamNames: ["East"], talkSeconds: 3600, wrapSeconds: 600, pausedSeconds: 300, triggeredFlags: ["Wrap Time Flag"], wrapRate: 10, pauseRate: 5, wrapThreshold: 7, pauseThreshold: 8 }] });
    const response = await performanceExport(new Request("http://localhost/api/flags/performance/export?range=this-month&team=east"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Agent A,East,3600,600,300,Wrap Time Flag,10,7,5,8,Not configured");
    expect(mocks.performance).toHaveBeenCalledWith(actor, expect.objectContaining({ teamId: "east" }));
  });

  it("exports independent transfer weeks and fails closed for an unavailable source", async () => {
    const actor = { id: "manager", role: "manager", teamIds: ["east"] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.transfers.mockResolvedValue({ source: { status: "ready" }, rows: [{ agentId: "a", agentName: "Agent A", teamNames: ["East"], closedDeals: 1, week: { start: "2026-08-03", end: "2026-08-09" }, classification: "strong" }] });
    const response = await transferExport(new Request("http://localhost/api/flags/transfers/export?flag=strong"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Agent A,East,1,2026-08-03,2026-08-09,Strong Flag,Not configured");
    mocks.transfers.mockResolvedValue({ source: { status: "unavailable" }, rows: [] });
    expect((await transferExport(new Request("http://localhost/api/flags/transfers/export"))).status).toBe(503);
  });

  it("returns forbidden when the server loader rejects a forged filter", async () => {
    mocks.currentUser.mockResolvedValue({ id: "agent", role: "agent", teamIds: [] });
    mocks.performance.mockRejectedValue(new Error("Forbidden"));
    expect((await performanceExport(new Request("http://localhost/api/flags/performance/export?profile=other"))).status).toBe(403);
  });
});
