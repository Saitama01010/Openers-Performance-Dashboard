import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray, or } from "drizzle-orm";

import {
  addDialerMapping,
  editDialerMapping,
  setUserAccountStatus,
  updateAdminUser,
} from "@/admin/data";
import { getDb } from "@/db";
import {
  auditLogs,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Actor } from "@/auth/authorization";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];

async function createProfile(role: "admin" | "manager" | "agent") {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Admin Data ${id.slice(0, 8)}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return id;
}

async function createTeam() {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({
    id,
    name: `Team ${id.slice(0, 8)}`,
    active: true,
  });
  return id;
}

function actor(id: string): Actor {
  return { id, role: "admin", teamIds: [] };
}

function baseUpdate(userId: string, role: "admin" | "manager" | "agent", teamId?: string) {
  return {
    userId,
    name: `Updated ${userId.slice(0, 8)}`,
    email: `${userId}@updated.example.test`,
    role,
    teamId,
    permissionOverrides: [],
  };
}

describe("admin data management integration", () => {
  afterEach(async () => {
    const ids = profileIds.splice(0);
    const teamsToDelete = teamIds.splice(0);

    if (ids.length > 0) {
      await getDb()
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.actorProfileId, ids),
            inArray(auditLogs.entityId, ids),
          ),
        );
      await getDb()
        .delete(sourceUserMappings)
        .where(inArray(sourceUserMappings.profileId, ids));
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, ids));
      await getDb().delete(profiles).where(inArray(profiles.id, ids));
    }

    if (teamsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamsToDelete));
    }
  });

  it("allows changing or removing another admin when one active admin remains", async () => {
    const adminA = await createProfile("admin");
    const adminB = await createProfile("admin");
    const teamId = await createTeam();

    await updateAdminUser(actor(adminA), baseUpdate(adminB, "manager", teamId));

    let [changed] = await getDb()
      .select()
      .from(profiles)
      .where(inArray(profiles.id, [adminB]));
    expect(changed?.role).toBe("manager");

    await updateAdminUser(actor(adminA), baseUpdate(adminB, "admin"));
    await setUserAccountStatus(actor(adminA), {
      userId: adminB,
      status: "deactivated",
    });

    [changed] = await getDb()
      .select()
      .from(profiles)
      .where(inArray(profiles.id, [adminB]));
    expect(changed?.accountStatus).toBe("deactivated");
  });

  it("blocks final admin changes and self-demotion", async () => {
    const adminA = await createProfile("admin");
    const adminB = await createProfile("admin");
    const teamId = await createTeam();

    await expect(
      updateAdminUser(actor(adminA), baseUpdate(adminA, "manager", teamId)),
    ).rejects.toThrow("You cannot demote your own admin role.");

    await setUserAccountStatus(actor(adminA), {
      userId: adminB,
      status: "deactivated",
    });

    await expect(
      updateAdminUser(actor(adminA), baseUpdate(adminA, "manager", teamId)),
    ).rejects.toThrow("You cannot demote your own admin role.");
  });

  it("requires team and dialer identity before changing a user to agent", async () => {
    const adminA = await createProfile("admin");
    const adminB = await createProfile("admin");
    const teamId = await createTeam();

    await expect(
      updateAdminUser(actor(adminA), baseUpdate(adminB, "manager")),
    ).rejects.toThrow("Select a team before changing this user to manager.");
    await expect(
      updateAdminUser(actor(adminA), baseUpdate(adminB, "agent", teamId)),
    ).rejects.toThrow("Assign a dialer name before changing this user to agent.");

    await addDialerMapping(actor(adminA), {
      userId: adminB,
      sourceAgentName: "Agent Admin",
      makePrimary: true,
    });
    await updateAdminUser(actor(adminA), baseUpdate(adminB, "agent", teamId));

    const [changed] = await getDb()
      .select()
      .from(profiles)
      .where(inArray(profiles.id, [adminB]));
    expect(changed?.role).toBe("agent");
  });

  it("edits active dialer mappings by preserving history and uniqueness", async () => {
    const adminA = await createProfile("admin");
    const agentA = await createProfile("agent");
    const agentB = await createProfile("agent");

    await addDialerMapping(actor(adminA), {
      userId: agentA,
      sourceAgentName: "John Williams",
      makePrimary: true,
    });
    await addDialerMapping(actor(adminA), {
      userId: agentB,
      sourceAgentName: "Jane Williams",
      makePrimary: true,
    });

    const mappingsBefore = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(inArray(sourceUserMappings.profileId, [agentA]));
    const activeBefore = mappingsBefore.find((mapping) => mapping.active);

    expect(activeBefore).toBeDefined();

    await expect(
      editDialerMapping(actor(adminA), {
        mappingId: activeBefore!.id,
        sourceAgentName: " jane   williams ",
      }),
    ).rejects.toThrow("This active dialer identity is already mapped.");

    await editDialerMapping(actor(adminA), {
      mappingId: activeBefore!.id,
      sourceAgentName: " johnny   williams ",
    });

    const mappingsAfter = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(inArray(sourceUserMappings.profileId, [agentA]));
    const activeAfter = mappingsAfter.find((mapping) => mapping.active);
    const oldAfter = mappingsAfter.find((mapping) => mapping.id === activeBefore!.id);

    expect(oldAfter?.active).toBe(false);
    expect(activeAfter?.sourceAgentName).toBe("johnny williams");
    expect(activeAfter?.normalizedAgentName).toBe("johnny williams");
    expect(activeAfter?.isPrimary).toBe(true);
    expect(mappingsAfter).toHaveLength(2);
  });
});
