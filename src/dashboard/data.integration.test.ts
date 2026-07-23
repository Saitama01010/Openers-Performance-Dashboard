import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { getDashboardData } from "@/dashboard/data";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];
const batchIds: string[] = [];

async function createProfile(input: {
  role: "admin" | "manager" | "agent";
  name: string;
  accountStatus?: "invited" | "active" | "deactivated" | "revoked";
  active?: boolean;
}) {
  const id = newId();
  profileIds.push(id);

  await getDb().insert(profiles).values({
    id,
    email: `${id}@dashboard-scope.test`,
    name: input.name,
    role: input.role,
    active: input.active ?? true,
    accountStatus: input.accountStatus ?? "active",
    passwordHash: input.role === "agent" ? undefined : "test-hash",
  });

  return id;
}

async function createTeam(name: string) {
  const id = newId();
  teamIds.push(id);

  await getDb().insert(teams).values({ id, name, active: true });

  return id;
}

async function addMembership(input: {
  profileId: string;
  teamId: string;
  role: "manager" | "agent";
}) {
  await getDb().insert(teamMemberships).values({
    id: newId(),
    teamId: input.teamId,
    profileId: input.profileId,
    role: input.role,
    active: true,
  });
}

async function createBatch(uploadedById: string) {
  const id = newId();
  batchIds.push(id);

  await getDb().insert(dialerImportBatches).values({
    id,
    source: "dashboard-test",
    fileName: `${id}.csv`,
    fileHash: "0".repeat(64),
    status: "confirmed",
    uploadedById,
    rowCount: 1,
    rawFileContent: "Agent,Date,Hour,Calls\n",
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: new Date(),
  });

  return id;
}

async function addMetric(input: {
  batchId: string;
  profileId: string;
  sourceAgentName: string;
  date: string;
  hour: number;
  calls: number;
  loggedInSeconds: number;
  talkSeconds: number;
  teamIdSnapshot: string | null;
  teamNameSnapshot: string | null;
}) {
  await getDb().insert(dialerAgentHourlyMetrics).values({
    id: newId(),
    source: `dashboard-test-${input.batchId}`,
    sourceAgentName: input.sourceAgentName,
    agentProfileId: input.profileId,
    batchId: input.batchId,
    metricDate: input.date,
    metricHour: input.hour,
    calls: input.calls,
    loggedInSeconds: input.loggedInSeconds,
    readySeconds: Math.floor(input.loggedInSeconds / 4),
    talkSeconds: input.talkSeconds,
    ringingSeconds: 0,
    wrapSeconds: 60,
    pausedSeconds: 120,
    idleSeconds: 30,
    untrackedSeconds: 0,
    teamIdSnapshot: input.teamIdSnapshot,
    teamNameSnapshot: input.teamNameSnapshot,
    rowHash: "a".repeat(64),
  });
}

function rowFor(data: Awaited<ReturnType<typeof getDashboardData>>, id: string) {
  return data.agentRows.find((row) => row.profileId === id);
}

