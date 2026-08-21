import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/actions", () => ({ loginAction: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

import LoginPage from "@/app/login/page";

describe("login page session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an authenticated user to the dashboard", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "profile-id",
      email: "person@example.test",
      name: "Person",
      role: "agent",
      teamIds: [],
      organizationId: "organization-id",
    });

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders for an anonymous user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
