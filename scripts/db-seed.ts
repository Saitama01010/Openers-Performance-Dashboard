import "dotenv/config";
import { eq } from "drizzle-orm";

import { getDb, getPool } from "../src/db";
import {
  profiles,
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
    .values({ id, email, name, role, passwordHash })
    .onDuplicateKeyUpdate({
      set: { name, role, passwordHash, active: true },
    });
}

async function main() {
  await getDb()
    .insert(teams)
    .values({ id: ids.east, name: "East Openers" })
    .onDuplicateKeyUpdate({ set: { name: "East Openers" } });
  await getDb()
    .insert(teams)
    .values({ id: ids.west, name: "West Openers" })
    .onDuplicateKeyUpdate({ set: { name: "West Openers" } });

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

  await getDb()
    .insert(teamMemberships)
    .values([
      { teamId: ids.east, profileId: ids.managerEast, role: "manager" },
      { teamId: ids.east, profileId: ids.agentAva, role: "agent" },
      { teamId: ids.east, profileId: ids.agentNoah, role: "agent" },
      { teamId: ids.west, profileId: ids.managerWest, role: "manager" },
      { teamId: ids.west, profileId: ids.agentMia, role: "agent" },
    ])
    .onDuplicateKeyUpdate({ set: { role: "agent" } });

  await getDb()
    .update(teamMemberships)
    .set({ role: "manager" })
    .where(eq(teamMemberships.profileId, ids.managerEast));
  await getDb()
    .update(teamMemberships)
    .set({ role: "manager" })
    .where(eq(teamMemberships.profileId, ids.managerWest));

  await getDb()
    .insert(sourceUserMappings)
    .values([
      {
        id: "20000000-0000-4000-8000-000000000001",
        source: "dialer",
        sourceAgentName: "Ava Rivera",
        profileId: ids.agentAva,
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        source: "dialer",
        sourceAgentName: "Noah Chen",
        profileId: ids.agentNoah,
      },
      {
        id: "20000000-0000-4000-8000-000000000003",
        source: "dialer",
        sourceAgentName: "Mia Patel",
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
