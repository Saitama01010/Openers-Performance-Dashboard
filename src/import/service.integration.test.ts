import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

import { editDialerMapping } from "@/admin/data";
import { activeMappingKey, primaryMappingKey } from "@/admin/policy";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerImportBatches,
  importErrors,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import {
  createDialerPreviewBatch,
  getStoredImportPreview,
} from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];
const batchIds: string[] = [];

const header =
  "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls";

function csvFor(agentName: string) {
  return `${header}\n${agentName},2026-07-20,0,3600,600,1200,60,60,300,300,0,5\n`;
}

async function importErrorCount(batchId: string) {
  const rows = await getDb()
    .select({ id: importErrors.id })
    .from(importErrors)
    .where(eq(importErrors.batchId, batchId));

  return rows.length;
}

async function createTeam(name: string) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({ id, name, active: true });
  return id;
}

async function createMappedAgent(input: {
  teamId: string;
  accountStatus: "invited" | "active" | "deactivated" | "revoked";
  dialerName: string;
}) {
  const id = newId();
  const normalized = input.dialerName.trim().replace(/\s+/g, " ").toLowerCase();
  profileIds.push(id);

  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Import Agent ${id.slice(0, 8)}`,
    role: "agent",
    active: input.accountStatus === "invited" || input.accountStatus === "active",
    accountStatus: input.accountStatus,
  });
  await getDb().insert(teamMemberships).values({
    id: newId(),
    teamId: input.teamId,
    profileId: id,
    role: "agent",
    active: true,
  });
  await getDb().insert(sourceUserMappings).values({
    id: newId(),
    source: "dialer",
    sourceAgentName: input.dialerName.trim().replace(/\s+/g, " "),
    normalizedAgentName: normalized,
    activeMappingKey: activeMappingKey("dialer", normalized),
    primaryMappingKey: primaryMappingKey("dialer", id),
    profileId: id,
    active: true,
    isPrimary: true,
  });

  return id;
}

async function createAdminActor(): Promise<Actor> {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Import Admin ${id.slice(0, 8)}`,
    role: "admin",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return { id, role: "admin", teamIds: [] };
}

describe("dialer import service integration", () => {
  afterEach(async () => {
    const batches = batchIds.splice(0);
    const profilesToDelete = profileIds.splice(0);
    const teamsToDelete = teamIds.splice(0);

    if (batches.length > 0) {
      await getDb().delete(importErrors).where(inArray(importErrors.batchId, batches));
      await getDb()
        .delete(dialerImportBatches)
        .where(inArray(dialerImportBatches.id, batches));
    }

    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.actorProfileId, profilesToDelete),
            inArray(auditLogs.entityId, profilesToDelete),
          ),
        );
      await getDb()
        .delete(sourceUserMappings)
        .where(inArray(sourceUserMappings.profileId, profilesToDelete));
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, profilesToDelete));
      await getDb().delete(profiles).where(inArray(profiles.id, profilesToDelete));
    }

    if (teamsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamsToDelete));
    }
  });

  it("recognizes invited mapped agents as mapped new rows", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Invited Import Team");
    await createMappedAgent({
      teamId,
      accountStatus: "invited",
      dialerName: "Invited Agent",
    });

    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "invited.csv",
      fileContent: csvFor("invited   agent"),
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.uniqueMappedAgents).toBe(1);
    expect(preview.fileSummary.unknownRows).toBe(0);
    expect(preview.fileSummary.newRows).toBe(1);
    expect(preview.agents[0]?.mappingStatus).toBe("mapped");
    expect(preview.agents[0]?.calls).toBe(5);
  });

  it("recalculates pending previews after a mapping edit", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Edit Import Team");
    const profileId = await createMappedAgent({
      teamId,
      accountStatus: "active",
      dialerName: "Old Dialer",
    });
    const [mapping] = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, profileId))
      .limit(1);
    const { batchId } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "old.csv",
      fileContent: csvFor("Old Dialer"),
    });
    batchIds.push(batchId);

    await editDialerMapping(actor, {
      mappingId: mapping.id,
      sourceAgentName: "Corrected Dialer",
    });

    const recalculatedOld = await getStoredImportPreview({ actor, batchId });
    expect(recalculatedOld?.preview.fileSummary.uniqueMappedAgents).toBe(0);
    expect(recalculatedOld?.preview.fileSummary.unknownRows).toBe(1);

    const corrected = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "corrected.csv",
      fileContent: csvFor("Corrected Dialer"),
    });
    batchIds.push(corrected.batchId);

    expect(corrected.preview.fileSummary.uniqueMappedAgents).toBe(1);
    expect(corrected.preview.fileSummary.newRows).toBe(1);
  });

  it("shows inactive mapped accounts as mapped with a warning", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Inactive Import Team");
    await createMappedAgent({
      teamId,
      accountStatus: "deactivated",
      dialerName: "Inactive Agent",
    });

    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "inactive.csv",
      fileContent: csvFor("Inactive Agent"),
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.uniqueMappedAgents).toBe(1);
    expect(preview.fileSummary.unknownRows).toBe(0);
    expect(preview.rows[0]?.warningMessage).toContain("deactivated");
  });

  it("replaces stale preview errors when mappings are resolved", async () => {
    const actor = await createAdminActor();
    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "mapped-later.csv",
      fileContent: csvFor("Mapped Later"),
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.unknownRows).toBe(1);
    expect(await importErrorCount(batchId)).toBe(1);

    await getStoredImportPreview({ actor, batchId });
    await getStoredImportPreview({ actor, batchId });
    expect(await importErrorCount(batchId)).toBe(1);

    const teamId = await createTeam("Mapped Later Team");
    await createMappedAgent({
      teamId,
      accountStatus: "invited",
      dialerName: "Mapped Later",
    });

    const refreshed = await getStoredImportPreview({ actor, batchId });

    expect(refreshed?.preview.fileSummary.uniqueMappedAgents).toBe(1);
    expect(refreshed?.preview.fileSummary.unknownRows).toBe(0);
    expect(refreshed?.preview.fileSummary.newRows).toBe(1);
    expect(await importErrorCount(batchId)).toBe(0);
  });

  it("removes stale invalid preview errors after a successful re-preview", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Stale Invalid Team");
    await createMappedAgent({
      teamId,
      accountStatus: "active",
      dialerName: "Stale Invalid",
    });
    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "stale-invalid.csv",
      fileContent: csvFor("Stale Invalid"),
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.invalidRows).toBe(0);
    await getDb().insert(importErrors).values({
      id: newId(),
      batchId,
      rowNumber: 2,
      status: "invalid",
      message: "Stale parser error.",
      rawRow: { agent: "Stale Invalid" },
    });
    expect(await importErrorCount(batchId)).toBe(1);

    const refreshed = await getStoredImportPreview({ actor, batchId });

    expect(refreshed?.preview.fileSummary.invalidRows).toBe(0);
    expect(await importErrorCount(batchId)).toBe(0);
  });
});
