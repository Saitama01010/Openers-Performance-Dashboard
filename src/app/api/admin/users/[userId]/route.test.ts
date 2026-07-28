import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertTrustedMutationOrigin: vi.fn(),
  moveUserToTeam: vi.fn(),
  permanentlyDeleteUser: vi.fn(),
  revalidatePath: vi.fn(),
  updateUserEmail: vi.fn(),
  updateUserPrimaryDialerName: vi.fn(),
  updateUserShift: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/auth/request-security", () => ({
  assertTrustedMutationOrigin: mocks.assertTrustedMutationOrigin,
}));
vi.mock("@/admin/data", () => ({
  moveUserToTeam: mocks.moveUserToTeam,
  permanentlyDeleteUser: mocks.permanentlyDeleteUser,
  updateUserEmail: mocks.updateUserEmail,
  updateUserPrimaryDialerName: mocks.updateUserPrimaryDialerName,
  updateUserShift: mocks.updateUserShift,
}));

import { DELETE, PATCH } from "@/app/api/admin/users/[userId]/route";

const context = { params: Promise.resolve({ userId: "user-1" }) };

function patchRequest(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/admin/users/user-1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe("admin user inline API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      teamIds: [],
    });
    mocks.assertTrustedMutationOrigin.mockImplementation((request: Request) => {
      if (request.headers.get("origin") === "https://evil.example") {
        throw new Error("Untrusted request origin.");
      }
    });
    mocks.updateUserEmail.mockResolvedValue({
      field: "email",
      value: "new@example.test",
      changed: true,
    });
    mocks.updateUserPrimaryDialerName.mockResolvedValue({
      field: "dialerName",
      value: "New Dialer",
      normalizedValue: "new dialer",
      changed: true,
    });
    mocks.moveUserToTeam.mockResolvedValue({
      field: "teamId",
      value: "team-2",
      teamName: "Team Two",
      changed: true,
    });
    mocks.updateUserShift.mockResolvedValue({
      field: "shift",
      value: "Evening",
      changed: true,
    });
  });

  it("allows an administrator to update only the requested email field", async () => {
    const response = await PATCH(
      patchRequest({ field: "email", value: " NEW@example.test " }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.updateUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1", role: "admin" }),
      { userId: "user-1", email: " NEW@example.test " },
    );
    expect(mocks.updateUserPrimaryDialerName).not.toHaveBeenCalled();
    expect(mocks.moveUserToTeam).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/teams");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/users/user-1",
    );
  });

  it("dispatches dialer-name, shift, and team changes to granular mutations", async () => {
    await PATCH(
      patchRequest({ field: "dialerName", value: "New Dialer" }),
      context,
    );
    await PATCH(
      patchRequest({ field: "shift", value: "Evening" }),
      context,
    );
    await PATCH(
      patchRequest({ field: "teamId", value: "team-2" }),
      context,
    );

    expect(mocks.updateUserPrimaryDialerName).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-1", dialerName: "New Dialer" },
    );
    expect(mocks.moveUserToTeam).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      teamId: "team-2",
    });
    expect(mocks.updateUserShift).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      shift: "Evening",
    });
  });

  it("rejects non-admin users before running a mutation", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "agent-1",
      role: "agent",
      teamIds: [],
    });

    const response = await PATCH(
      patchRequest({ field: "email", value: "new@example.test" }),
      context,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Administrator access required.",
    });
    expect(mocks.assertTrustedMutationOrigin).not.toHaveBeenCalled();
    expect(mocks.updateUserEmail).not.toHaveBeenCalled();
  });

  it("rejects an untrusted mutation origin", async () => {
    const response = await PATCH(
      patchRequest(
        { field: "email", value: "new@example.test" },
        "https://evil.example",
      ),
      context,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Untrusted request origin.",
    });
    expect(mocks.updateUserEmail).not.toHaveBeenCalled();
  });

  it("rejects unsupported or additional fields", async () => {
    const extraFieldResponse = await PATCH(
      patchRequest({
        field: "email",
        value: "new@example.test",
        role: "admin",
      }),
      context,
    );
    const unsupportedFieldResponse = await PATCH(
      patchRequest({ field: "role", value: "admin" }),
      context,
    );

    expect(extraFieldResponse.status).toBe(400);
    expect(unsupportedFieldResponse.status).toBe(400);
    expect(mocks.updateUserEmail).not.toHaveBeenCalled();
  });

  it("permanently deletes without requiring a confirmation email body", async () => {
    const response = await DELETE(
      new Request("http://localhost:3000/api/admin/users/user-1", {
        method: "DELETE",
        headers: { Origin: "http://localhost:3000" },
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.permanentlyDeleteUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1", role: "admin" }),
      { userId: "user-1" },
    );
  });

  it("preserves the final-active-admin deletion safeguard", async () => {
    mocks.permanentlyDeleteUser.mockRejectedValue(
      new Error("The final active admin cannot be changed."),
    );

    const response = await DELETE(
      new Request("http://localhost:3000/api/admin/users/user-1", {
        method: "DELETE",
        headers: { Origin: "http://localhost:3000" },
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The final active admin cannot be changed.",
    });
  });
});
