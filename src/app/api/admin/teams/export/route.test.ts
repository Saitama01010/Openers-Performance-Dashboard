import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveFilters: vi.fn(),
  listDirectory: vi.fn(),
  csv: vi.fn(),
}));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/admin/teams", () => ({
  resolveAdminTeamDirectoryFilters: mocks.resolveFilters,
  listAdminTeamsDirectory: mocks.listDirectory,
}));
vi.mock("@/admin/teams-csv", () => ({ adminTeamsCsv: mocks.csv }));

import { GET } from "./route";

describe("admin teams export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFilters.mockReturnValue({ query: "East" });
    mocks.listDirectory.mockResolvedValue({ rows: [{ id: "team-1" }] });
    mocks.csv.mockReturnValue("Team\r\nEast Openers");
  });

  it("exports the full filtered administrator result privately", async () => {
    const actor = { id: "admin-1", role: "admin", teamIds: [], organizationId: "org-1" };
    mocks.getCurrentUser.mockResolvedValue(actor);

    const response = await GET(new Request("http://localhost:3000/api/admin/teams/export?q=East&page=4"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("teams.csv");
    expect(mocks.listDirectory).toHaveBeenCalledWith(actor, { query: "East" }, { allRows: true });
  });

  it("rejects non-admin exports before querying teams", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "agent-1", role: "agent", teamIds: [], organizationId: "org-1" });

    const response = await GET(new Request("http://localhost:3000/api/admin/teams/export"));

    expect(response.status).toBe(403);
    expect(mocks.listDirectory).not.toHaveBeenCalled();
  });
});
