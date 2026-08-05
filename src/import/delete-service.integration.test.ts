import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  importErrors,
  profiles,
  teamMemberships,
  teams,
  userPermissionOverrides,
} from "@/db/schema";
import {
  deleteDialerImportBatch,
  getImportDeletionAssessments,
} from "@/import/delete-service";
import { getActiveDialerMetricTotals } from "@/import/active-data";
import { listImportHistory } from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const batchIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];

async function createActor(role: "admin" | "manager" | "agent") {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@delete.example.test`,
    name: `Delete ${role} ${id.slice(0, 8)}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return { id, role, teamIds: [] } satisfies Actor;
}

async function createTeamAndAgent() {
  const teamId = newId();
  const agentId = newId();
  teamIds.push(teamId);
  profileIds.push(agentId);
  await getDb().insert(teams).values({
    id: teamId,
    name: `Deletion Team ${teamId.slice(0, 8)}`,
    active: true,
  });
  await getDb().insert(profiles).values({
    id: agentId,
    email: `${agentId}@delete-agent.example.test`,
    name: `Deletion Agent ${agentId.slice(0, 8)}`,
    role: "agent",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  await getDb().insert(teamMemberships).values({
    id: newId(),
    teamId,
    profileId: agentId,
    role: "agent",
    active: true,
  });
  return { teamId, agentId };
}

async function createBatch(input: {
  actor: Actor;
  status:
    | "active"
    | "draft"
    | "failed"
    | "processing"
    | "rejected"
    | "rolled_back"
    | "superseded"
    | "validation_failed"
    | "ready_to_publish";
  fileName?: string;
  rawFileContent?: string;
  storageLocation?: string | null;
  storageProvider?: string;
}) {
  const id = newId();
  const rawFileContent = input.rawFileContent ?? "Agent,Date\nTest,2099-01-01\n";
  batchIds.push(id);
  await getDb().insert(dialerImportBatches).values({
    id,
    source: "dialer",
    importType: "agent_hours_performance",
    fileName: input.fileName ?? `${id}.csv`,
    fileHash: id.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    fileSizeBytes: Buffer.byteLength(rawFileContent),
    storageProvider: input.storageProvider ?? "database",
    storageLocation:
      input.storageLocation === undefined
        ? `database://dialer_import_batches/${id}/raw_file_content`
        : input.storageLocation,
    status: input.status,
    uploadedById: input.actor.id,
    rawFileContent,
  });
  return id;
}

async function createVersionChain(
  admin: Actor,
  statuses: Array<
    "active" | "draft" | "rejected" | "rolled_back" | "superseded"
  >,
) {
  const { teamId, agentId } = await createTeamAndAgent();
  const scopeKey = `dialer|agent_hours_performance|2099-02-01|team:${teamId}|dialer:default`;
  const batches: string[] = [];
  const versions: string[] = [];
  let previousVersionId: string | null = null;

  for (const [index, status] of statuses.entries()) {
    const batchId = await createBatch({
      actor: admin,
      status,
      fileName: `history-${index + 1}.csv`,
    });
    const versionId = newId();
    batches.push(batchId);
    versions.push(versionId);
    await getDb().insert(dialerDatasetVersions).values({
      id: versionId,
      importBatchId: batchId,
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-02-01",
      teamId,
      versionNumber: index + 1,
      status,
      previousVersionId,
      rowCount: 1,
      matchedAgentCount: 1,
      totalCalls: index + 1,
    });
    await getDb().insert(dialerAgentHourlyMetrics).values({
      id: newId(),
      source: "dialer",
      sourceAgentName: "Deletion Agent",
      agentProfileId: agentId,
      batchId,
      versionId,
      metricDate: "2099-02-01",
      metricHour: 0,
      metricKey: "hour:00",
      calls: index + 1,
      loggedInSeconds: 3600,
      rowHash: newId().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Deletion Team",
    });
    previousVersionId = versionId;
  }

  const activeIndex = statuses.findIndex((status) => status === "active");
  await getDb().insert(dialerDatasetScopes).values({
    scopeKey,
    source: "dialer",
    importType: "agent_hours_performance",
    reportingDate: "2099-02-01",
    teamId,
    activeVersionId: versions[activeIndex],
    revision: 1,
  });

  return { agentId, batches, scopeKey, teamId, versions };
}

async function deleteImport(
  admin: Actor,
  batchId: string,
  active = false,
) {
  return deleteDialerImportBatch({
    actor: admin,
    batchId,
    confirmation: active ? "DELETE ACTIVE IMPORT" : "DELETE IMPORT",
    reason: "Confirmed obsolete import cleanup.",
  });
}

afterEach(async () => {
  const batches = batchIds.splice(0);
  const createdProfiles = profileIds.splice(0);
  const createdTeams = teamIds.splice(0);

  if (createdTeams.length > 0) {
    await getDb()
      .update(dialerDatasetScopes)
      .set({ activeVersionId: null })
      .where(inArray(dialerDatasetScopes.teamId, createdTeams));
  }
  if (batches.length > 0) {
    await getDb()
      .delete(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.batchId, batches));
    await getDb()
      .delete(dialerImportRows)
      .where(inArray(dialerImportRows.batchId, batches));
    await getDb()
      .delete(importErrors)
      .where(inArray(importErrors.batchId, batches));
    await getDb()
      .delete(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.importBatchId, batches));
    await getDb()
      .delete(dialerImportBatches)
      .where(inArray(dialerImportBatches.id, batches));
  }
  if (createdTeams.length > 0) {
    await getDb()
      .delete(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.teamId, createdTeams));
  }
  if (createdProfiles.length > 0 || batches.length > 0) {
    await getDb()
      .delete(auditLogs)
      .where(
        or(
          createdProfiles.length > 0
            ? inArray(auditLogs.actorProfileId, createdProfiles)
            : eq(auditLogs.actorProfileId, "__none__"),
          batches.length > 0
            ? inArray(auditLogs.entityId, batches)
            : eq(auditLogs.entityId, "__none__"),
        ),
      );
  }
  if (createdProfiles.length > 0) {
    await getDb()
      .delete(teamMemberships)
      .where(inArray(teamMemberships.profileId, createdProfiles));
    await getDb()
      .delete(profiles)
      .where(inArray(profiles.id, createdProfiles));
  }
  if (createdTeams.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, createdTeams));
  }
});

