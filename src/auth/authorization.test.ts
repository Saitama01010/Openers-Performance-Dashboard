import { describe, expect, it } from "vitest";

import {
  canAccessCoaching,
  canAccessCoachingLeaderboard,
  canAccessFlags,
  canCreateCoachingSession,
  canAccessProfile,
  canImportForProfile,
  resolveProfileScope,
  resolvePermission,
  type Actor,
} from "@/auth/authorization";

const admin: Actor = { id: "admin", role: "admin", teamIds: [] };
const manager: Actor = { id: "manager", role: "manager", teamIds: ["east"] };
const unassignedManager: Actor = { id: "manager", role: "manager", teamIds: [] };
const agent: Actor = { id: "agent-a", role: "agent", teamIds: ["east"] };

describe("authorization policy", () => {
  it("allows an admin to access all profiles", () => {
    expect(canAccessProfile(admin, { id: "other", teamIds: ["west"] })).toBe(true);
  });

  it("allows a manager to access only an overlapping team", () => {
    expect(canAccessProfile(manager, { id: "agent-a", teamIds: ["east"] })).toBe(true);
    expect(canAccessProfile(manager, { id: "agent-b", teamIds: ["west"] })).toBe(false);
    expect(canImportForProfile(manager, { id: "agent-a", teamIds: ["east"] })).toBe(false);
  });

  it("fails closed for a manager with no team", () => {
    expect(canAccessProfile(unassignedManager, { id: "agent-a", teamIds: ["east"] })).toBe(false);
    expect(resolveProfileScope(unassignedManager, ["agent-a"])).toEqual([]);
  });

  it("fails closed when an assigned team has no profiles", () => {
    expect(resolveProfileScope(manager, [])).toEqual([]);
  });

  it("allows an agent to access only self and never import", () => {
    expect(canAccessProfile(agent, { id: "agent-a", teamIds: ["east"] })).toBe(true);
    expect(canAccessProfile(agent, { id: "agent-b", teamIds: ["east"] })).toBe(false);
    expect(canImportForProfile(agent, { id: "agent-a", teamIds: ["east"] })).toBe(false);
  });

  it("applies explicit permission overrides before role defaults", () => {
    expect(resolvePermission(true, null)).toBe(true);
    expect(resolvePermission(true, false)).toBe(false);
    expect(resolvePermission(false, true)).toBe(true);
    expect(resolvePermission(false, null)).toBe(false);
  });

  it("enforces the final coaching and flags role matrix", () => {
    expect(canAccessCoaching("admin")).toBe(true);
    expect(canAccessCoaching("manager")).toBe(true);
    expect(canAccessCoaching("agent")).toBe(false);
    expect(canCreateCoachingSession("admin")).toBe(true);
    expect(canCreateCoachingSession("manager")).toBe(true);
    expect(canCreateCoachingSession("agent")).toBe(false);
    expect(canAccessCoachingLeaderboard("admin")).toBe(true);
    expect(canAccessCoachingLeaderboard("manager")).toBe(false);
    expect(canAccessFlags("admin")).toBe(true);
    expect(canAccessFlags("manager")).toBe(true);
    expect(canAccessFlags("agent")).toBe(true);
  });
});
