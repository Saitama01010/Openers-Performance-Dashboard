import "@/test/integration-env";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

import {
  confirmUserImport,
  createUserImportPreview,
} from "@/admin/user-import-service";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
  userImportBatches,
} from "@/db/schema";
import { resetEnvForTests } from "@/env";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];
const batchIds: string[] = [];

function actor(id: string): Actor {
  return { id, role: "admin", teamIds: [] };
}

describe("user CSV import integration", () => {
  beforeEach(() => {
    process.env.TEMP_PASSWORD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    resetEnvForTests();
  });

  afterEach(async () => {
    const profilesToDelete = profileIds.splice(0);
    const teamsToDelete = teamIds.splice(0);
    const batchesToDelete = batchIds.splice(0);

    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(accountInvitationTokens)
        .where(inArray(accountInvitationTokens.profileId, profilesToDelete));
      await getDb()
        .delete(sourceUserMappings)
        .where(inArray(sourceUserMappings.profileId, profilesToDelete));
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, profilesToDelete));
    }
    if (profilesToDelete.length > 0 || batchesToDelete.length > 0) {
      await getDb()
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.actorProfileId, profilesToDelete),
            inArray(auditLogs.entityId, [
              ...profilesToDelete,
              ...batchesToDelete,
            ]),
          ),
        );
    }
    if (batchesToDelete.length > 0) {
      await getDb()
        .delete(userImportBatches)
        .where(inArray(userImportBatches.id, batchesToDelete));
    }
    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(profiles)
        .where(inArray(profiles.id, profilesToDelete));
    }
    if (teamsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamsToDelete));
    }
  });

  it("imports the mapped profile fields after role and team assignment without inviting", async () => {
    const suffix = newId();
    const adminId = newId();
    const teamId = newId();
    profileIds.push(adminId);
    teamIds.push(teamId);

    await getDb().insert(profiles).values({
      id: adminId,
      email: `import-admin-${suffix}@example.test`,
      name: "Import Admin",
      role: "admin",
      active: true,
      accountStatus: "active",
      passwordHash: "test-hash",
    });
    await getDb().insert(teams).values({
      id: teamId,
      name: `Import Team ${suffix}`,
      active: true,
    });

    const email = `imported-${suffix}@example.test`;
    const americanName = `Imported Dialer ${suffix}`;
    const draft = await createUserImportPreview({
      actor: actor(adminId),
      fileName: "users.csv",
      content: [
        "Real Name,American Name,Shift,Email",
        `Imported User,${americanName},Night Shift,${email}`,
      ].join("\n"),
    });

    expect(draft.preview.fatalErrors).toEqual([]);
    expect(draft.batchId).toBeTruthy();
    batchIds.push(draft.batchId!);

    const result = await confirmUserImport({
      actor: actor(adminId),
      batchId: draft.batchId!,
      assignments: [
        {
          rowNumber: 2,
          selected: true,
          role: "agent",
          teamId,
        },
      ],
    });

    expect(result.summary).toEqual({ created: 1, skipped: 0, failed: 0 });
    const createdId = result.outcomes[0].userId!;
    profileIds.push(createdId);

    const [created] = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.id, createdId));
    expect(created).toMatchObject({
      name: "Imported User",
      shift: "Night Shift",
      email,
      role: "agent",
      accountStatus: "active",
    });

    const [mapping] = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, createdId));
    expect(mapping.sourceAgentName).toBe(americanName);

    const [membership] = await getDb()
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.profileId, createdId));
    expect(membership).toMatchObject({ teamId, role: "agent", active: true });

    const invitations = await getDb()
      .select()
      .from(accountInvitationTokens)
      .where(eq(accountInvitationTokens.profileId, createdId));
    expect(invitations).toEqual([]);
  });
});
