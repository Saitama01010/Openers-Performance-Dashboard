import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  retry: vi.fn(),
  origin: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/email/outbox", () => ({ retryFailedEmail: mocks.retry }));
vi.mock("@/auth/request-security", () => ({ assertTrustedMutationOrigin: mocks.origin }));
vi.mock("@/auth/rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "admin", role: "admin", organizationId: "org", teamIds: [] });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.retry.mockResolvedValue(undefined);
});

describe("admin email outbox retry route", () => {
  it("rejects unauthenticated and malformed direct requests", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://localhost"), { params: Promise.resolve({ messageId: id }) })).status).toBe(401);
    expect((await POST(new Request("http://localhost"), { params: Promise.resolve({ messageId: "bad" }) })).status).toBe(400);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("enforces origin and invokes the scoped service for an administrator", async () => {
    const request = new Request("http://localhost", { method: "POST" });
    expect((await POST(request, { params: Promise.resolve({ messageId: id }) })).status).toBe(200);
    expect(mocks.origin).toHaveBeenCalledWith(request);
    expect(mocks.retry).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org" }), id);
  });
});
