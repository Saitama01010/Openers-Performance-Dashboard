import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDashboardData } from "@/dashboard/data";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const batchIds: string[] = [];
const profileIds: string[] = [];
const scopeKeys: string[] = [];
const teamIds: string[] = [];

async function createProfile(
  role: "admin" | "manager" | "agent",
  name: string,
) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@dashboard-scope.example.test`,
    name,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return id;
}

async function createTeam(name: string) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({ id, name, active: true });
  return id;
}

async function addMembership(profileId: string, teamId: string) {
  await getDb().insert(teamMemberships).values({
    id: newId(),
    profileId,
    teamId,
    role: "agent",
    active: true,
  });
}

async function createVersion(input: {
  active: boolean;
  actorId: string;
  agentId: string;
  calls: number;
  previousVersionId?: string;
  reportingDate: string;
  scopeKey: string;
  teamId: string;
  teamName: string;
  versionNumber: number;
}) {
  const batchId = newId();
  const versionId = newId();
  const status = input.active ? "active" : "superseded";
  const rawFileContent = "Agent,Date,Calls\n";
  batchIds.push(batchId);

  await getDb().insert(dialerImportBatches).values({
    id: batchId,
    source: "dialer",
    importType: "agent_hours_performance",
    fileName: `${batchId}.csv`,
    fileHash: batchId.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    fileSizeBytes: Buffer.byteLength(rawFileContent),
    storageProvider: "database",
    storageLocation: `database://dialer_import_batches/${batchId}/raw_file_content`,
    status,
    uploadedById: input.actorId,
    rawFileContent,
    rowCount: 1,
    reportingStartDate: input.reportingDate,
    reportingEndDate: input.reportingDate,
  });
  await getDb().insert(dialerDatasetVersions).values({
    id: versionId,
    importBatchId: batchId,
    scopeKey: input.scopeKey,
    source: "dialer",
    importType: "agent_hours_performance",
    reportingDate: input.reportingDate,
    teamId: input.teamId,
    versionNumber: input.versionNumber,
    status,
    previousVersionId: input.previousVersionId,
    rowCount: 1,
    matchedAgentCount: 1,
    totalCalls: input.calls,
  });
  await getDb().insert(dialerAgentHourlyMetrics).values({
    id: newId(),
    source: "dialer",
    sourceAgentName: `Agent ${input.agentId}`,
    agentProfileId: input.agentId,
    batchId,
    versionId,
    metricDate: input.reportingDate,
    metricHour: input.versionNumber,
    calls: input.calls,
    loggedInSeconds: 3600,
    talkSeconds: 1200,
    rowHash: newId().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    teamIdSnapshot: input.teamId,
    teamNameSnapshot: input.teamName,
  });

  return versionId;
}

afterEach(async () => {
  const createdBatches = batchIds.splice(0);
  const createdProfiles = profileIds.splice(0);
  const createdScopes = scopeKeys.splice(0);
  const createdTeams = teamIds.splice(0);

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
  }
  if (createdScopes.length > 0) {
    await getDb()
      .delete(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, createdScopes));
  }
  if (createdBatches.length > 0) {
    await getDb()
      .delete(dialerImportBatches)
      .where(inArray(dialerImportBatches.id, createdBatches));
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

describe("active-version dashboard scope", () => {
  it("uses one role scope for totals and rows while excluding superseded versions", async () => {
    const adminId = await createProfile("admin", "Dashboard Admin");
    const managerId = await createProfile("manager", "East Manager");
    const eastAgentId = await createProfile("agent", "East Agent");
    const eastNoDataId = await createProfile("agent", "East No Data");
    const westAgentId = await createProfile("agent", "West Agent");
    const eastTeamId = await createTeam("Dashboard East");
    const westTeamId = await createTeam("Dashboard West");
    await addMembership(eastAgentId, eastTeamId);
    await addMembership(eastNoDataId, eastTeamId);
    await addMembership(westAgentId, westTeamId);

    const eastScope =
      `dialer|agent_hours_performance|2099-06-01|team:${eastTeamId}|dialer:default`;
    const westScope =
      `dialer|agent_hours_performance|2099-06-01|team:${westTeamId}|dialer:default`;
    scopeKeys.push(eastScope, westScope);
    const supersededEastVersion = await createVersion({
      active: false,
      actorId: adminId,
      agentId: eastAgentId,
      calls: 99,
      reportingDate: "2099-06-01",
      scopeKey: eastScope,
      teamId: eastTeamId,
      teamName: "Dashboard East",
      versionNumber: 1,
    });
    const activeEastVersion = await createVersion({
      active: true,
      actorId: adminId,
      agentId: eastAgentId,
      calls: 10,
      previousVersionId: supersededEastVersion,
      reportingDate: "2099-06-01",
      scopeKey: eastScope,
      teamId: eastTeamId,
      teamName: "Dashboard East",
      versionNumber: 2,
    });
    const activeWestVersion = await createVersion({
      active: true,
      actorId: adminId,
      agentId: westAgentId,
      calls: 20,
      reportingDate: "2099-06-01",
      scopeKey: westScope,
      teamId: westTeamId,
      teamName: "Dashboard West",
      versionNumber: 1,
    });
    await getDb().insert(dialerDatasetScopes).values([
      {
        scopeKey: eastScope,
        source: "dialer",
        importType: "agent_hours_performance",
        reportingDate: "2099-06-01",
        teamId: eastTeamId,
        activeVersionId: activeEastVersion,
        revision: 2,
      },
      {
        scopeKey: westScope,
        source: "dialer",
        importType: "agent_hours_performance",
        reportingDate: "2099-06-01",
        teamId: westTeamId,
        activeVersionId: activeWestVersion,
        revision: 1,
      },
    ]);

    const admin = await getDashboardData({
      id: adminId,
      role: "admin",
      teamIds: [],
    });
    expect(admin.status).toBe("ACTIVE_IMPORT");
    expect(admin.totals.calls).toBe(30);
    expect(admin.agentRows.map((row) => row.calls)).toEqual([20, 10]);
    expect(admin.reconciliation.callsMatch).toBe(true);

    const manager: Actor = {
      id: managerId,
      role: "manager",
      teamIds: [eastTeamId],
    };
    const east = await getDashboardData(manager, {
      showAgentsWithNoData: true,
    });
    expect(east.totals.calls).toBe(10);
    expect(east.agentRows.map((row) => row.profileId).sort()).toEqual(
      [eastAgentId, eastNoDataId].sort(),
    );
    expect(east.reconciliation.callsMatch).toBe(true);

    const west = await getDashboardData({
      id: westAgentId,
      role: "agent",
      teamIds: [],
    });
    expect(west.totals.calls).toBe(20);
    expect(west.agentRows).toHaveLength(1);
    expect(west.agentRows[0]?.profileId).toBe(westAgentId);
  });
});
