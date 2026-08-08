import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), resolveFilters: vi.fn(), listEvents: vi.fn(), csv: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/admin/audit", () => ({ resolveAdminAuditFilters: mocks.resolveFilters, listAdminAuditEvents: mocks.listEvents }));
vi.mock("@/admin/audit-csv", () => ({ adminAuditCsv: mocks.csv }));

import { GET } from "./route";

const actor = { id: "admin-1", role: "admin", teamIds: [], organizationId: "org-1" };

describe("admin audit export API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(actor);
    mocks.resolveFilters.mockReturnValue({ query: "Mia", category: "user-management" });
    mocks.listEvents.mockResolvedValue({ rows: [{ id: "evt-1" }] });
    mocks.csv.mockReturnValue("Event ID\r\nevt-1");
  });

  it("reruns the complete filtered server query", async () => {
    const response = await GET(new Request("http://localhost/api/admin/audit/export?q=Mia&category=user-management&page=4"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("audit-log.csv");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listEvents).toHaveBeenCalledWith(actor, { query: "Mia", category: "user-management" }, expect.objectContaining({ allRows: true, timeZone: "Africa/Cairo" }));
  });

  it.each(["manager", "agent"])("rejects %s exports before querying audit data", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...actor, role });
    const response = await GET(new Request("http://localhost/api/admin/audit/export"));
    expect(response.status).toBe(403);
    expect(mocks.listEvents).not.toHaveBeenCalled();
  });
});
