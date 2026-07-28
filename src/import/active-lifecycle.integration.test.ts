import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import {
  deactivateDialerImportBatch,
  getActiveImportLifecycleOptions,
} from "@/import/active-lifecycle";
import { getDashboardData } from "@/dashboard/data";
import { restoreDialerImportBatch } from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const batchIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];
const scopeKeys: string[] = [];

async function createActor(role: "admin" | "manager") {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@lifecycle.example.test`,
    name: `Lifecycle ${role}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return { id, role, teamIds: [] } satisfies Actor;
}

async function createScopeChain(
  admin: Actor,
  statuses: Array<"active" | "superseded" | "rolled_back">,
) {
  const teamId = newId();
  const agentId = newId();
  const scopeKey = `dialer|agent_hours_performance|2099-05-01|team:${teamId}|dialer:default`;
  teamIds.push(teamId);
  profileIds.push(agentId);
  scopeKeys.push(scopeKey);
  await getDb().insert(teams).values({
    id: teamId,
    name: `Lifecycle Team ${teamId.slice(0, 8)}`,
  });
  await getDb().insert(profiles).values({
    id: agentId,
    email: `${agentId}@lifecycle-agent.example.test`,
    name: "Lifecycle Agent",
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

  const batches: string[] = [];
  const versions: string[] = [];
  let previousVersionId: string | null = null;

  for (const [index, status] of statuses.entries()) {
    const batchId = newId();
    const versionId = newId();
    const rawFileContent = `Agent,Date\nLifecycle Agent,2099-05-01\n`;
    batches.push(batchId);
    versions.push(versionId);
    batchIds.push(batchId);
    await getDb().insert(dialerImportBatches).values({
      id: batchId,
      source: "dialer",
      importType: "agent_hours_performance",
      fileName: `lifecycle-${index + 1}.csv`,
      fileHash: newId().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      fileSizeBytes: Buffer.byteLength(rawFileContent),
      storageProvider: "database",
      storageLocation: `database://dialer_import_batches/${batchId}/raw_file_content`,
      status,
      uploadedById: admin.id,
      rawFileContent,
      rowCount: 1,
      reportingStartDate: "2099-05-01",
      reportingEndDate: "2099-05-01",
    });
    await getDb().insert(dialerDatasetVersions).values({
      id: versionId,
      importBatchId: batchId,
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-05-01",
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
      sourceAgentName: "Lifecycle Agent",
      agentProfileId: agentId,
      batchId,
      versionId,
      metricDate: "2099-05-01",
      metricHour: 0,
      calls: index + 1,
      loggedInSeconds: 3600,
      rowHash: newId().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      teamIdSnapshot: teamId,
    });
    previousVersionId = versionId;
  }

  const activeIndex = statuses.findIndex((status) => status === "active");
  await getDb().insert(dialerDatasetScopes).values({
    scopeKey,
    source: "dialer",
    importType: "agent_hours_performance",
    reportingDate: "2099-05-01",
    teamId,
    activeVersionId: versions[activeIndex],
    revision: 1,
  });

  return { agentId, batches, scopeKey, teamId, versions };
}

afterEach(async () => {
  const createdBatches = batchIds.splice(0);
  const createdProfiles = profileIds.splice(0);
  const createdTeams = teamIds.splice(0);
  const createdScopes = scopeKeys.splice(0);

  if (createdScopes.length > 0) {
    await getDb()
      .update(dialerDatasetScopes)
      .set({ activeVersionId: null })
      .where(inArray(dialerDatasetScopes.scopeKey, createdScopes));
  }
  if (createdBatches.length > 0) {
    await getDb()
      .delete(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.batchId, createdBatches));
    await getDb()
      .delete(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.importBatchId, createdBatches));
    await getDb()
      .delete(dialerImportBatches)
      .where(inArray(dialerImportBatches.id, createdBatches));
  }
  if (createdScopes.length > 0) {
    await getDb()
      .delete(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, createdScopes));
  }
  if (createdProfiles.length > 0 || createdBatches.length > 0) {
    await getDb()
      .delete(auditLogs)
      .where(
        or(
          createdProfiles.length > 0
            ? inArray(auditLogs.actorProfileId, createdProfiles)
            : eq(auditLogs.actorProfileId, "__none__"),
          createdBatches.length > 0
            ? inArray(auditLogs.entityId, createdBatches)
            : eq(auditLogs.entityId, "__none__"),
        ),
      );
  }
  if (createdProfiles.length > 0) {
    await getDb()
      .delete(teamMemberships)
      .where(inArray(teamMemberships.profileId, createdProfiles));
    await getDb().delete(profiles).where(inArray(profiles.id, createdProfiles));
  }
  if (createdTeams.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, createdTeams));
  }
});

