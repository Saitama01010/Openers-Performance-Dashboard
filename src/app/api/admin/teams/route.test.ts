import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTeam: vi.fn(),
  getCurrentUser: vi.fn(),
  assertTrustedMutationOrigin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/admin/data", () => ({ createTeam: mocks.createTeam }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/auth/request-security", () => ({
  assertTrustedMutationOrigin: mocks.assertTrustedMutationOrigin,
}));

import { POST } from "./route";

describe("admin teams route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 without invoking a mutation for a non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "manager-1",
      role: "manager",
      teamIds: ["team-1"],
      organizationId: "org-1",
    });

    const response = await POST(
      new Request("https://dashboard.example/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createTeam).not.toHaveBeenCalled();
  });

  it("creates a team in the authenticated admin context", async () => {
    const actor = {
      id: "admin-1",
      role: "admin",
      teamIds: [],
      organizationId: "org-1",
    };
    mocks.getCurrentUser.mockResolvedValue(actor);
    mocks.createTeam.mockResolvedValue("team-2");

    const response = await POST(
      new Request("https://dashboard.example/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Team Two" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createTeam).toHaveBeenCalledWith(actor, "Team Two");
  });
});
