import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), roomData: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/env", () => ({ getEnv: () => ({ GOOGLE_SHEETS_TIMEZONE: "Africa/Cairo" }) }));
vi.mock("@/coaching/data", () => ({ getCoachingRoomData: mocks.roomData }));

import { GET } from "@/app/api/coaching/sessions/export/route";

describe("coaching session export route", () => {
  beforeEach(() => { mocks.currentUser.mockReset(); mocks.roomData.mockReset(); });
  it("requires authentication and rejects agents", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/coaching/sessions/export"))).status).toBe(401);
    mocks.currentUser.mockResolvedValue({ id: "agent", role: "agent", teamIds: [] });
    expect((await GET(new Request("http://localhost/api/coaching/sessions/export"))).status).toBe(403);
  });
  it("exports only rows returned by the role-scoped loader and neutralizes spreadsheet formulas", async () => {
    const actor = { id: "manager", role: "manager", teamIds: ["east"] };
    mocks.currentUser.mockResolvedValue(actor);
    mocks.roomData.mockResolvedValue({ rows: [{ id: "session", sessionDate: "2026-08-07", coachName: "Coach", category: "improvement", participants: [{ id: "agent", name: "=Agent", teamName: "East" }], note: "+note", createdAt: "2026-08-07T10:00:00.000Z" }] });
    const response = await GET(new Request("http://localhost/api/coaching/sessions/export?range=this-month&team=east"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("'=Agent (East)");
    expect(body).toContain("'+note");
    expect(mocks.roomData).toHaveBeenCalledWith(actor, expect.objectContaining({ teamId: "east", pageSize: 5000 }));
  });
});
