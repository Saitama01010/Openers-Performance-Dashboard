import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray, or } from "drizzle-orm";

import { permanentlyDeleteValidatedUsers } from "@/admin/data";
import {
  inspectLegacyDeletedProfiles,
  purgeLegacyDeletedProfiles,
} from "@/admin/legacy-user-purge";
import { getDb } from "@/db";
import { auditLogs, organizations, profiles } from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];

async function createOrganization() {
  const id = newId();
  organizationIds.push(id);
  await getDb().insert(organizations).values({ id, name: `Purge ${id}` });
  return id;
}

async function createProfile(input: {
  organizationId: string;
  role: "admin" | "manager" | "agent";
  status: "active" | "deleted";
  name: string;
}) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    organizationId: input.organizationId,
    email: `${id}@example.test`,
    name: input.name,
    role: input.role,
    active: input.status === "active",
    accountStatus: input.status,
    deletedAt: input.status === "deleted" ? new Date() : null,
    passwordHash: "test-hash",
  });
  return id;
}

afterEach(async () => {
  if (profileIds.length > 0) {
    await getDb().delete(auditLogs).where(or(
      inArray(auditLogs.actorProfileId, profileIds),
      inArray(auditLogs.entityId, profileIds),
    ));
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  }
  if (organizationIds.length > 0) {
    await getDb().delete(organizations)
      .where(inArray(organizations.id, organizationIds.splice(0)));
  }
});

describe("legacy deleted-profile purge", () => {
  it("dry run performs no writes and execution deletes only the approved target set", async () => {
    const organizationId = await createOrganization();
    const adminId = await createProfile({
      organizationId,
      role: "admin",
      status: "active",
      name: "Purge Admin",
    });
    const activeId = await createProfile({
      organizationId,
      role: "agent",
      status: "active",
      name: "Unaffected Active Agent",
    });
    const deletedId = await createProfile({
      organizationId,
      role: "agent",
      status: "deleted",
      name: "Legacy Deleted Agent",
    });

    const summary = await inspectLegacyDeletedProfiles({ organizationId });
    expect(summary.profileIds).toEqual([deletedId]);
    expect(await getDb().select({ id: profiles.id }).from(profiles)
      .where(inArray(profiles.id, [deletedId]))).toHaveLength(1);

    await purgeLegacyDeletedProfiles({
      actorId: adminId,
      organizationId,
      profileIds: summary.profileIds,
      approval: {
        confirmation: summary.confirmation,
        expectedCount: summary.expectedCount,
        expectedDigest: summary.digest,
        requiredAccountStatus: "deleted",
      },
    });

    expect(await getDb().select({ id: profiles.id }).from(profiles)
      .where(inArray(profiles.id, [deletedId]))).toHaveLength(0);
    expect(await getDb().select({ id: profiles.id }).from(profiles)
      .where(inArray(profiles.id, [activeId]))).toHaveLength(1);
  });

  it("invalidates approval when the target set changes", async () => {
    const organizationId = await createOrganization();
    const adminId = await createProfile({
      organizationId,
      role: "admin",
      status: "active",
      name: "Changed Target Admin",
    });
    await createProfile({
      organizationId,
      role: "agent",
      status: "deleted",
      name: "First Deleted Agent",
    });
    const summary = await inspectLegacyDeletedProfiles({ organizationId });
    await createProfile({
      organizationId,
      role: "agent",
      status: "deleted",
      name: "Second Deleted Agent",
    });

    await expect(purgeLegacyDeletedProfiles({
      actorId: adminId,
      organizationId,
      profileIds: summary.profileIds,
      approval: {
        confirmation: summary.confirmation,
        expectedCount: summary.expectedCount,
        expectedDigest: summary.digest,
        requiredAccountStatus: "deleted",
      },
    })).rejects.toThrow("target set changed");
  });

  it("rejects non-admin and cross-organization execution", async () => {
    const organizationId = await createOrganization();
    const foreignOrganizationId = await createOrganization();
    const adminId = await createProfile({
      organizationId,
      role: "admin",
      status: "active",
      name: "Cross Organization Admin",
    });
    const managerId = await createProfile({
      organizationId,
      role: "manager",
      status: "active",
      name: "Not An Admin",
    });
    const deletedId = await createProfile({
      organizationId,
      role: "agent",
      status: "deleted",
      name: "Protected Deleted Agent",
    });
    const foreignDeletedId = await createProfile({
      organizationId: foreignOrganizationId,
      role: "agent",
      status: "deleted",
      name: "Foreign Deleted Agent",
    });
    const summary = await inspectLegacyDeletedProfiles({ organizationId });

    await expect(purgeLegacyDeletedProfiles({
      actorId: managerId,
      organizationId,
      profileIds: summary.profileIds,
      approval: {
        confirmation: summary.confirmation,
        expectedCount: summary.expectedCount,
        expectedDigest: summary.digest,
        requiredAccountStatus: "deleted",
      },
    })).rejects.toThrow("active administrator");

    await expect(permanentlyDeleteValidatedUsers({
      id: adminId,
      role: "admin",
      teamIds: [],
      organizationId,
    }, { userIds: [foreignDeletedId] })).rejects.toThrow(
      "selected users were not found",
    );
    expect(await getDb().select({ id: profiles.id }).from(profiles)
      .where(inArray(profiles.id, [deletedId, foreignDeletedId]))).toHaveLength(2);
  });
});
