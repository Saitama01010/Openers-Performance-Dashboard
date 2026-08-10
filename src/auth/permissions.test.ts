import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));

import { hasPermission } from "@/auth/permissions";

describe("effective permissions", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it("fails closed for legacy manager lifecycle permissions before reading persisted role grants", async () => {
    const manager = {
      id: "manager",
      role: "manager" as const,
      organizationId: "organization",
      teamIds: ["team"],
    };

    await expect(hasPermission(manager, "users.deactivate_team_agent")).resolves.toBe(false);
    await expect(hasPermission(manager, "users.terminate_team_agent")).resolves.toBe(false);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed for agents regardless of the requested team lifecycle key", async () => {
    const agent = {
      id: "agent",
      role: "agent" as const,
      organizationId: "organization",
      teamIds: ["team"],
    };

    await expect(hasPermission(agent, "users.deactivate_team_agent")).resolves.toBe(false);
    await expect(hasPermission(agent, "users.terminate_team_agent")).resolves.toBe(false);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
