import "dotenv/config";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import {
  assignTeamManager,
  moveTeamMember,
  removeTeamMembership,
  renameTeam,
  setTeamStatus,
} from "@/admin/data";
import {
  getAdminTeamStats,
  listAdminTeamsDirectory,
  resolveAdminTeamDirectoryFilters,
} from "@/admin/teams";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import { auditLogs, organizations, profiles, teamMemberships, teams } from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

let organizationId: string;
let admin: Actor;
const profileIds: string[] = [];
const teamIds: string[] = [];

async function addProfile(role: "admin" | "manager" | "agent", name: string) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    organizationId,
    email: `${id}@example.test`,
    name,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return id;
}

async function addTeam(name: string, active = true) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({ id, organizationId, name, active });
  return id;
}

async function addMembership(profileId: string, teamId: string, role: "manager" | "agent") {
  const id = newId();
  await getDb().insert(teamMemberships).values({
    id,
    profileId,
    teamId,
    role,
    active: true,
    createdById: admin.id,
  });
  return id;
}

beforeEach(async () => {
  organizationId = newId();
  await getDb().insert(organizations).values({ id: organizationId, name: `Teams ${organizationId}` });
  const adminId = await addProfile("admin", "Teams Admin");
  admin = { id: adminId, role: "admin", teamIds: [], organizationId };
});

afterEach(async () => {
  if (profileIds.length) {
    await getDb().delete(auditLogs).where(inArray(auditLogs.actorProfileId, profileIds));
  }
  if (teamIds.length) {
    await getDb().delete(teamMemberships).where(inArray(teamMemberships.teamId, teamIds));
    await getDb().delete(teams).where(inArray(teams.id, teamIds));
  }
  if (profileIds.length) {
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds));
  }
  await getDb().delete(organizations).where(eq(organizations.id, organizationId));
  profileIds.splice(0);
  teamIds.splice(0);
});

describe("teams administration", () => {
  it("lists active and inactive teams with current authorized membership counts", async () => {
    const activeTeam = await addTeam("East Openers");
    const inactiveTeam = await addTeam("Legacy Openers", false);
    const managerId = await addProfile("manager", "Casey West");
    const agentId = await addProfile("agent", "Mia Ford");
    await addMembership(managerId, activeTeam, "manager");
    await addMembership(agentId, activeTeam, "agent");

    const directory = await listAdminTeamsDirectory(
      admin,
      resolveAdminTeamDirectoryFilters({ sort: "members", direction: "desc" }),
    );
    const stats = await getAdminTeamStats(admin);

    expect(directory.rows.map((row) => row.id)).toEqual([activeTeam, inactiveTeam]);
    expect(directory.rows[0]).toMatchObject({ memberCount: 2, agentCount: 1, activeAgentCount: 1, managerCount: 1 });
    expect(directory.rows[0]?.managers).toEqual([expect.objectContaining({ id: managerId, name: "Casey West" })]);
    expect(stats).toMatchObject({ totalTeams: 2, activeTeams: 1, inactiveTeams: 1, totalMembers: 2, activeAgents: 1, teamManagers: 1 });

    const filtered = await listAdminTeamsDirectory(
      admin,
      resolveAdminTeamDirectoryFilters({ status: "inactive", q: "legacy" }),
    );
    expect(filtered.rows.map((row) => row.id)).toEqual([inactiveTeam]);
    await expect(listAdminTeamsDirectory({ ...admin, role: "manager" }, resolveAdminTeamDirectoryFilters({}))).rejects.toThrow("Forbidden");
  });

  it("preserves membership history while moving members, replacing managers, and deactivating an empty team", async () => {
    const sourceTeam = await addTeam("Source Openers");
    const destinationTeam = await addTeam("Destination Openers");
    const sourceManager = await addProfile("manager", "Source Manager");
    const destinationManager = await addProfile("manager", "Destination Manager");
    const agentId = await addProfile("agent", "Moving Agent");
    const sourceManagerMembership = await addMembership(sourceManager, sourceTeam, "manager");
    const destinationManagerMembership = await addMembership(destinationManager, destinationTeam, "manager");
    const sourceAgentMembership = await addMembership(agentId, sourceTeam, "agent");

    await expect(setTeamStatus(admin, { teamId: sourceTeam, active: false })).rejects.toThrow(
      "Move or remove 1 manager(s) and 1 agent(s) before deactivating this team.",
    );

    await moveTeamMember(admin, { userId: agentId, teamId: destinationTeam });
    await assignTeamManager(admin, { teamId: destinationTeam, managerId: sourceManager });
    await setTeamStatus(admin, { teamId: sourceTeam, active: false });

    const memberships = await getDb()
      .select()
      .from(teamMemberships)
      .where(inArray(teamMemberships.profileId, [agentId, sourceManager, destinationManager]));
    expect(memberships.find((row) => row.id === sourceAgentMembership)).toMatchObject({ active: false });
    expect(memberships.find((row) => row.id === sourceManagerMembership)).toMatchObject({ active: false });
    expect(memberships.find((row) => row.id === destinationManagerMembership)).toMatchObject({ active: false });
    expect(memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: agentId, teamId: destinationTeam, active: true, role: "agent" }),
      expect.objectContaining({ profileId: sourceManager, teamId: destinationTeam, active: true, role: "manager" }),
    ]));
    const [source] = await getDb().select().from(teams).where(eq(teams.id, sourceTeam));
    expect(source).toMatchObject({ active: false });
    expect(source?.deactivatedAt).toBeInstanceOf(Date);
  });

  it("normalizes duplicate names and records lifecycle audits", async () => {
    const first = await addTeam("Alpha Team");
    const second = await addTeam("Beta Team");

    await expect(renameTeam(admin, { teamId: second, name: "  ALPHA   TEAM " })).rejects.toThrow("A team with this name already exists.");
    await renameTeam(admin, { teamId: second, name: "Gamma Team" });
    await setTeamStatus(admin, { teamId: first, active: false });
    await setTeamStatus(admin, { teamId: first, active: true });

    const events = await getDb().select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.actorProfileId, admin.id), inArray(auditLogs.entityId, [first, second])));
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["team.renamed", "team.deactivated", "team.activated"]));
  });

  it("removes current memberships without deleting historical rows", async () => {
    const teamId = await addTeam("Removal Team");
    const agentId = await addProfile("agent", "Removal Agent");
    const membershipId = await addMembership(agentId, teamId, "agent");

    await removeTeamMembership(admin, membershipId);

    const [membership] = await getDb().select().from(teamMemberships).where(eq(teamMemberships.id, membershipId));
    expect(membership).toMatchObject({ id: membershipId, active: false });
    expect(membership?.endedAt).toBeInstanceOf(Date);
  });
});
