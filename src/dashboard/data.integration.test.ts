import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import {
  getDashboardAgentRowsData,
  getDashboardData,
  getDashboardSummaryData,
} from "@/dashboard/data";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
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
  granularity?: "hourly" | "daily";
  loggedInSeconds?: number;
  netSeconds?: number;
  previousVersionId?: string;
  reportingDate: string;
  scopeKey: string;
  teamId: string;
  teamName: string;
  systemPauseSeconds?: number;
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
    granularity: input.granularity ?? "hourly",
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
    selectedReportingDate:
      input.granularity === "daily" ? input.reportingDate : null,
  });
  await getDb().insert(dialerDatasetVersions).values({
    id: versionId,
    importBatchId: batchId,
    scopeKey: input.scopeKey,
    source: "dialer",
    importType: "agent_hours_performance",
    granularity: input.granularity ?? "hourly",
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
    granularity: input.granularity ?? "hourly",
    metricDate: input.reportingDate,
    metricHour:
      input.granularity === "daily" ? null : input.versionNumber,
    metricKey:
      input.granularity === "daily"
        ? "daily"
        : `hour:${String(input.versionNumber).padStart(2, "0")}`,
    calls: input.calls,
    loggedInSeconds: input.loggedInSeconds ?? 3600,
    talkSeconds: 1200,
    ringingSeconds: input.granularity === "daily" ? null : 0,
    systemPauseSeconds:
      input.granularity === "daily"
        ? input.systemPauseSeconds ?? 30
        : null,
    netSeconds:
      input.granularity === "daily" ? input.netSeconds ?? 3300 : null,
    idleSeconds: input.granularity === "daily" ? null : 0,
    untrackedSeconds: input.granularity === "daily" ? null : 0,
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
  it("excludes legacy deleted profiles from agent rows and aggregate totals", async () => {
    const adminId = await createProfile("admin", "Deleted Filter Admin");
    const deletedAgentId = await createProfile("agent", "Legacy Deleted Agent");
    const teamId = await createTeam("Deleted Filter Team");
    await addMembership(deletedAgentId, teamId);
    const scopeKey =
      `dialer|agent_hours_performance|2099-07-01|team:${teamId}|dialer:default`;
    scopeKeys.push(scopeKey);
    const versionId = await createVersion({
      active: true,
      actorId: adminId,
      agentId: deletedAgentId,
      calls: 41,
      reportingDate: "2099-07-01",
      scopeKey,
      teamId,
      teamName: "Deleted Filter Team",
      versionNumber: 1,
    });
    await getDb().insert(dialerDatasetScopes).values({
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-07-01",
      teamId,
      activeVersionId: versionId,
      revision: 1,
    });
    await getDb()
      .update(profiles)
      .set({ accountStatus: "deleted", active: false, deletedAt: new Date() })
      .where(inArray(profiles.id, [deletedAgentId]));

    const dashboard = await getDashboardData({
      id: adminId,
      role: "admin",
      teamIds: [],
    });

    expect(dashboard.agentRows.some(
      (row) => row.profileId === deletedAgentId,
    )).toBe(false);
    expect(dashboard.totals.calls).toBe(0);
    expect(dashboard.totals.rowCount).toBe(0);
  });

  it("counts a daily aggregate once and creates no fabricated hourly chart row", async () => {
    const adminId = await createProfile("admin", "Daily Dashboard Admin");
    const agentId = await createProfile("agent", "Daily Dashboard Agent");
    const teamId = await createTeam("Daily Dashboard Team");
    await addMembership(agentId, teamId);
    const scopeKey =
      `dialer|agent_hours_performance|2099-06-02|team:${teamId}|dialer:default`;
    scopeKeys.push(scopeKey);
    const versionId = await createVersion({
      active: true,
      actorId: adminId,
      agentId,
      calls: 17,
      granularity: "daily",
      loggedInSeconds: 7200,
      netSeconds: 6900,
      reportingDate: "2099-06-02",
      scopeKey,
      systemPauseSeconds: 75,
      teamId,
      teamName: "Daily Dashboard Team",
      versionNumber: 1,
    });
    await getDb().insert(dialerDatasetScopes).values({
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-06-02",
      teamId,
      activeVersionId: versionId,
      revision: 1,
    });

    const dashboard = await getDashboardData({
      id: agentId,
      role: "agent",
      teamIds: [],
    });

    expect(dashboard.totals).toMatchObject({
      calls: 17,
      loggedInSeconds: 7200,
      systemPauseSeconds: 75,
      netSeconds: 6900,
      ringingSeconds: null,
      idleSeconds: null,
      untrackedSeconds: null,
      rowCount: 1,
    });
    expect(dashboard.agentRows).toHaveLength(1);
    expect(dashboard.agentRows[0]?.calls).toBe(17);
    expect(dashboard.hourlyBreakdown).toEqual([]);
    expect(dashboard.hourlyDetailUnavailable).toBe(true);
    expect(dashboard.reconciliation.callsMatch).toBe(true);
  });

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
    const createdAgentIds = new Set<string>([eastAgentId, westAgentId]);
    const adminCreatedRows = admin.agentRows
      .filter((row) => createdAgentIds.has(row.profileId))
      .map((row) => row.calls)
      .sort((a, b) => b - a);

    expect(admin.status).toBe("ACTIVE_IMPORT");
    expect(adminCreatedRows).toEqual([20, 10]);
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

  it("filters active metrics and returns the prior-period totals", async () => {
    const adminId = await createProfile("admin", "Comparison Admin");
    const agentId = await createProfile("agent", "Comparison Agent");
    const teamId = await createTeam("Comparison Team");
    await addMembership(agentId, teamId);

    const previousScope =
      `dialer|agent_hours_performance|2099-06-01|team:${teamId}|dialer:default`;
    const currentScope =
      `dialer|agent_hours_performance|2099-06-02|team:${teamId}|dialer:default`;
    scopeKeys.push(previousScope, currentScope);

    const previousVersion = await createVersion({
      active: true,
      actorId: adminId,
      agentId,
      calls: 10,
      reportingDate: "2099-06-01",
      scopeKey: previousScope,
      teamId,
      teamName: "Comparison Team",
      versionNumber: 1,
    });
    const currentVersion = await createVersion({
      active: true,
      actorId: adminId,
      agentId,
      calls: 25,
      reportingDate: "2099-06-02",
      scopeKey: currentScope,
      teamId,
      teamName: "Comparison Team",
      versionNumber: 1,
    });

    await getDb().insert(dialerDatasetScopes).values([
      {
        scopeKey: previousScope,
        source: "dialer",
        importType: "agent_hours_performance",
        reportingDate: "2099-06-01",
        teamId,
        activeVersionId: previousVersion,
        revision: 1,
      },
      {
        scopeKey: currentScope,
        source: "dialer",
        importType: "agent_hours_performance",
        reportingDate: "2099-06-02",
        teamId,
        activeVersionId: currentVersion,
        revision: 1,
      },
    ]);

    const dashboard = await getDashboardData(
      { id: adminId, role: "admin", teamIds: [] },
      {
        dateRange: {
          key: "today",
          label: "Today",
          from: "2099-06-02",
          to: "2099-06-02",
          comparison: {
            from: "2099-06-01",
            to: "2099-06-01",
            label: "previous day",
          },
        },
      },
    );

    expect(dashboard.status).toBe("ACTIVE_IMPORT");
    expect(dashboard.totals.calls).toBe(25);
    expect(dashboard.agentRows).toHaveLength(1);
    expect(dashboard.comparison?.hasData).toBe(true);
    expect(dashboard.comparison?.totals.calls).toBe(10);
  });

  it("returns active July 28 metrics for Last Month, All Time, and a custom same-day range", async () => {
    const adminId = await createProfile("admin", "July Regression Admin");
    const agentId = await createProfile("agent", "July Regression Agent");
    const teamId = await createTeam("July Regression Team");
    await addMembership(agentId, teamId);
    const scopeKey = `dialer|agent_hours_performance|2026-07-28|team:${teamId}|dialer:default`;
    scopeKeys.push(scopeKey);
    const activeVersion = await createVersion({
      active: true,
      actorId: adminId,
      agentId,
      calls: 28,
      reportingDate: "2026-07-28",
      scopeKey,
      teamId,
      teamName: "July Regression Team",
      versionNumber: 1,
    });
    await createVersion({
      active: false,
      actorId: adminId,
      agentId,
      calls: 999,
      reportingDate: "2026-07-28",
      scopeKey,
      teamId,
      teamName: "July Regression Team",
      versionNumber: 2,
    });
    await getDb().insert(dialerDatasetScopes).values({
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2026-07-28",
      teamId,
      activeVersionId: activeVersion,
      revision: 1,
    });
    const actor = { id: adminId, role: "admin" as const, teamIds: [] };
    const now = new Date("2026-08-04T12:00:00.000Z");
    const ranges = [
      resolveOverviewDateRange({ range: "last-month" }, now),
      resolveOverviewDateRange({ range: "all-time" }, now),
      resolveOverviewDateRange(
        { range: "custom", from: "2026-07-28", to: "2026-07-28" },
        now,
      ),
    ];

    for (const dateRange of ranges) {
      const dashboard = await getDashboardData(actor, { dateRange });
      const summary = await getDashboardSummaryData(actor, { dateRange });
      const agentRows = await getDashboardAgentRowsData(actor, { dateRange });
      expect(dashboard.totals.calls).toBe(28);
      expect(dashboard.totals.rowCount).toBe(1);
      expect(summary).toMatchObject({
        status: dashboard.status,
        totals: dashboard.totals,
        dataFreshness: dashboard.dataFreshness,
        comparison: dashboard.comparison,
      });
      expect(agentRows.status).toBe(dashboard.status);
      expect(agentRows.agentRows).toEqual(dashboard.agentRows);
    }
  });
});