describe("permanent import deletion", () => {
  it("deletes a failed import, validation rows, and the database-stored CSV while preserving its audit", async () => {
    const admin = await createActor("admin");
    const batchId = await createBatch({ actor: admin, status: "failed" });
    await getDb().insert(dialerImportRows).values({
      id: newId(),
      batchId,
      rowNumber: 2,
      sourceAgentName: "Unknown Agent",
      normalizedAgentName: "unknown agent",
      matchingStatus: "unmapped",
      validationStatus: "error",
    });
    await getDb().insert(importErrors).values({
      id: newId(),
      batchId,
      rowNumber: 2,
      status: "invalid",
      message: "Malformed row",
    });

    const result = await deleteImport(admin, batchId);

    expect(result.storedFileDeleted).toBe(true);
    expect(result.deletedCounts.stagingRows).toBe(1);
    expect(result.deletedCounts.validationRows).toBe(1);
    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, batchId)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(dialerImportRows)
        .where(eq(dialerImportRows.batchId, batchId)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(importErrors)
        .where(eq(importErrors.batchId, batchId)),
    ).toHaveLength(0);
    const history = await listImportHistory(admin, { pageSize: 100 });
    expect(history.rows.some((row) => row.id === batchId)).toBe(false);

    const [audit] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "dialer_import.deleted"),
          eq(auditLogs.entityId, batchId),
        ),
      );
    expect(audit.entityId).toBe(batchId);
    expect(audit.metadata?.storedFileDeleted).toBe(true);
    expect(audit.metadata).not.toHaveProperty("rawFileContent");
  });

  it("deletes owned metric and version rows from a rejected import", async () => {
    const admin = await createActor("admin");
    const { teamId, agentId } = await createTeamAndAgent();
    const batchId = await createBatch({ actor: admin, status: "rejected" });
    const versionId = newId();
    await getDb().insert(dialerDatasetVersions).values({
      id: versionId,
      importBatchId: batchId,
      scopeKey: `rejected:${teamId}`,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-03-01",
      teamId,
      versionNumber: 1,
      status: "rejected",
    });
    await getDb().insert(dialerAgentHourlyMetrics).values({
      id: newId(),
      source: "dialer",
      sourceAgentName: "Rejected Agent",
      agentProfileId: agentId,
      batchId,
      versionId,
      metricDate: "2099-03-01",
      metricHour: 0,
      metricKey: "hour:00",
      rowHash: newId().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      teamIdSnapshot: teamId,
    });

    const result = await deleteImport(admin, batchId);

    expect(result.deletedCounts.metricRows).toBe(1);
    expect(result.deletedCounts.versionRows).toBe(1);
    expect(
      await getDb()
        .select()
        .from(dialerAgentHourlyMetrics)
        .where(eq(dialerAgentHourlyMetrics.batchId, batchId)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(dialerDatasetVersions)
        .where(eq(dialerDatasetVersions.importBatchId, batchId)),
    ).toHaveLength(0);
  });

  it("deletes an eligible superseded import without changing unrelated users, teams, or imports", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "superseded",
      "active",
    ]);
    const target = chain.batches[0];
    const unrelated = chain.batches[3];

    await deleteImport(admin, target);

    expect(await getDb().select().from(profiles).where(eq(profiles.id, chain.agentId))).toHaveLength(1);
    expect(await getDb().select().from(teams).where(eq(teams.id, chain.teamId))).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, unrelated)),
    ).toHaveLength(1);
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[3]);
  });

  it("retains and re-homes legacy shared metrics instead of blocking deletion", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, ["superseded", "active"]);
    await getDb()
      .update(dialerAgentHourlyMetrics)
      .set({ batchId: chain.batches[0] })
      .where(eq(dialerAgentHourlyMetrics.versionId, chain.versions[1]));

    const [targetBatch] = await getDb()
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        fileSizeBytes: dialerImportBatches.fileSizeBytes,
        importType: dialerImportBatches.importType,
        source: dialerImportBatches.source,
        dialerId: dialerImportBatches.dialerId,
        status: dialerImportBatches.status,
        uploadedById: dialerImportBatches.uploadedById,
        reportingStartDate: dialerImportBatches.reportingStartDate,
        reportingEndDate: dialerImportBatches.reportingEndDate,
        rowCount: dialerImportBatches.rowCount,
        storageProvider: dialerImportBatches.storageProvider,
        storageLocation: dialerImportBatches.storageLocation,
        createdAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, chain.batches[0]));
    const assessments = await getImportDeletionAssessments(admin, [targetBatch]);
    expect(assessments.get(chain.batches[0])).toMatchObject({
      allowed: true,
      sharedMetricRowCount: 1,
    });

    const result = await deleteImport(admin, chain.batches[0]);

    expect(result.sharedRecordsRetained).toBe(1);
    const [retainedMetric] = await getDb()
      .select()
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.versionId, chain.versions[1]));
    expect(retainedMetric.batchId).toBe(chain.batches[1]);
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[1]);
    const totals = await getActiveDialerMetricTotals([chain.agentId]);
    expect(Number(totals?.calls ?? 0)).toBe(2);
  });

  it("deletes an eligible rolled-back import and rewires the later rollback chain", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "rolled_back",
      "active",
    ]);

    await deleteImport(admin, chain.batches[2]);

    const [activeVersion] = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.id, chain.versions[3]));
    expect(activeVersion.previousVersionId).toBe(chain.versions[1]);
  });

  it("requires the exact active confirmation and still rejects processing imports", async () => {
    const admin = await createActor("admin");
    const active = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "active",
    ]);
    const processing = await createBatch({
      actor: admin,
      status: "processing",
    });

    await expect(deleteImport(admin, active.batches[2])).rejects.toMatchObject({
      code: "delete_confirmation_required",
    });
    await expect(deleteImport(admin, processing)).rejects.toMatchObject({
      code: "import_processing",
    });
  });

  it("deletes an active import and automatically activates the previous fallback", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "active",
    ]);

    const result = await deleteImport(admin, chain.batches[2], true);

    expect(result.deletedImportId).toBe(chain.batches[2]);
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[1]);
    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, chain.batches[2])),
    ).toHaveLength(0);
  });

  it("deletes an active daily aggregate version and activates the previous daily fallback", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "active",
    ]);
    await getDb()
      .update(dialerImportBatches)
      .set({
        granularity: "daily",
        selectedReportingDate: "2099-02-01",
      })
      .where(inArray(dialerImportBatches.id, chain.batches));
    await getDb()
      .update(dialerDatasetVersions)
      .set({ granularity: "daily" })
      .where(inArray(dialerDatasetVersions.id, chain.versions));
    await getDb()
      .update(dialerAgentHourlyMetrics)
      .set({
        granularity: "daily",
        metricHour: null,
        metricKey: "daily",
        ringingSeconds: null,
        systemPauseSeconds: 30,
        netSeconds: 3300,
        idleSeconds: null,
        untrackedSeconds: null,
      })
      .where(inArray(dialerAgentHourlyMetrics.versionId, chain.versions));

    await deleteImport(admin, chain.batches[1], true);

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    const [fallback] = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.id, chain.versions[0]));
    expect(scope.activeVersionId).toBe(chain.versions[0]);
    expect(fallback).toMatchObject({
      granularity: "daily",
      status: "active",
    });
  });

  it("skips draft and rejected versions when selecting the automatic fallback", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "draft",
      "active",
    ]);

    await deleteImport(admin, chain.batches[2], true);

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[0]);
  });

  it("deletes an active import and leaves no active pointer when no fallback exists", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, ["active"]);

    await deleteImport(admin, chain.batches[0], true);

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBeNull();
  });

  it("never activates a historical version from another dataset scope", async () => {
    const admin = await createActor("admin");
    const target = await createVersionChain(admin, ["active"]);
    const unrelated = await createVersionChain(admin, ["superseded", "active"]);

    await deleteImport(admin, target.batches[0], true);

    const [targetScope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, target.scopeKey));
    const [unrelatedScope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, unrelated.scopeKey));
    expect(targetScope.activeVersionId).toBeNull();
    expect(unrelatedScope.activeVersionId).toBe(unrelated.versions[1]);
  });

  it("rejects agents, managers, and administrators denied imports.delete", async () => {
    const admin = await createActor("admin");
    const manager = await createActor("manager");
    const agent = await createActor("agent");
    const batchId = await createBatch({ actor: admin, status: "failed" });

    await expect(deleteImport(manager, batchId)).rejects.toMatchObject({
      code: "delete_forbidden",
    });
    await expect(deleteImport(agent, batchId)).rejects.toMatchObject({
      code: "delete_forbidden",
    });
    await getDb().insert(userPermissionOverrides).values({
      profileId: admin.id,
      permissionKey: "imports.delete",
      allowed: false,
    });
    await expect(deleteImport(admin, batchId)).rejects.toMatchObject({
      code: "delete_forbidden",
    });
  });

  it("handles an already-missing database-stored CSV safely", async () => {
    const admin = await createActor("admin");
    const batchId = await createBatch({
      actor: admin,
      status: "failed",
      rawFileContent: "",
      storageLocation: null,
    });

    const result = await deleteImport(admin, batchId);

    expect(result.storedFileDeleted).toBe(false);
    expect(result.storedFileWasAlreadyMissing).toBe(true);
  });

  it("deletes database records and reports pending cleanup for external storage", async () => {
    const admin = await createActor("admin");
    const batchId = await createBatch({
      actor: admin,
      status: "failed",
      storageProvider: "s3",
      storageLocation: "private://bucket/import.csv",
    });

    const result = await deleteImport(admin, batchId);
    expect(result.storageCleanupPending).toBe(true);
    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, batchId)),
    ).toHaveLength(0);
  });

  it("allows only one of two concurrent deletion requests to succeed", async () => {
    const admin = await createActor("admin");
    const batchId = await createBatch({ actor: admin, status: "failed" });

    const results = await Promise.allSettled([
      deleteImport(admin, batchId),
      deleteImport(admin, batchId),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, batchId),
            eq(auditLogs.action, "dialer_import.deleted"),
          ),
        ),
    ).toHaveLength(1);
  });

  it("cannot delete an import that becomes active while deletion waits for its lock", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "superseded",
      "active",
    ]);
    const targetBatchId = chain.batches[0];
    const targetVersionId = chain.versions[0];
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const activation = getDb().transaction(async (tx) => {
      await tx
        .select({ id: dialerImportBatches.id })
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, targetBatchId))
        .for("update");
      reportLocked();
      await release;
      await tx
        .update(dialerImportBatches)
        .set({ status: "active" })
        .where(eq(dialerImportBatches.id, targetBatchId));
      await tx
        .update(dialerDatasetVersions)
        .set({ status: "active" })
        .where(eq(dialerDatasetVersions.id, targetVersionId));
      await tx
        .update(dialerDatasetScopes)
        .set({ activeVersionId: targetVersionId })
        .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    });

    await lockHeld;
    const deletion = deleteImport(admin, targetBatchId);
    releaseLock();
    await activation;

    await expect(deletion).rejects.toMatchObject({
      code: "delete_confirmation_required",
    });
    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, targetBatchId)),
    ).toHaveLength(1);
  });

  it("rolls back all row removals when a database deletion transaction fails", async () => {
    const admin = await createActor("admin");
    const batchId = await createBatch({ actor: admin, status: "failed" });
    await getDb().insert(importErrors).values({
      id: newId(),
      batchId,
      rowNumber: 2,
      status: "invalid",
      message: "Rollback test",
    });

    await expect(
      getDb().transaction(async (tx) => {
        await tx.delete(importErrors).where(eq(importErrors.batchId, batchId));
        await tx
          .delete(dialerImportBatches)
          .where(eq(dialerImportBatches.id, batchId));
        throw new Error("Simulated deletion transaction failure.");
      }),
    ).rejects.toThrow("Simulated deletion transaction failure");

    expect(
      await getDb()
        .select()
        .from(dialerImportBatches)
        .where(eq(dialerImportBatches.id, batchId)),
    ).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(importErrors)
        .where(eq(importErrors.batchId, batchId)),
    ).toHaveLength(1);
  });

  it("allows historical deletion without changing the current active pointer", async () => {
    const admin = await createActor("admin");
    const chain = await createVersionChain(admin, [
      "superseded",
      "superseded",
      "active",
    ]);
    const targetBatch = await getDb()
      .select({
        id: dialerImportBatches.id,
        fileName: dialerImportBatches.fileName,
        fileSizeBytes: dialerImportBatches.fileSizeBytes,
        importType: dialerImportBatches.importType,
        source: dialerImportBatches.source,
        dialerId: dialerImportBatches.dialerId,
        status: dialerImportBatches.status,
        uploadedById: dialerImportBatches.uploadedById,
        reportingStartDate: dialerImportBatches.reportingStartDate,
        reportingEndDate: dialerImportBatches.reportingEndDate,
        rowCount: dialerImportBatches.rowCount,
        storageProvider: dialerImportBatches.storageProvider,
        storageLocation: dialerImportBatches.storageLocation,
        createdAt: dialerImportBatches.createdAt,
      })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, chain.batches[0]));
    const assessments = await getImportDeletionAssessments(admin, targetBatch);

    expect(assessments.get(chain.batches[0])).toMatchObject({
      allowed: true,
    });
    await deleteImport(admin, chain.batches[0]);
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[2]);
  });
});
