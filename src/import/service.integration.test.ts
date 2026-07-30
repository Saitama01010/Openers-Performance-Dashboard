import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

import { activeMappingKey, primaryMappingKey } from "@/admin/policy";
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
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { listActiveDialerMetrics } from "@/import/active-data";
import {
  createDialerPreviewBatch,
  getStoredImportPreview,
  publishDialerImportBatch,
  rejectDialerImportBatch,
  restoreDialerImportBatch,
  rollbackDialerImportBatch,
} from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];
const batchIds: string[] = [];

const header =
  "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls";
const dailyHeader =
  "Agent,Logged In (sec),Ready (sec),Talk (sec),Wrap (sec),Paused (sec),System Pause (sec),Net (sec),Calls";

function csvFor(input: {
  agentName: string;
  calls?: number;
  date?: string;
  hour?: number;
  loggedInSeconds?: number;
  talkSeconds?: number;
}) {
  return `${header}\n${input.agentName},${input.date ?? "2099-01-01"},${input.hour ?? 0},${input.loggedInSeconds ?? 3600},600,${input.talkSeconds ?? 1200},60,60,300,300,0,${input.calls ?? 5}\n`;
}

function malformedCsv(agentName: string) {
  return `${header}\n"${agentName},2099-01-01,0,3600,600,1200,60,60,300,300,0,5\n`;
}

function dailyCsvFor(input: {
  agentName: string;
  calls?: number;
  loggedInSeconds?: number;
  systemPauseSeconds?: number;
  netSeconds?: number;
}) {
  return `${dailyHeader}\n${input.agentName},${input.loggedInSeconds ?? 3600},600,1200,60,300,${input.systemPauseSeconds ?? 45},${input.netSeconds ?? 3300},${input.calls ?? 5}\n`;
}

async function createTeam(name: string) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({ id, name, active: true });
  return id;
}

async function createActor(
  role: "admin" | "manager" | "agent",
  assignedTeamIds: string[] = [],
): Promise<Actor> {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Import ${role} ${id.slice(0, 8)}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });

  return { id, role, teamIds: assignedTeamIds };
}

