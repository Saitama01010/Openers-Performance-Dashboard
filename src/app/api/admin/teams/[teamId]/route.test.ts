import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertTrustedMutationOrigin: vi.fn(),
  getAdminTeamDetails: vi.fn(),
  renameTeam: vi.fn(),
  setTeamStatus: vi.fn(),
  assignTeamManager: vi.fn(),
  moveTeamMember: vi.fn(),
  removeTeamMembership: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/auth/request-security", () => ({ assertTrustedMutationOrigin: mocks.assertTrustedMutationOrigin }));
vi.mock("@/admin/teams", () => ({ getAdminTeamDetails: mocks.getAdminTeamDetails }));
vi.mock("@/admin/data", () => ({
  renameTeam: mocks.renameTeam,
  setTeamStatus: mocks.setTeamStatus,
  assignTeamManager: mocks.assignTeamManager,
  moveTeamMember: mocks.moveTeamMember,
  removeTeamMembership: mocks.removeTeamMembership,
}));

import { GET, PATCH } from "./route";

const actor = { id: "admin-1", role: "admin", teamIds: [], organizationId: "org-1" };
const TEAM_ID = "00000000-0000-4000-8000-000000000101";
const TARGET_TEAM_ID = "00000000-0000-4000-8000-000000000102";
const USER_ID = "00000000-0000-4000-8000-000000000201";
const context = { params: Promise.resolve({ teamId: TEAM_ID }) };

function patch(body: unknown) {
  return new Request(`http://localhost:3000/api/admin/teams/${TEAM_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("admin team details API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(actor);
    mocks.assertTrustedMutationOrigin.mockImplementation(() => undefined);
  });

  it("returns administrator-scoped details without caching", async () => {
    mocks.getAdminTeamDetails.mockResolvedValue({ team: { id: TEAM_ID, name: "East Openers" } });

    const response = await GET(new Request(`http://localhost:3000/api/admin/teams/${TEAM_ID}`), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getAdminTeamDetails).toHaveBeenCalledWith(actor, TEAM_ID, {
      memberPage: 1,
      memberPageSize: 25,
      memberQuery: "",
    });
  });

  it("rejects non-admin reads before loading details", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...actor, role: "manager" });

    const response = await GET(new Request(`http://localhost:3000/api/admin/teams/${TEAM_ID}`), context);

    expect(response.status).toBe(403);
    expect(mocks.getAdminTeamDetails).not.toHaveBeenCalled();
  });

  it("dispatches authoritative member moves to the selected destination", async () => {
    const response = await PATCH(patch({ action: "move-member", userId: USER_ID, targetTeamId: TARGET_TEAM_ID }), context);

    expect(response.status).toBe(200);
    expect(mocks.moveTeamMember).toHaveBeenCalledWith(actor, { userId: USER_ID, teamId: TARGET_TEAM_ID });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/teams");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/teams/performance");
  });

  it("blocks untrusted origins before mutation", async () => {
    mocks.assertTrustedMutationOrigin.mockImplementation(() => { throw new Error("Untrusted request origin."); });

    const response = await PATCH(patch({ action: "rename", name: "Changed" }), context);

    expect(response.status).toBe(403);
    expect(mocks.renameTeam).not.toHaveBeenCalled();
  });

  it("returns the lifecycle safeguard when deactivation still has members", async () => {
    mocks.setTeamStatus.mockRejectedValue(new Error("Move or remove 1 manager(s) and 4 agent(s) before deactivating this team."));

    const response = await PATCH(patch({ action: "status", active: false }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Move or remove 1 manager(s) and 4 agent(s) before deactivating this team." });
  });
});
