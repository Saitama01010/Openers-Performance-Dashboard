import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, getCommissionReport } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCommissionReport: vi.fn(),
}));
vi.mock("@/auth/session", () => ({ getCurrentUser }));
vi.mock("@/commissions/service", () => ({ getCommissionReport }));

import { GET } from "@/app/api/commissions/export/route";
import { resolveCommissionMonth } from "@/commissions/month";
import { buildCommissionReport } from "@/commissions/report";

const manager = { id: "manager", email: "manager@example.com", name: "Manager", role: "manager" as const, teamIds: ["east"], organizationId: "org" };

function readyReport() {
  return buildCommissionReport({
    role: "manager",
    month: resolveCommissionMonth("2026-08", new Date("2026-08-15T00:00:00Z"), "Africa/Cairo"),
    timeZone: "Africa/Cairo",
    employees: [{ id: "agent", realName: "Jane Doe", americanName: "Jane", email: "jane@example.com", active: true, team: { id: "east", name: "East Team" } }],
    deals: [],
    teams: [{ id: "east", name: "East Team" }],
  });
}

describe("commission export route", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getCommissionReport.mockReset();
  });

  it("requires a session", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/commissions/export"))).status).toBe(401);
  });

  it("returns 403 to agents without calling the report service", async () => {
    getCurrentUser.mockResolvedValue({ ...manager, id: "agent", role: "agent" });
    expect((await GET(new Request("http://localhost/api/commissions/export?commissionMonth=2026-08"))).status).toBe(403);
    expect(getCommissionReport).not.toHaveBeenCalled();
  });

  it("returns 503 instead of a misleading header-only CSV on source failure", async () => {
    getCurrentUser.mockResolvedValue(manager);
    getCommissionReport.mockResolvedValue({ status: "source_unavailable", month: resolveCommissionMonth("2026-08"), message: "Unavailable" });
    const response = await GET(new Request("http://localhost/api/commissions/export?commissionMonth=2026-08"));
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).not.toContain("text/csv");
  });

  it("rejects export when only stale cached Closed data is available", async () => {
    getCurrentUser.mockResolvedValue(manager);
    getCommissionReport.mockResolvedValue({ ...readyReport(), stale: true });
    const response = await GET(new Request("http://localhost/api/commissions/export?commissionMonth=2026-08"));
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).not.toContain("text/csv");
  });

  it("exports the exact six-column schema from the shared report", async () => {
    getCurrentUser.mockResolvedValue(manager);
    getCommissionReport.mockResolvedValue(readyReport());
    const response = await GET(new Request("http://localhost/api/commissions/export?commissionMonth=2026-08"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("commissions-2026-08-east-team.csv");
    const lines = (await response.text()).replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("Real Name,American Name,Email,Team,Closed Deals,Commission in EGP");
    expect(lines[1]).toBe("Jane Doe,Jane,jane@example.com,East Team,0,0");
  });

  it("maps invalid months to 400 and unauthorized filters to 403", async () => {
    getCurrentUser.mockResolvedValue(manager);
    getCommissionReport.mockRejectedValueOnce(new RangeError("Invalid month"));
    expect((await GET(new Request("http://localhost/api/commissions/export?commissionMonth=nope"))).status).toBe(400);
    getCommissionReport.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await GET(new Request("http://localhost/api/commissions/export?team=west"))).status).toBe(403);
  });
});