async function createMappedAgent(teamId: string, label: string) {
  const id = newId();
  const dialerName = `${label} ${id.slice(0, 8)}`;
  const normalized = dialerName.toLowerCase();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Agent ${label}`,
    role: "agent",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  await getDb().insert(teamMemberships).values({
    id: newId(),
    teamId,
    profileId: id,
    role: "agent",
    active: true,
  });
  await getDb().insert(sourceUserMappings).values({
    id: newId(),
    source: "dialer",
    sourceAgentName: dialerName,
    normalizedAgentName: normalized,
    activeMappingKey: activeMappingKey("dialer", normalized),
    primaryMappingKey: primaryMappingKey("dialer", id),
    profileId: id,
    active: true,
    isPrimary: true,
  });

  return { id, dialerName };
}

async function upload(input: {
  actor: Actor;
  fileName: string;
  fileContent: string;
  reportingDate?: string;
}) {
  const result = await createDialerPreviewBatch({
    actor: input.actor,
    source: "dialer",
    fileName: input.fileName,
    fileContent: input.fileContent,
    selectedReportingDate: input.reportingDate ?? "2099-01-01",
  });
  batchIds.push(result.batchId);
  return result;
}

async function batchStatus(batchId: string) {
  const [batch] = await getDb()
    .select({ status: dialerImportBatches.status })
    .from(dialerImportBatches)
    .where(eq(dialerImportBatches.id, batchId));
  return batch?.status;
}

async function activeCalls(agentProfileId: string, date = "2099-01-01") {
  const rows = await listActiveDialerMetrics();
  return rows
    .filter(
      (row) =>
        row.agentProfileId === agentProfileId && row.metricDate === date,
    )
    .reduce((total, row) => total + row.calls, 0);
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

  if (createdProfiles.length > 0) {
    await getDb()
      .delete(auditLogs)
      .where(
        or(
          inArray(auditLogs.actorProfileId, createdProfiles),
          inArray(auditLogs.entityId, [...createdProfiles, ...batches]),
        ),
      );
    await getDb()
      .delete(sourceUserMappings)
      .where(inArray(sourceUserMappings.profileId, createdProfiles));
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

describe("versioned dialer import service integration", () => {
  it("requires and persists the selected date for daily Agent Hours imports", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Daily Date Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Daily Date Agent");
    const fileContent = dailyCsvFor({ agentName: agent.dialerName });

    await expect(
      createDialerPreviewBatch({
        actor: admin,
        source: "dialer",
        fileName: "agent-hours.csv",
        fileContent,
      }),
    ).rejects.toMatchObject({
      code: "invalid_reporting_date",
      message:
        "Choose the reporting date represented by this Agent Hours file.",
    });

    const draft = await upload({
      actor: admin,
      fileName: "agent-hours.csv",
      fileContent,
      reportingDate: "2099-01-03",
    });
    const [batch] = await getDb()
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, draft.batchId));
    const [metric] = await getDb()
      .select()
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.batchId, draft.batchId));

    expect(batch).toMatchObject({
      granularity: "daily",
      selectedReportingDate: "2099-01-03",
      reportingStartDate: "2099-01-03",
      reportingEndDate: "2099-01-03",
    });
    expect(metric).toMatchObject({
      granularity: "daily",
      metricDate: "2099-01-03",
      metricHour: null,
      metricKey: "daily",
      systemPauseSeconds: 45,
      netSeconds: 3300,
      ringingSeconds: null,
      idleSeconds: null,
      untrackedSeconds: null,
    });

    const revalidated = await getStoredImportPreview({
      actor: admin,
      batchId: draft.batchId,
    });
    expect(revalidated?.preview.selectedReportingDate).toBe("2099-01-03");
    expect(
      revalidated?.preview.rows.every(
        (row) => row.date === "2099-01-03" && row.hour === null,
      ),
    ).toBe(true);
  });

  it("versions daily snapshots once per date and rolls back to the previous daily total", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Daily Version Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Daily Version Agent");
    const first = await upload({
      actor: admin,
      fileName: "daily-version-1.csv",
      fileContent: dailyCsvFor({ agentName: agent.dialerName, calls: 5 }),
      reportingDate: "2099-01-04",
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const second = await upload({
      actor: admin,
      fileName: "daily-version-2.csv",
      fileContent: dailyCsvFor({ agentName: agent.dialerName, calls: 8 }),
      reportingDate: "2099-01-04",
    });
    await publishDialerImportBatch({ actor: admin, batchId: second.batchId });

    expect(await activeCalls(agent.id, "2099-01-04")).toBe(8);
    const versions = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(
        inArray(dialerDatasetVersions.importBatchId, [
          first.batchId,
          second.batchId,
        ]),
      );
    expect(versions.map((version) => version.versionNumber).sort()).toEqual([
      1, 2,
    ]);
    expect(
      versions.filter((version) => version.status === "active"),
    ).toHaveLength(1);

    await rollbackDialerImportBatch({
      actor: admin,
      batchId: second.batchId,
      reason: "Restore the previous verified daily totals.",
    });
    expect(await activeCalls(agent.id, "2099-01-04")).toBe(5);
  });

  it("supersedes an hourly version with a daily version in the same intended scope", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Mixed Granularity Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Mixed Granularity Agent");
    const hourly = await upload({
      actor: admin,
      fileName: "hourly.csv",
      fileContent: csvFor({
        agentName: agent.dialerName,
        calls: 4,
        date: "2099-01-05",
      }),
      reportingDate: "2099-01-05",
    });
    await publishDialerImportBatch({ actor: admin, batchId: hourly.batchId });
    const daily = await upload({
      actor: admin,
      fileName: "daily.csv",
      fileContent: dailyCsvFor({ agentName: agent.dialerName, calls: 9 }),
      reportingDate: "2099-01-05",
    });
    await publishDialerImportBatch({ actor: admin, batchId: daily.batchId });

    expect(await activeCalls(agent.id, "2099-01-05")).toBe(9);
    expect(await batchStatus(hourly.batchId)).toBe("superseded");
    expect(await batchStatus(daily.batchId)).toBe("active");
  });

  it("stores a valid CSV as a permanent ready draft without changing live data", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Draft Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Draft Agent");
    const draft = await upload({
      actor: admin,
      fileName: "draft.csv",
      fileContent: csvFor({ agentName: agent.dialerName }),
    });

    expect(draft.status).toBe("ready_to_publish");
    expect(draft.validation.errors).toEqual([]);
    expect(await activeCalls(agent.id)).toBe(0);

    const [batch] = await getDb()
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, draft.batchId));
    const staged = await getDb()
      .select()
      .from(dialerImportRows)
      .where(eq(dialerImportRows.batchId, draft.batchId));
    const metrics = await getDb()
      .select()
      .from(dialerAgentHourlyMetrics)
      .where(eq(dialerAgentHourlyMetrics.batchId, draft.batchId));

    expect(batch.rawFileContent).toContain(agent.dialerName);
    expect(batch.fileSizeBytes).toBeGreaterThan(0);
    expect(staged).toHaveLength(1);
    expect(metrics).toHaveLength(1);
  });

  it("retains invalid headers as validation failure and never exposes staged data", async () => {
    const admin = await createActor("admin");
    const draft = await upload({
      actor: admin,
      fileName: "invalid-headers.csv",
      fileContent: "Agent,Date\nNobody,2099-01-01\n",
    });

    expect(draft.status).toBe("validation_failed");
    expect(draft.validation.errors.join(" ")).toContain(
      "Missing required CSV headers",
    );
    expect(await batchStatus(draft.batchId)).toBe("validation_failed");
  });

  it("publishes the first version atomically", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Publish Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Publish Agent");
    const draft = await upload({
      actor: admin,
      fileName: "first.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });

    await publishDialerImportBatch({ actor: admin, batchId: draft.batchId });

    expect(await batchStatus(draft.batchId)).toBe("active");
    expect(await activeCalls(agent.id)).toBe(5);

    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.teamId, teamId));
    const [version] = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, draft.batchId));

    expect(scope.activeVersionId).toBe(version.id);
    expect(version.status).toBe("active");
  });

  it("publishing a second snapshot supersedes the previous version", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Supersede Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Supersede Agent");
    const first = await upload({
      actor: admin,
      fileName: "version-1.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const second = await upload({
      actor: admin,
      fileName: "version-2.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 7 }),
    });

    await publishDialerImportBatch({ actor: admin, batchId: second.batchId });

    expect(await activeCalls(agent.id)).toBe(7);
    expect(await batchStatus(first.batchId)).toBe("superseded");
    expect(await batchStatus(second.batchId)).toBe("active");
  });

  it("rollback reactivates the previous valid version", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Rollback Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Rollback Agent");
    const first = await upload({
      actor: admin,
      fileName: "rollback-1.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const second = await upload({
      actor: admin,
      fileName: "rollback-2.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 8 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: second.batchId });

    await rollbackDialerImportBatch({
      actor: admin,
      batchId: second.batchId,
      reason: "The second file contains incorrect values.",
    });

    expect(await activeCalls(agent.id)).toBe(5);
    expect(await batchStatus(first.batchId)).toBe("active");
    expect(await batchStatus(second.batchId)).toBe("rolled_back");
  });

  it("restores a selected historical version without deleting later versions", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Restore Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Restore Agent");
    const first = await upload({
      actor: admin,
      fileName: "restore-1.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 4 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const second = await upload({
      actor: admin,
      fileName: "restore-2.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 9 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: second.batchId });
    await rollbackDialerImportBatch({
      actor: admin,
      batchId: second.batchId,
      reason: "Temporarily restore the earlier values.",
    });

    await restoreDialerImportBatch({
      actor: admin,
      batchId: second.batchId,
      reason: "The corrected second file has now been verified.",
    });

    expect(await activeCalls(agent.id)).toBe(9);
    const versions = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(
        inArray(dialerDatasetVersions.importBatchId, [
          first.batchId,
          second.batchId,
        ]),
      );
    expect(versions).toHaveLength(2);
  });

  it("isolates rollback by team and reporting date", async () => {
    const admin = await createActor("admin");
    const firstTeam = await createTeam(`Isolation A ${newId()}`);
    const secondTeam = await createTeam(`Isolation B ${newId()}`);
    const firstAgent = await createMappedAgent(firstTeam, "Isolation A");
    const secondAgent = await createMappedAgent(secondTeam, "Isolation B");
    const firstBase = await upload({
      actor: admin,
      fileName: "isolation-a-1.csv",
      fileContent: csvFor({ agentName: firstAgent.dialerName, calls: 2 }),
    });
    const secondBase = await upload({
      actor: admin,
      fileName: "isolation-b-1.csv",
      fileContent: csvFor({
        agentName: secondAgent.dialerName,
        calls: 3,
        date: "2099-01-02",
      }),
      reportingDate: "2099-01-02",
    });
    await publishDialerImportBatch({ actor: admin, batchId: firstBase.batchId });
    await publishDialerImportBatch({ actor: admin, batchId: secondBase.batchId });
    const firstChanged = await upload({
      actor: admin,
      fileName: "isolation-a-2.csv",
      fileContent: csvFor({ agentName: firstAgent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({
      actor: admin,
      batchId: firstChanged.batchId,
    });

    await rollbackDialerImportBatch({
      actor: admin,
      batchId: firstChanged.batchId,
      reason: "Undo only the first team and date.",
    });

    expect(await activeCalls(firstAgent.id)).toBe(2);
    expect(await activeCalls(secondAgent.id, "2099-01-02")).toBe(3);
  });

  it("allows an administrator to publish an exact duplicate while auditing the warnings", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Duplicate Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Duplicate Agent");
    const fileContent = csvFor({ agentName: agent.dialerName, calls: 5 });
    const first = await upload({
      actor: admin,
      fileName: "duplicate.csv",
      fileContent,
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const duplicate = await upload({
      actor: admin,
      fileName: "duplicate-copy.csv",
      fileContent,
    });

    expect(duplicate.validation.warnings.join(" ")).toContain(
      "already uploaded",
    );
    await publishDialerImportBatch({
      actor: admin,
      batchId: duplicate.batchId,
    });

    expect(await batchStatus(duplicate.batchId)).toBe("active");
    const logs = await getDb()
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, duplicate.batchId));
    expect(
      logs.find((log) => log.action === "dialer_import.warnings_reviewed")
        ?.metadata,
    ).toMatchObject({
      warningCount: duplicate.validation.warnings.length,
      warnings: duplicate.validation.warnings,
    });
  });

  it("does not flag identical bytes when the parsed dataset scope changed", async () => {
    const admin = await createActor("admin");
    const firstTeamId = await createTeam(`Duplicate Scope A ${newId()}`);
    const secondTeamId = await createTeam(`Duplicate Scope B ${newId()}`);
    const agent = await createMappedAgent(
      firstTeamId,
      "Duplicate Scope Agent",
    );
    const fileContent = csvFor({ agentName: agent.dialerName });

    await upload({
      actor: admin,
      fileName: "same-bytes-first-scope.csv",
      fileContent,
    });
    await getDb()
      .update(teamMemberships)
      .set({ active: false, endedAt: new Date() })
      .where(
        and(
          eq(teamMemberships.profileId, agent.id),
          eq(teamMemberships.teamId, firstTeamId),
        ),
      );
    await getDb().insert(teamMemberships).values({
      id: newId(),
      teamId: secondTeamId,
      profileId: agent.id,
      role: "agent",
      active: true,
    });

    const second = await upload({
      actor: admin,
      fileName: "same-bytes-second-scope.csv",
      fileContent,
    });

    expect(second.preview.duplicateFile).toBe(false);
    expect(second.validation.warnings.join(" ")).not.toContain(
      "already uploaded",
    );
  });

  it("does not let managers override warnings", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Manager Warning ${newId()}`);
    const manager = await createActor("manager", [teamId]);
    const agent = await createMappedAgent(teamId, "Manager Warning Agent");
    const fileContent = csvFor({ agentName: agent.dialerName });
    const first = await upload({
      actor: admin,
      fileName: "manager-warning-base.csv",
      fileContent,
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const duplicate = await upload({
      actor: manager,
      fileName: "manager-warning-copy.csv",
      fileContent,
    });

    await expect(
      publishDialerImportBatch({
        actor: manager,
        batchId: duplicate.batchId,
      }),
    ).rejects.toThrow("Only an administrator");
  });

  it("rejects unauthorized upload, publish, and rollback callers", async () => {
    const admin = await createActor("admin");
    const agentActor = await createActor("agent");
    const manager = await createActor("manager");
    const teamId = await createTeam(`Authorization Team ${newId()}`);
    const mapped = await createMappedAgent(teamId, "Authorization Agent");

    await expect(
      createDialerPreviewBatch({
        actor: agentActor,
        source: "dialer",
        fileName: "agent-upload.csv",
        fileContent: csvFor({ agentName: mapped.dialerName }),
      }),
    ).rejects.toThrow("Agents cannot upload");

    const draft = await upload({
      actor: admin,
      fileName: "authorization.csv",
      fileContent: csvFor({ agentName: mapped.dialerName }),
    });
    await expect(
      publishDialerImportBatch({ actor: manager, batchId: draft.batchId }),
    ).rejects.toThrow("does not belong");
    await expect(
      rollbackDialerImportBatch({
        actor: agentActor,
        batchId: draft.batchId,
        reason: "Unauthorized rollback attempt.",
      }),
    ).rejects.toThrow("Administrator access");
  });

  it("prevents blocking row errors from publishing", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Blocking Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Blocking Agent");
    const draft = await upload({
      actor: admin,
      fileName: "blocking.csv",
      fileContent: csvFor({ agentName: agent.dialerName, hour: 25 }),
    });

    expect(draft.validation.errors.join(" ")).toContain(
      "blocking validation errors",
    );
    await expect(
      publishDialerImportBatch({ actor: admin, batchId: draft.batchId }),
    ).rejects.toThrow("Blocking validation errors");
    expect(await activeCalls(agent.id)).toBe(0);
  });

  it("allows an administrator to publish anomaly warnings without collecting a reason", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Warning Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Warning Agent");
    const first = await upload({
      actor: admin,
      fileName: "warning-base.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    const anomaly = await upload({
      actor: admin,
      fileName: "warning-anomaly.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 50 }),
    });

    expect(anomaly.validation.warnings.join(" ")).toContain(
      "Total calls increased",
    );
    await publishDialerImportBatch({
      actor: admin,
      batchId: anomaly.batchId,
    });
    expect(await activeCalls(agent.id)).toBe(50);
  });

  it("serializes concurrent publication so only one draft can become active", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Concurrency Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Concurrency Agent");
    const base = await upload({
      actor: admin,
      fileName: "concurrency-base.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: base.batchId });
    const left = await upload({
      actor: admin,
      fileName: "concurrency-left.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 6 }),
    });
    const right = await upload({
      actor: admin,
      fileName: "concurrency-right.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 7 }),
    });

    const results = await Promise.allSettled([
      publishDialerImportBatch({ actor: admin, batchId: left.batchId }),
      publishDialerImportBatch({ actor: admin, batchId: right.batchId }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const [scope] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.teamId, teamId));
    const activeVersions = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(
        and(
          eq(dialerDatasetVersions.scopeKey, scope.scopeKey),
          eq(dialerDatasetVersions.status, "active"),
        ),
      );
    expect(activeVersions).toHaveLength(1);
  });

  it("rolls back pointer and version changes when a publication transaction fails", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Transaction Failure ${newId()}`);
    const agent = await createMappedAgent(teamId, "Transaction Failure Agent");
    const base = await upload({
      actor: admin,
      fileName: "transaction-base.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 5 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: base.batchId });
    const draft = await upload({
      actor: admin,
      fileName: "transaction-draft.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 6 }),
    });
    const [scopeBefore] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.teamId, teamId));
    const [draftVersion] = await getDb()
      .select()
      .from(dialerDatasetVersions)
      .where(eq(dialerDatasetVersions.importBatchId, draft.batchId));

    await expect(
      getDb().transaction(async (tx) => {
        await tx
          .update(dialerDatasetVersions)
          .set({ status: "superseded" })
          .where(eq(dialerDatasetVersions.id, scopeBefore.activeVersionId!));
        await tx
          .update(dialerDatasetVersions)
          .set({ status: "active" })
          .where(eq(dialerDatasetVersions.id, draftVersion.id));
        await tx
          .update(dialerDatasetScopes)
          .set({ activeVersionId: draftVersion.id })
          .where(eq(dialerDatasetScopes.scopeKey, scopeBefore.scopeKey));
        throw new Error("Simulated database failure after pointer update.");
      }),
    ).rejects.toThrow("Simulated database failure");

    const [scopeAfter] = await getDb()
      .select()
      .from(dialerDatasetScopes)
      .where(eq(dialerDatasetScopes.scopeKey, scopeBefore.scopeKey));
    const versionsAfter = await getDb()
      .select({
        id: dialerDatasetVersions.id,
        status: dialerDatasetVersions.status,
      })
      .from(dialerDatasetVersions)
      .where(
        inArray(dialerDatasetVersions.id, [
          scopeBefore.activeVersionId!,
          draftVersion.id,
        ]),
      );

    expect(scopeAfter.activeVersionId).toBe(scopeBefore.activeVersionId);
    expect(
      versionsAfter.find(
        (version) => version.id === scopeBefore.activeVersionId,
      )?.status,
    ).toBe("active");
    expect(
      versionsAfter.find((version) => version.id === draftVersion.id)?.status,
    ).toBe("draft");
    expect(await activeCalls(agent.id)).toBe(5);
  });

  it("dashboard-facing active queries exclude unpublished and superseded rows", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Query Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Query Agent");
    const first = await upload({
      actor: admin,
      fileName: "query-1.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 3 }),
    });
    const second = await upload({
      actor: admin,
      fileName: "query-2.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 8 }),
    });

    expect(await activeCalls(agent.id)).toBe(0);
    await publishDialerImportBatch({ actor: admin, batchId: first.batchId });
    expect(await activeCalls(agent.id)).toBe(3);
    await publishDialerImportBatch({ actor: admin, batchId: second.batchId });
    expect(await activeCalls(agent.id)).toBe(8);
  });

  it("retains malformed uploads as failed validation without changing active data", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Malformed Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Malformed Agent");
    const base = await upload({
      actor: admin,
      fileName: "malformed-base.csv",
      fileContent: csvFor({ agentName: agent.dialerName, calls: 4 }),
    });
    await publishDialerImportBatch({ actor: admin, batchId: base.batchId });
    const malformed = await upload({
      actor: admin,
      fileName: "malformed.csv",
      fileContent: malformedCsv(agent.dialerName),
    });

    expect(malformed.status).toBe("validation_failed");
    expect(malformed.validation.errors.join(" ")).toContain("malformed");
    expect(await activeCalls(agent.id)).toBe(4);
  });

  it("rejects a draft without deleting its file, staged rows, or history", async () => {
    const admin = await createActor("admin");
    const teamId = await createTeam(`Reject Team ${newId()}`);
    const agent = await createMappedAgent(teamId, "Reject Agent");
    const draft = await upload({
      actor: admin,
      fileName: "reject.csv",
      fileContent: csvFor({ agentName: agent.dialerName }),
    });

    await rejectDialerImportBatch({
      actor: admin,
      batchId: draft.batchId,
      reason: "The administrator selected the wrong reporting file.",
    });

    expect(await batchStatus(draft.batchId)).toBe("rejected");
    const [batch] = await getDb()
      .select()
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.id, draft.batchId));
    const staged = await getDb()
      .select()
      .from(dialerImportRows)
      .where(eq(dialerImportRows.batchId, draft.batchId));
    expect(batch.rawFileContent).toContain(agent.dialerName);
    expect(staged).toHaveLength(1);
    expect(await activeCalls(agent.id)).toBe(0);
  });
});
