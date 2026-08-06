import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  authorizeDashboardExport: vi.fn(),
  getRoleDashboardData: vi.fn(),
}));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/dashboard/export-access", () => ({
  authorizeDashboardExport: mocks.authorizeDashboardExport,
}));
vi.mock("@/dashboard/role-data", () => ({
  getRoleDashboardData: mocks.getRoleDashboardData,
}));
vi.mock("@/env", () => ({
  getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }),
}));

import { GET } from "@/app/api/dashboard/export/route";

describe("dashboard export route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an explicitly private 401 without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/dashboard/export"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 403 for an agent export request", async () => {
    const agent = { id: "agent-1", role: "agent", teamIds: ["team-1"], organizationId: "org-1" };
    mocks.getCurrentUser.mockResolvedValue(agent);
    mocks.authorizeDashboardExport.mockRejectedValue(new Error("Forbidden"));

    const response = await GET(new Request("http://localhost/api/dashboard/export"));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getRoleDashboardData).not.toHaveBeenCalled();
  });

  it("passes an untrusted team filter through server authorization and rejects it", async () => {
    const admin = { id: "admin-1", role: "admin", teamIds: [], organizationId: "org-1" };
    mocks.getCurrentUser.mockResolvedValue(admin);
    mocks.authorizeDashboardExport.mockRejectedValue(new Error("Forbidden"));

    const response = await GET(new Request("http://localhost/api/dashboard/export?teamId=other-org-team"));

    expect(mocks.authorizeDashboardExport).toHaveBeenCalledWith(admin, "other-org-team");
    expect(response.status).toBe(403);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
