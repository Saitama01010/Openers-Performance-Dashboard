import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getEvent: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/admin/audit", () => ({ getAdminAuditEvent: mocks.getEvent }));

import { GET } from "./route";

const actor = { id: "admin-1", role: "admin", teamIds: [], organizationId: "org-1" };
const context = { params: Promise.resolve({ eventId: "evt-1" }) };

describe("admin audit event details API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getCurrentUser.mockResolvedValue(actor); });

  it("returns authorized redacted details privately", async () => {
    mocks.getEvent.mockResolvedValue({ id: "evt-1", metadata: { password: "[REDACTED]" } });
    const response = await GET(new Request("http://localhost/api/admin/audit/evt-1"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ id: "evt-1", metadata: { password: "[REDACTED]" } });
    expect(mocks.getEvent).toHaveBeenCalledWith(actor, "evt-1");
  });

  it.each(["manager", "agent"])("rejects %s reads before querying evidence", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...actor, role });
    const response = await GET(new Request("http://localhost/api/admin/audit/evt-1"), context);
    expect(response.status).toBe(403);
    expect(mocks.getEvent).not.toHaveBeenCalled();
  });
});
