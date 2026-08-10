import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertTrustedMutationOrigin: vi.fn(),
  getAdminUserDetails: vi.fn(),
  moveUserToTeam: vi.fn(),
  permanentlyDeleteUser: vi.fn(),
  revalidatePath: vi.fn(),
  updateUserEmail: vi.fn(),
  updateUserPrimaryDialerName: vi.fn(),
  updateUserShift: vi.fn(),
  updateAdminUser: vi.fn(),
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
  getAdminUserDetails: mocks.getAdminUserDetails,
  moveUserToTeam: mocks.moveUserToTeam,
  permanentlyDeleteUser: mocks.permanentlyDeleteUser,
  updateUserEmail: mocks.updateUserEmail,
  updateUserPrimaryDialerName: mocks.updateUserPrimaryDialerName,
  updateUserShift: mocks.updateUserShift,
  updateAdminUser: mocks.updateAdminUser,
}));

import { DELETE, GET, PATCH } from "@/app/api/admin/users/[userId]/route";

const USER_ID = "00000000-0000-4000-8000-000000000201";
const TEAM_ID = "00000000-0000-4000-8000-000000000101";
const TARGET_TEAM_ID = "00000000-0000-4000-8000-000000000102";
const context = { params: Promise.resolve({ userId: USER_ID }) };

function patchRequest(body: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/admin/users/${USER_ID}`, {
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
      value: TARGET_TEAM_ID,
      teamName: "Team Two",
      changed: true,
    });
    mocks.updateUserShift.mockResolvedValue({
      field: "shift",
      value: "Evening",
      changed: true,
    });
    mocks.getAdminUserDetails.mockResolvedValue({
      profile: {
        id: USER_ID,
        name: "Example User",
        email: "example@test.local",
        role: "agent",
        shift: "Evening",
      },
      activeMembership: { teamId: TEAM_ID, teamName: "Team One" },
      overrides: [
        { permissionKey: "imports.preview", allowed: true },
      ],
    });
    mocks.updateAdminUser.mockResolvedValue(undefined);
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
      { userId: USER_ID, email: " NEW@example.test " },
    );
    expect(mocks.updateUserPrimaryDialerName).not.toHaveBeenCalled();
    expect(mocks.moveUserToTeam).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/teams");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/admin/users/${USER_ID}`,
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
      patchRequest({ field: "teamId", value: TARGET_TEAM_ID }),
      context,
    );

    expect(mocks.updateUserPrimaryDialerName).toHaveBeenCalledWith(
      expect.anything(),
      { userId: USER_ID, dialerName: "New Dialer" },
    );
    expect(mocks.moveUserToTeam).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      teamId: TARGET_TEAM_ID,
    });
    expect(mocks.updateUserShift).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
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
      patchRequest({ field: "name", value: "Changed" }),
      context,
    );

    expect(extraFieldResponse.status).toBe(400);
    expect(unsupportedFieldResponse.status).toBe(400);
    expect(mocks.updateUserEmail).not.toHaveBeenCalled();
  });

  it("returns an administrator-only quick preview using trusted user details", async () => {
    mocks.getAdminUserDetails.mockResolvedValue({
      profile: {
        id: USER_ID,
        name: "Example User",
        email: "example@test.local",
        role: "agent",
        shift: "Evening",
        accountStatus: "active",
        passwordState: "permanent",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        updatedAt: new Date("2026-08-02T10:00:00Z"),
        lastLoginAt: new Date("2026-08-03T10:00:00Z"),
      },
      activeMembership: { teamId: TEAM_ID, teamName: "Team One" },
      invitationStatus: "accepted",
      activeSessionCount: 2,
      mappings: [{ active: true, isPrimary: true, sourceAgentName: "Example" }],
      overrides: [{ permissionKey: "imports.preview", allowed: true }],
      audits: [{ id: "audit-1", action: "user_updated", metadata: null, createdAt: new Date("2026-08-03T11:00:00Z") }],
    });

    const response = await GET(new Request(`http://localhost:3000/api/admin/users/${USER_ID}`), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getAdminUserDetails).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), USER_ID);
    expect(payload.user).toMatchObject({ id: USER_ID, americanName: "Example", team: "Team One", activeSessionCount: 2 });
    expect(payload.overrides).toEqual([{ permissionKey: "imports.preview", allowed: true }]);
    expect(payload.activity).toHaveLength(1);
  });

  it("rejects a non-admin quick-preview request before reading user details", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "agent-1", role: "agent", teamIds: [] });

    const response = await GET(new Request(`http://localhost:3000/api/admin/users/${USER_ID}`), context);

    expect(response.status).toBe(403);
    expect(mocks.getAdminUserDetails).not.toHaveBeenCalled();
  });

  it("updates the authoritative role while preserving trusted profile and override state", async () => {
    const response = await PATCH(
      patchRequest({ field: "role", value: "manager" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.updateAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1", role: "admin" }),
      {
        userId: USER_ID,
        name: "Example User",
        email: "example@test.local",
        role: "manager",
        teamId: TEAM_ID,
        shift: "Evening",
        permissionOverrides: [
          { permissionKey: "imports.preview", value: "allow" },
        ],
      },
    );
  });

  it("rejects an invalid role before updating authorization state", async () => {
    const response = await PATCH(
      patchRequest({ field: "role", value: "owner" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid role." });
    expect(mocks.updateAdminUser).not.toHaveBeenCalled();
  });

  it("permanently deletes without requiring a confirmation email body", async () => {
    const response = await DELETE(
      new Request(`http://localhost:3000/api/admin/users/${USER_ID}`, {
        method: "DELETE",
        headers: { Origin: "http://localhost:3000" },
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.permanentlyDeleteUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1", role: "admin" }),
      { userId: USER_ID },
    );
  });

  it("preserves the final-active-admin deletion safeguard", async () => {
    mocks.permanentlyDeleteUser.mockRejectedValue(
      new Error("The final active admin cannot be changed."),
    );

    const response = await DELETE(
      new Request(`http://localhost:3000/api/admin/users/${USER_ID}`, {
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