describe("active import lifecycle", () => {
  it("deactivates an active import, restores the previous version, and keeps history", async () => {
    const admin = await createActor("admin");
    const chain = await createScopeChain(admin, ["superseded", "active"]);

    await deactivateDialerImportBatch({
      actor: admin,
      batchId: chain.batches[1],
      reason: "The active dialer export contains incorrect totals.",
      resolution: { mode: "previous" },
    });

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    const [deactivatedBatch] = await getDb()
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, chain.batches[1]));
    const versions = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.id, chain.versions));

    expect(scope.activeVersionId).toBe(chain.versions[0]);
    expect(deactivatedBatch.status).toBe("deactivated");
    expect(
      versions.find((version) => version.id === chain.versions[1])?.status,
    ).toBe("deactivated");
    expect(
      versions.find((version) => version.id === chain.versions[0])?.status,
    ).toBe("active");
  });

  it("supports an explicit no-active state without displaying zero business totals", async () => {
    const admin = await createActor("admin");
    const chain = await createScopeChain(admin, ["active"]);

    await deactivateDialerImportBatch({
      actor: admin,
      batchId: chain.batches[0],
      reason: "No approved replacement file is currently available.",
      resolution: { mode: "none" },
    });

    const dashboard = await getDashboardData({
      ...admin,
      role: "manager",
      teamIds: [chain.teamId],
    });
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBeNull();
    expect(dashboard.status).toBe("NO_ACTIVE_IMPORT");
  });

  it("restores a deactivated import from a no-active scope", async () => {
    const admin = await createActor("admin");
    const chain = await createScopeChain(admin, ["active"]);
    await deactivateDialerImportBatch({
      actor: admin,
      batchId: chain.batches[0],
      reason: "Temporarily remove the unapproved reporting file.",
      resolution: { mode: "none" },
    });

    await restoreDialerImportBatch({
      actor: admin,
      batchId: chain.batches[0],
      reason: "The reporting file has now been reviewed and approved.",
    });

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, chain.scopeKey));
    expect(scope.activeVersionId).toBe(chain.versions[0]);
  });

  it("rejects a selected fallback from a different exact dataset scope", async () => {
    const admin = await createActor("admin");
    const target = await createScopeChain(admin, ["active"]);
    const unrelated = await createScopeChain(admin, ["superseded", "active"]);

    await expect(
      deactivateDialerImportBatch({
        actor: admin,
        batchId: target.batches[0],
        reason: "Attempt to use an unrelated team scope.",
        resolution: {
          mode: "selected",
          fallbackBatchId: unrelated.batches[0],
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_fallback_scope" });

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, target.scopeKey));
    expect(scope.activeVersionId).toBe(target.versions[0]);
  });

  it("enforces administrator permissions server-side", async () => {
    const admin = await createActor("admin");
    const manager = await createActor("manager");
    const chain = await createScopeChain(admin, ["active"]);

    await expect(
      deactivateDialerImportBatch({
        actor: manager,
        batchId: chain.batches[0],
        reason: "Manager attempts an unauthorized deactivation.",
        resolution: { mode: "none" },
      }),
    ).rejects.toMatchObject({ code: "deactivate_forbidden" });
  });

  it("exposes only complete same-scope fallback imports to the dialog", async () => {
    const admin = await createActor("admin");
    const chain = await createScopeChain(admin, ["superseded", "active"]);

    const options = await getActiveImportLifecycleOptions(
      admin,
      chain.batches[1],
    );

    expect(options.isActive).toBe(true);
    expect(options.previousAvailable).toBe(true);
    expect(options.fallbackOptions.map((option) => option.batchId)).toContain(
      chain.batches[0],
    );
  });
});
