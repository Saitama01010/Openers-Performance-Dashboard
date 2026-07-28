import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertTrustedMutationOrigin: vi.fn(),
  getCurrentUser: vi.fn(),
  permanentlyDeleteUsers: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/auth/request-security", () => ({
  assertTrustedMutationOrigin: mocks.assertTrustedMutationOrigin,
}));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/admin/data", () => ({
  permanentlyDeleteUsers: mocks.permanentlyDeleteUsers,
}));

import { DELETE } from "@/app/api/admin/users/bulk-delete/route";

const first = "00000000-0000-4000-8000-000000000011";
const second = "00000000-0000-4000-8000-000000000012";

function request(userIds: unknown) {
  return new Request("http://localhost:3000/api/admin/users/bulk-delete", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ userIds }),
  });
}

describe("bulk user deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      teamIds: [],
    });
    mocks.permanentlyDeleteUsers.mockResolvedValue({
      deletedIds: [first, second],
    });
  });

  it("deduplicates IDs and dispatches one authorized bulk operation", async () => {
    const response = await DELETE(request([first, second, first]));

    expect(response.status).toBe(200);
    expect(mocks.permanentlyDeleteUsers).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" }),
      { userIds: [first, second] },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("rejects direct requests from non-admin users", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: first,
      role: "manager",
      teamIds: [],
    });
    const response = await DELETE(request([second]));

    expect(response.status).toBe(403);
    expect(mocks.assertTrustedMutationOrigin).not.toHaveBeenCalled();
    expect(mocks.permanentlyDeleteUsers).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated direct requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await DELETE(request([second]));

    expect(response.status).toBe(401);
    expect(mocks.permanentlyDeleteUsers).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs before reaching the database", async () => {
    const response = await DELETE(request([first, "invalid"]));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "One or more selected user IDs are invalid.",
    });
    expect(mocks.permanentlyDeleteUsers).not.toHaveBeenCalled();
  });
});