describe("dashboard data scope", () => {
  afterEach(async () => {
    const batches = batchIds.splice(0);
    const profilesToDelete = profileIds.splice(0);
    const teamsToDelete = teamIds.splice(0);

    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(dialerAgentHourlyMetrics)
        .where(inArray(dialerAgentHourlyMetrics.agentProfileId, profilesToDelete));
    }

    if (batches.length > 0) {
      await getDb()
        .delete(dialerImportBatches)
        .where(inArray(dialerImportBatches.id, batches));
    }

    if (profilesToDelete.length > 0) {
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, profilesToDelete));
      await getDb().delete(profiles).where(inArray(profiles.id, profilesToDelete));
    }

    if (teamsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamsToDelete));
    }
  });

  it("uses identical scope for admin totals and agent rows", async () => {
    const adminId = await createProfile({ role: "admin", name: "Dashboard Admin" });
    const teamId = await createTeam("Dashboard Admin Team");
    const firstAgentId = await createProfile({ role: "agent", name: "Admin Scope A" });
    const secondAgentId = await createProfile({ role: "agent", name: "Admin Scope B" });
    await addMembership({ profileId: firstAgentId, teamId, role: "agent" });
    await addMembership({ profileId: secondAgentId, teamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: firstAgentId,
      sourceAgentName: "Admin Scope A",
      date: "2026-07-21",
      hour: 9,
      calls: 17,
      loggedInSeconds: 3600,
      talkSeconds: 1200,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Dashboard Admin Team",
    });
    await addMetric({
      batchId,
      profileId: secondAgentId,
      sourceAgentName: "Admin Scope B",
      date: "2026-07-21",
      hour: 10,
      calls: 23,
      loggedInSeconds: 4200,
      talkSeconds: 1800,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Dashboard Admin Team",
    });

    const data = await getDashboardData({ id: adminId, role: "admin", teamIds: [] });

    expect(rowFor(data, firstAgentId)?.calls).toBe(17);
    expect(rowFor(data, secondAgentId)?.calls).toBe(23);
    expect(data.reconciliation.callsMatch).toBe(true);
    expect(data.reconciliation.loggedInSecondsMatch).toBe(true);
    expect(data.reconciliation.talkSecondsMatch).toBe(true);
  });

  it("uses identical snapshot team scope for manager totals and rows", async () => {
    const adminId = await createProfile({ role: "admin", name: "Scope Admin" });
    const eastTeamId = await createTeam("Dashboard East");
    const westTeamId = await createTeam("Dashboard West");
    const eastAgentId = await createProfile({ role: "agent", name: "East Agent" });
    const westAgentId = await createProfile({ role: "agent", name: "West Agent" });
    await addMembership({ profileId: eastAgentId, teamId: eastTeamId, role: "agent" });
    await addMembership({ profileId: westAgentId, teamId: westTeamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: eastAgentId,
      sourceAgentName: "East Agent",
      date: "2026-07-21",
      hour: 8,
      calls: 31,
      loggedInSeconds: 3600,
      talkSeconds: 1000,
      teamIdSnapshot: eastTeamId,
      teamNameSnapshot: "Dashboard East",
    });
    await addMetric({
      batchId,
      profileId: westAgentId,
      sourceAgentName: "West Agent",
      date: "2026-07-21",
      hour: 8,
      calls: 47,
      loggedInSeconds: 3600,
      talkSeconds: 1500,
      teamIdSnapshot: westTeamId,
      teamNameSnapshot: "Dashboard West",
    });

    const data = await getDashboardData({
      id: "manager-east",
      role: "manager",
      teamIds: [eastTeamId],
    });

    expect(data.totals.calls).toBe(31);
    expect(data.agentRows.map((row) => row.profileId)).toEqual([eastAgentId]);
    expect(data.reconciliation.callsMatch).toBe(true);
    expect(data.reconciliation.loggedInSecondsMatch).toBe(true);
    expect(data.reconciliation.talkSecondsMatch).toBe(true);
  });

  it("lets agents see only their own metrics", async () => {
    const adminId = await createProfile({ role: "admin", name: "Agent Scope Admin" });
    const teamId = await createTeam("Agent Scope Team");
    const selfId = await createProfile({ role: "agent", name: "Self Agent" });
    const otherId = await createProfile({ role: "agent", name: "Other Agent" });
    await addMembership({ profileId: selfId, teamId, role: "agent" });
    await addMembership({ profileId: otherId, teamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: selfId,
      sourceAgentName: "Self Agent",
      date: "2026-07-21",
      hour: 11,
      calls: 13,
      loggedInSeconds: 2400,
      talkSeconds: 900,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Agent Scope Team",
    });
    await addMetric({
      batchId,
      profileId: otherId,
      sourceAgentName: "Other Agent",
      date: "2026-07-21",
      hour: 11,
      calls: 99,
      loggedInSeconds: 2400,
      talkSeconds: 900,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Agent Scope Team",
    });

    const data = await getDashboardData({ id: selfId, role: "agent", teamIds: [teamId] });

    expect(data.totals.calls).toBe(13);
    expect(data.agentRows).toHaveLength(1);
    expect(data.agentRows[0]?.profileId).toBe(selfId);
  });

  it("keeps inactive agents with historical metrics represented", async () => {
    const adminId = await createProfile({ role: "admin", name: "Inactive Admin" });
    const teamId = await createTeam("Inactive Team");
    const inactiveAgentId = await createProfile({
      role: "agent",
      name: "Inactive Historical Agent",
      accountStatus: "deactivated",
      active: false,
    });
    await addMembership({ profileId: inactiveAgentId, teamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: inactiveAgentId,
      sourceAgentName: "Inactive Historical Agent",
      date: "2026-07-21",
      hour: 12,
      calls: 19,
      loggedInSeconds: 3000,
      talkSeconds: 1200,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Inactive Team",
    });

    const data = await getDashboardData({ id: adminId, role: "admin", teamIds: [] });
    const inactiveRow = rowFor(data, inactiveAgentId);

    expect(inactiveRow?.calls).toBe(19);
    expect(inactiveRow?.accountStatus).toBe("deactivated");
    expect(inactiveRow?.hasMetrics).toBe(true);
  });

  it("shows no-data agents without changing KPI totals", async () => {
    const adminId = await createProfile({ role: "admin", name: "No Data Admin" });
    const teamId = await createTeam("No Data Team");
    const metricAgentId = await createProfile({ role: "agent", name: "Metric Agent" });
    const noDataAgentId = await createProfile({ role: "agent", name: "No Data Agent" });
    await addMembership({ profileId: metricAgentId, teamId, role: "agent" });
    await addMembership({ profileId: noDataAgentId, teamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: metricAgentId,
      sourceAgentName: "Metric Agent",
      date: "2026-07-21",
      hour: 13,
      calls: 29,
      loggedInSeconds: 3600,
      talkSeconds: 1400,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "No Data Team",
    });

    const hiddenNoData = await getDashboardData({
      id: "manager-no-data",
      role: "manager",
      teamIds: [teamId],
    });
    const shownNoData = await getDashboardData(
      { id: "manager-no-data", role: "manager", teamIds: [teamId] },
      { showAgentsWithNoData: true },
    );

    expect(hiddenNoData.agentRows.map((row) => row.profileId)).toEqual([
      metricAgentId,
    ]);
    expect(shownNoData.totals.calls).toBe(29);
    expect(rowFor(shownNoData, noDataAgentId)).toMatchObject({
      calls: 0,
      loggedInSeconds: 0,
      talkSeconds: 0,
      rowCount: 0,
      hasMetrics: false,
    });
    expect(shownNoData.reconciliation.callsMatch).toBe(true);
  });

  it("reconciles per-agent totals with global totals", async () => {
    const adminId = await createProfile({ role: "admin", name: "Reconcile Admin" });
    const teamId = await createTeam("Reconcile Team");
    const firstAgentId = await createProfile({ role: "agent", name: "Reconcile A" });
    const secondAgentId = await createProfile({ role: "agent", name: "Reconcile B" });
    await addMembership({ profileId: firstAgentId, teamId, role: "agent" });
    await addMembership({ profileId: secondAgentId, teamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: firstAgentId,
      sourceAgentName: "Reconcile A",
      date: "2026-07-21",
      hour: 14,
      calls: 7,
      loggedInSeconds: 1000,
      talkSeconds: 400,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Reconcile Team",
    });
    await addMetric({
      batchId,
      profileId: secondAgentId,
      sourceAgentName: "Reconcile B",
      date: "2026-07-21",
      hour: 14,
      calls: 11,
      loggedInSeconds: 2000,
      talkSeconds: 700,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Reconcile Team",
    });

    const data = await getDashboardData({
      id: "manager-reconcile",
      role: "manager",
      teamIds: [teamId],
    });

    expect(data.totals.calls).toBe(18);
    expect(data.reconciliation.agentTotals).toEqual({
      calls: 18,
      loggedInSeconds: 3000,
      talkSeconds: 1100,
    });
    expect(data.reconciliation.callsMatch).toBe(true);
    expect(data.reconciliation.loggedInSecondsMatch).toBe(true);
    expect(data.reconciliation.talkSecondsMatch).toBe(true);
  });

  it("uses historical team snapshots instead of moving old metrics after team changes", async () => {
    const adminId = await createProfile({ role: "admin", name: "History Admin" });
    const oldTeamId = await createTeam("Historical Team");
    const newTeamId = await createTeam("Current Team");
    const agentId = await createProfile({ role: "agent", name: "Moved Agent" });
    await addMembership({ profileId: agentId, teamId: newTeamId, role: "agent" });
    const batchId = await createBatch(adminId);

    await addMetric({
      batchId,
      profileId: agentId,
      sourceAgentName: "Moved Agent",
      date: "2026-07-21",
      hour: 15,
      calls: 41,
      loggedInSeconds: 3600,
      talkSeconds: 1600,
      teamIdSnapshot: oldTeamId,
      teamNameSnapshot: "Historical Team",
    });

    const oldTeamManager = await getDashboardData({
      id: "manager-old-team",
      role: "manager",
      teamIds: [oldTeamId],
    });
    const newTeamManager = await getDashboardData({
      id: "manager-new-team",
      role: "manager",
      teamIds: [newTeamId],
    });
    const newTeamWithNoData = await getDashboardData(
      { id: "manager-new-team", role: "manager", teamIds: [newTeamId] },
      { showAgentsWithNoData: true },
    );

    expect(oldTeamManager.totals.calls).toBe(41);
    expect(rowFor(oldTeamManager, agentId)?.teamName).toBe("Historical Team");
    expect(newTeamManager.totals.calls).toBe(0);
    expect(newTeamManager.agentRows).toEqual([]);
    expect(rowFor(newTeamWithNoData, agentId)).toMatchObject({
      calls: 0,
      teamName: "Current Team",
      hasMetrics: false,
    });
  });
});
