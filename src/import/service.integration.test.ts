import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

import { editDialerMapping } from "@/admin/data";
import { activeMappingKey, primaryMappingKey } from "@/admin/policy";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  importErrors,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import {
  getImportConfirmationBlockReason,
} from "@/import/dialer";
import {
  confirmDialerImportBatch,
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

function csvFromRows(rows: string[]) {
  return `${header}\n${rows.join("\n")}\n`;
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

async function createManagerActor(teamIds: string[]): Promise<Actor> {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Import Manager ${id.slice(0, 8)}`,
    role: "manager",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return { id, role: "manager", teamIds };
}

describe("dialer import service integration", () => {
  afterEach(async () => {
    const batches = batchIds.splice(0);
    const profilesToDelete = profileIds.splice(0);
    const teamsToDelete = teamIds.splice(0);

    if (batches.length > 0) {
      await getDb()
        .delete(dialerAgentHourlyMetrics)
        .where(inArray(dialerAgentHourlyMetrics.batchId, batches));
    }

    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(dialerAgentHourlyMetrics)
        .where(inArray(dialerAgentHourlyMetrics.agentProfileId, profilesToDelete));
    }

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

  it("partially confirms mapped rows and later imports newly mapped rows without duplicates", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Partial Import Team");
    const alphaProfileId = await createMappedAgent({
      teamId,
      accountStatus: "active",
      dialerName: "Partial Alpha",
    });
    const fileContent = csvFromRows([
      "Partial Alpha,2026-07-20,0,3600,600,1200,60,60,300,300,0,5",
      "Partial Alpha,2026-07-20,1,3600,600,1200,60,60,300,300,0,7",
      "Partial Beta,2026-07-20,0,3600,600,1200,60,60,300,300,0,11",
    ]);
    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "partial.csv",
      fileContent,
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.mappedRowsToImport).toBe(2);
    expect(preview.fileSummary.unmappedRowsToSkip).toBe(1);
    expect(getImportConfirmationBlockReason(preview)).toBeNull();
    await expect(
      confirmDialerImportBatch({ actor, batchId }),
    ).rejects.toThrow("Skipped rows acknowledgement is required");

    await confirmDialerImportBatch({
      actor,
      batchId,
      allowPartialImport: true,
    });

    const [partialBatch] = await getDb()
      .select({
        status: dialerImportBatches.status,
        confirmedById: dialerImportBatches.confirmedById,
        previewSummary: dialerImportBatches.previewSummary,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batchId));
    const firstMetrics = await getDb()
      .select({
        agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
        metricDate: dialerAgentHourlyMetrics.metricDate,
        metricHour: dialerAgentHourlyMetrics.metricHour,
      })
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.batchId, batchId));

    expect(partialBatch.status).toBe("partially_confirmed");
    expect(partialBatch.confirmedById).toBe(actor.id);
    expect(partialBatch.previewSummary).toMatchObject({
      importedNewRows: 2,
      updatedRows: 0,
      skippedUnmappedRows: 1,
      unresolvedAgentCount: 1,
    });
    expect(firstMetrics).toHaveLength(2);
    expect(firstMetrics.every((row) => row.agentProfileId === alphaProfileId)).toBe(
      true,
    );
    expect(await importErrorCount(batchId)).toBe(1);

    const betaProfileId = await createMappedAgent({
      teamId,
      accountStatus: "active",
      dialerName: "Partial Beta",
    });
    const refreshed = await getStoredImportPreview({ actor, batchId });

    expect(refreshed?.preview.fileSummary.unmappedRowsToSkip).toBe(0);
    expect(refreshed?.preview.summary.unchanged).toBe(2);
    expect(refreshed?.preview.summary.new).toBe(1);
    expect(refreshed?.preview.fileSummary.mappedRowsToImport).toBe(1);
    expect(await importErrorCount(batchId)).toBe(0);

    await confirmDialerImportBatch({ actor, batchId });

    const [confirmedBatch] = await getDb()
      .select({
        status: dialerImportBatches.status,
        previewSummary: dialerImportBatches.previewSummary,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batchId));
    const finalMetrics = await getDb()
      .select({
        agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
        metricDate: dialerAgentHourlyMetrics.metricDate,
        metricHour: dialerAgentHourlyMetrics.metricHour,
      })
      .from(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.agentProfileId, [
        alphaProfileId,
        betaProfileId,
      ]));
    const metricKeys = new Set(
      finalMetrics.map(
        (row) => `${row.agentProfileId}:${row.metricDate}:${row.metricHour}`,
      ),
    );

    expect(confirmedBatch.status).toBe("confirmed");
    expect(confirmedBatch.previewSummary).toMatchObject({
      importedNewRows: 1,
      updatedRows: 0,
      unchangedRows: 2,
      skippedUnmappedRows: 0,
      unresolvedAgentCount: 0,
    });
    expect(finalMetrics).toHaveLength(3);
    expect(metricKeys.size).toBe(3);
    expect(await importErrorCount(batchId)).toBe(0);

    const duplicate = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "partial-copy.csv",
      fileContent,
    });
    batchIds.push(duplicate.batchId);

    expect(duplicate.preview.duplicateFile).toBe(true);
    expect(duplicate.preview.fileSummary.mappedRowsToImport).toBe(0);
    expect(getImportConfirmationBlockReason(duplicate.preview)).toContain(
      "Duplicate file blocked.",
    );
    await expect(
      confirmDialerImportBatch({ actor, batchId: duplicate.batchId }),
    ).rejects.toThrow("Duplicate file blocked.");
  });

  it("lets managers import own-team rows while out-of-scope rows remain skipped", async () => {
    const ownTeamId = await createTeam("Manager Own Scope Team");
    const otherTeamId = await createTeam("Manager Other Scope Team");
    const manager = await createManagerActor([ownTeamId]);
    const ownProfileId = await createMappedAgent({
      teamId: ownTeamId,
      accountStatus: "active",
      dialerName: "Scoped Alpha",
    });
    const otherProfileId = await createMappedAgent({
      teamId: otherTeamId,
      accountStatus: "active",
      dialerName: "Scoped Beta",
    });
    const fileContent = csvFromRows([
      "Scoped Alpha,2026-07-20,0,3600,600,1200,60,60,300,300,0,5",
      "Scoped Beta,2026-07-20,0,3600,600,1200,60,60,300,300,0,8",
    ]);
    const { batchId, preview } = await createDialerPreviewBatch({
      actor: manager,
      source: "dialer",
      fileName: "manager-scope.csv",
      fileContent,
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.mappedRowsToImport).toBe(1);
    expect(preview.fileSummary.outOfScopeRowsToSkip).toBe(1);
    expect(getImportConfirmationBlockReason(preview)).toBeNull();

    await confirmDialerImportBatch({
      actor: manager,
      batchId,
      allowPartialImport: true,
    });

    const managerMetrics = await getDb()
      .select({
        agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
      })
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.batchId, batchId));
    const [batch] = await getDb()
      .select({ status: dialerImportBatches.status })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, batchId));

    expect(batch.status).toBe("partially_confirmed");
    expect(managerMetrics).toEqual([{ agentProfileId: ownProfileId }]);
    expect(managerMetrics).not.toContainEqual({ agentProfileId: otherProfileId });

    const noTeamManager = await createManagerActor([]);
    const noTeamPreview = await createDialerPreviewBatch({
      actor: noTeamManager,
      source: "dialer",
      fileName: "manager-no-team.csv",
      fileContent,
    });
    batchIds.push(noTeamPreview.batchId);

    expect(noTeamPreview.preview.fileSummary.mappedRowsToImport).toBe(0);
    expect(noTeamPreview.preview.fileSummary.outOfScopeRowsToSkip).toBe(2);
    expect(getImportConfirmationBlockReason(noTeamPreview.preview)).toContain(
      "No mapped new or changed rows exist.",
    );
    await expect(
      confirmDialerImportBatch({
        actor: noTeamManager,
        batchId: noTeamPreview.batchId,
        allowPartialImport: true,
      }),
    ).rejects.toThrow("No mapped new or changed rows exist.");
  });

  it("blocks confirmation when an importable mapped agent has invalid rows", async () => {
    const actor = await createAdminActor();
    const teamId = await createTeam("Invalid Mapped Team");
    await createMappedAgent({
      teamId,
      accountStatus: "active",
      dialerName: "Invalid Alpha",
    });
    const { batchId, preview } = await createDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "invalid-mapped.csv",
      fileContent: csvFromRows([
        "Invalid Alpha,2026-07-20,0,3600,600,1200,60,60,300,300,0,5",
        "Invalid Alpha,2026-07-20,25,3600,600,1200,60,60,300,300,0,5",
      ]),
    });
    batchIds.push(batchId);

    expect(preview.fileSummary.mappedRowsToImport).toBe(1);
    expect(preview.fileSummary.invalidMappedRows).toBe(1);
    expect(getImportConfirmationBlockReason(preview)).toContain(
      "invalid mapped row",
    );
    await expect(
      confirmDialerImportBatch({
        actor,
        batchId,
        allowPartialImport: true,
      }),
    ).rejects.toThrow("invalid mapped row");
  });
});
