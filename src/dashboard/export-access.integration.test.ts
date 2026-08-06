import "@/test/integration-env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("server-only", () => ({}));

import type { Actor } from "@/auth/authorization";
import { getDb, getPool } from "@/db";
import { organizations, profiles, teamMemberships, teams } from "@/db/schema";
import { authorizeDashboardExport } from "@/dashboard/export-access";

const suffix = randomUUID().slice(0, 8);
const ids = {
  organization: `export-org-${suffix}`,
  otherOrganization: `export-other-org-${suffix}`,
  team: `export-team-${suffix}`,
  otherTeam: `export-other-team-${suffix}`,
  admin: `export-admin-${suffix}`,
  manager: `export-manager-${suffix}`,
  agent: `export-agent-${suffix}`,
};

function actor(id: string, role: Actor["role"], teamIds: string[]): Actor {
  return { id, role, teamIds, organizationId: ids.organization };
}

describe("dashboard export authorization", () => {
  beforeAll(async () => {
    await getDb().insert(organizations).values([
      { id: ids.organization, name: `Export ${suffix}` },
      { id: ids.otherOrganization, name: `Other export ${suffix}` },
    ]);
    await getDb().insert(teams).values([
      { id: ids.team, organizationId: ids.organization, name: `Export team ${suffix}` },
      { id: ids.otherTeam, organizationId: ids.otherOrganization, name: `Other export team ${suffix}` },
    ]);
    await getDb().insert(profiles).values([
      { id: ids.admin, organizationId: ids.organization, name: "Export Admin", email: `${ids.admin}@example.com`, role: "admin", accountStatus: "active" },
      { id: ids.manager, organizationId: ids.organization, name: "Export Manager", email: `${ids.manager}@example.com`, role: "manager", accountStatus: "active" },
      { id: ids.agent, organizationId: ids.organization, name: "Export Agent", email: `${ids.agent}@example.com`, role: "agent", accountStatus: "active" },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: randomUUID(), teamId: ids.team, profileId: ids.manager, role: "manager" },
      { id: randomUUID(), teamId: ids.team, profileId: ids.agent, role: "agent" },
    ]);
  });

  afterAll(async () => {
    await getDb().delete(teamMemberships).where(inArray(teamMemberships.profileId, [ids.manager, ids.agent]));
    await getDb().delete(profiles).where(inArray(profiles.id, [ids.admin, ids.manager, ids.agent]));
    await getDb().delete(teams).where(inArray(teams.id, [ids.team, ids.otherTeam]));
    await getDb().delete(organizations).where(inArray(organizations.id, [ids.organization, ids.otherOrganization]));
    await getPool().end();
  });

  it("forbids agents and rejects forged team filters across role and organization boundaries", async () => {
    await expect(authorizeDashboardExport(actor(ids.agent, "agent", [ids.team])))
      .rejects.toThrow("Forbidden");
    await expect(authorizeDashboardExport(actor(ids.manager, "manager", [ids.team]), ids.otherTeam))
      .rejects.toThrow("Forbidden");
    await expect(authorizeDashboardExport(actor(ids.admin, "admin", []), ids.otherTeam))
      .rejects.toThrow("Forbidden");
    await expect(authorizeDashboardExport(actor(ids.manager, "manager", [ids.team]), ids.team))
      .resolves.toMatchObject({ id: ids.manager, teamIds: [ids.team] });
  });

  it("rejects a stale manager team id after the current membership ends", async () => {
    await getDb().update(teamMemberships).set({ active: false, endedAt: new Date() }).where(
      and(eq(teamMemberships.profileId, ids.manager), eq(teamMemberships.teamId, ids.team)),
    );

    await expect(authorizeDashboardExport(actor(ids.manager, "manager", [ids.team]), ids.team))
      .rejects.toThrow("Forbidden");
  });
});
