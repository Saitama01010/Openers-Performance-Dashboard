import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, getPool } from "../src/db";
import {
  permissions,
  profiles,
  rolePermissions,
  roles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "../src/db/schema";
import { hashPassword } from "../src/auth/password";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  managerEast: "00000000-0000-4000-8000-000000000002",
  managerWest: "00000000-0000-4000-8000-000000000003",
  agentAva: "00000000-0000-4000-8000-000000000004",
  agentNoah: "00000000-0000-4000-8000-000000000005",
  agentMia: "00000000-0000-4000-8000-000000000006",
  east: "10000000-0000-4000-8000-000000000001",
  west: "10000000-0000-4000-8000-000000000002",
};

async function upsertProfile(
  id: string,
  email: string,
  name: string,
  role: "admin" | "manager" | "agent",
) {
  const passwordHash = await hashPassword("Password123!");
  await getDb()
    .insert(profiles)
    .values({
      id,
      email,
      name,
      role,
      passwordHash,
      accountStatus: "active",
    })
    .onDuplicateKeyUpdate({
      set: {
        name,
        role,
        passwordHash,
        active: true,
        accountStatus: "active",
        accessRevokedAt: null,
      },
    });
}

async function upsertMembership(input: {
  id: string;
  teamId: string;
  profileId: string;
  role: "manager" | "agent";
}) {
  const existing = await getDb()
    .select({ id: teamMemberships.id })
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.teamId, input.teamId),
        eq(teamMemberships.profileId, input.profileId),
        isNull(teamMemberships.endedAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await getDb()
      .update(teamMemberships)
      .set({ role: input.role })
      .where(eq(teamMemberships.id, existing[0].id));
    return;
  }

  await getDb().insert(teamMemberships).values(input);
}

async function main() {
  await getDb()
    .insert(roles)
    .values([
      { id: "admin", name: "Administrator", description: "Company-wide administration" },
      { id: "manager", name: "Manager", description: "Assigned-team operations" },
      { id: "agent", name: "Agent", description: "Personal performance access" },
    ])
    .onDuplicateKeyUpdate({ set: { name: sql`values(name)` } });

  const permissionRows = [
    { key: "users.manage", description: "Manage user accounts and access" },
    { key: "teams.manage", description: "Manage teams and memberships" },
    { key: "imports.company", description: "Import company-wide dialer data" },
    { key: "imports.team", description: "Import dialer data for assigned teams" },
    { key: "metrics.company", description: "View company private metrics" },
    { key: "metrics.team", description: "View assigned-team private metrics" },
    { key: "metrics.self", description: "View personal private metrics" },
    { key: "leaderboards.view", description: "View authenticated safe leaderboards" },
  ];
  await getDb()
    .insert(permissions)
    .values(permissionRows)
    .onDuplicateKeyUpdate({ set: { description: sql`values(description)` } });
  await getDb()
    .insert(rolePermissions)
    .values([
      ...permissionRows.map((permission) => ({ roleId: "admin", permissionKey: permission.key })),
      { roleId: "manager", permissionKey: "imports.team" },
      { roleId: "manager", permissionKey: "metrics.team" },
      { roleId: "manager", permissionKey: "leaderboards.view" },
      { roleId: "agent", permissionKey: "metrics.self" },
      { roleId: "agent", permissionKey: "leaderboards.view" },
    ])
    .onDuplicateKeyUpdate({ set: { permissionKey: sql`values(permission_key)` } });

  await getDb()
    .insert(teams)
    .values({ id: ids.east, name: "East Openers" })
    .onDuplicateKeyUpdate({ set: { name: "East Openers", active: true } });
  await getDb()
    .insert(teams)
    .values({ id: ids.west, name: "West Openers" })
    .onDuplicateKeyUpdate({ set: { name: "West Openers", active: true } });

  await upsertProfile(ids.admin, "admin@example.com", "Priya Admin", "admin");
  await upsertProfile(
    ids.managerEast,
    "morgan.manager@example.com",
    "Morgan East",
    "manager",
  );
  await upsertProfile(
    ids.managerWest,
    "casey.manager@example.com",
    "Casey West",
    "manager",
  );
  await upsertProfile(ids.agentAva, "ava.agent@example.com", "Ava Rivera", "agent");
  await upsertProfile(ids.agentNoah, "noah.agent@example.com", "Noah Chen", "agent");
  await upsertProfile(ids.agentMia, "mia.agent@example.com", "Mia Patel", "agent");

  await upsertMembership({ id: "30000000-0000-4000-8000-000000000001", teamId: ids.east, profileId: ids.managerEast, role: "manager" });
  await upsertMembership({ id: "30000000-0000-4000-8000-000000000002", teamId: ids.east, profileId: ids.agentAva, role: "agent" });
  await upsertMembership({ id: "30000000-0000-4000-8000-000000000003", teamId: ids.east, profileId: ids.agentNoah, role: "agent" });
  await upsertMembership({ id: "30000000-0000-4000-8000-000000000004", teamId: ids.west, profileId: ids.managerWest, role: "manager" });
  await upsertMembership({ id: "30000000-0000-4000-8000-000000000005", teamId: ids.west, profileId: ids.agentMia, role: "agent" });

  await getDb()
    .insert(sourceUserMappings)
    .values([
      {
        id: "20000000-0000-4000-8000-000000000001",
        source: "dialer",
        sourceAgentName: "Ava Rivera",
        normalizedAgentName: "ava rivera",
        profileId: ids.agentAva,
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        source: "dialer",
        sourceAgentName: "Noah Chen",
        normalizedAgentName: "noah chen",
        profileId: ids.agentNoah,
      },
      {
        id: "20000000-0000-4000-8000-000000000003",
        source: "dialer",
        sourceAgentName: "Mia Patel",
        normalizedAgentName: "mia patel",
        profileId: ids.agentMia,
      },
    ])
    .onDuplicateKeyUpdate({ set: { active: true } });

  await getPool().end();
  console.log("Seed complete. Password for all users: Password123!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
