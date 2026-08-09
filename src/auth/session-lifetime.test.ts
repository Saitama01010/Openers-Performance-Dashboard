import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { isSessionUsableAt } from "@/auth/session";

describe("session lifetime policy", () => {
  const now = new Date("2026-08-09T12:00:00Z");

  it("preserves a session inside both its idle and absolute lifetime", () => {
    expect(isSessionUsableAt({
      expiresAt: new Date("2026-08-10T12:00:00Z"),
      lastSeenAt: new Date("2026-08-09T11:30:00Z"),
    }, now, 60)).toBe(true);
  });

  it("rejects absolute and idle expiration boundaries", () => {
    expect(isSessionUsableAt({
      expiresAt: now,
      lastSeenAt: new Date("2026-08-09T11:59:00Z"),
    }, now, 60)).toBe(false);
    expect(isSessionUsableAt({
      expiresAt: new Date("2026-08-10T12:00:00Z"),
      lastSeenAt: new Date("2026-08-09T11:00:00Z"),
    }, now, 60)).toBe(false);
  });
});
