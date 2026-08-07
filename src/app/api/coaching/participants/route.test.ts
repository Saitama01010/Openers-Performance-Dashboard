import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), participantPage: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/coaching/data", () => ({ getCoachingParticipantPage: mocks.participantPage }));

import { GET } from "@/app/api/coaching/participants/route";

describe("coaching participant search route", () => {
  beforeEach(() => { mocks.currentUser.mockReset(); mocks.participantPage.mockReset(); });

  it("requires authentication and rejects agents", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/coaching/participants"))).status).toBe(401);
    mocks.currentUser.mockResolvedValue({ id: "agent", role: "agent", teamIds: ["east"] });
    expect((await GET(new Request("http://localhost/api/coaching/participants"))).status).toBe(403);
  });

  it.each(["admin", "manager"] as const)("delegates %s pagination and search to the authorized server loader", async (role) => {
    const actor = { id: role, role, teamIds: role === "manager" ? ["east"] : [] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.participantPage.mockResolvedValue({ rows: [], page: 2, pageSize: 12, total: 0 });
    const response = await GET(new Request("http://localhost/api/coaching/participants?coach=coach-1&page=2&q=omar"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.participantPage).toHaveBeenCalledWith(actor, { coachProfileId: "coach-1", page: 2, pageSize: 12, search: "omar" });
  });
});
