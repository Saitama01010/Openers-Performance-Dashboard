import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertTrustedMutationOrigin: vi.fn(),
  consumeRateLimit: vi.fn(),
  revealTemporaryPassword: vi.fn(),
  regenerateTemporaryPassword: vi.fn(),
}));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/auth/request-security", () => ({ assertTrustedMutationOrigin: mocks.assertTrustedMutationOrigin }));
vi.mock("@/auth/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/admin/data", () => ({
  revealTemporaryPassword: mocks.revealTemporaryPassword,
  regenerateTemporaryPassword: mocks.regenerateTemporaryPassword,
}));

import { POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000501";
const context = { params: Promise.resolve({ userId: USER_ID }) };
const actor = {
  id: "00000000-0000-4000-8000-000000000502",
  organizationId: "00000000-0000-4000-8000-000000000503",
  role: "admin",
  teamIds: [],
};

function request(body: unknown) {
  return new Request(`http://localhost:3000/api/admin/users/${USER_ID}/temporary-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("temporary-password API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(actor);
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mocks.revealTemporaryPassword.mockResolvedValue("Secret-once!42");
  });

  it("returns a one-time value only through an authorized no-store response", async () => {
    const response = await POST(request({ action: "reveal" }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ password: "Secret-once!42" });
    expect(mocks.revealTemporaryPassword).toHaveBeenCalledWith(actor, USER_ID);
  });

  it("enforces durable rate limiting before reveal", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 123 });
    const response = await POST(request({ action: "reveal" }), context);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("123");
    expect(mocks.revealTemporaryPassword).not.toHaveBeenCalled();
  });

  it("requires a bounded reason for regeneration", async () => {
    const invalid = await POST(request({ action: "regenerate", reason: "short" }), context);
    expect(invalid.status).toBe(400);
    expect(mocks.regenerateTemporaryPassword).not.toHaveBeenCalled();

    const valid = await POST(request({ action: "regenerate", reason: "Verified employee credential rotation" }), context);
    expect(valid.status).toBe(200);
    expect(mocks.regenerateTemporaryPassword).toHaveBeenCalledWith(
      actor,
      USER_ID,
      "Verified employee credential rotation",
    );
  });

  it("rejects direct non-admin access before origin or rate-limit processing", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...actor, role: "manager" });
    const response = await POST(request({ action: "reveal" }), context);
    expect(response.status).toBe(403);
    expect(mocks.assertTrustedMutationOrigin).not.toHaveBeenCalled();
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });
});
