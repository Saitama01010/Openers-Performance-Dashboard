import "dotenv/config";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray, or } from "drizzle-orm";

import {
  createTeam,
  getAdminReferenceData,
  listTeams,
} from "@/admin/data";
import {
  archiveTeamsForCleanup,
  inspectTeamCleanup,
  teamCleanupConfirmation,
  teamCleanupDigest,
} from "@/admin/team-cleanup";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  organizations,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];
const importBatchIds: string[] = [];
const versionIds: string[] = [];
const metricIds: string[] = [];
const importRowIds: string[] = [];
let admin: Actor;

beforeEach(async () => {
  const organizationId = newId();
  const foreignOrganizationId = newId();
  const adminId = newId();
  organizationIds.push(organizationId, foreignOrganizationId);
  profileIds.push(adminId);
  await getDb().insert(organizations).values([
    { id: organizationId, name: `Organization ${organizationId}` },
    { id: foreignOrganizationId, name: `Organization ${foreignOrganizationId}` },
  ]);
  await getDb().insert(profiles).values({
    id: adminId,
    organizationId,
    email: `${adminId}@example.test`,
    name: "Team Security Admin",
    role: "admin",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  admin = { id: adminId, role: "admin", teamIds: [], organizationId };
});

afterEach(async () => {
  if (metricIds.length > 0) {
    await getDb().delete(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.id, metricIds.splice(0)));
  }
  if (importRowIds.length > 0) {
    await getDb().delete(dialerImportRows)
      .where(inArray(dialerImportRows.id, importRowIds.splice(0)));
  }
  if (versionIds.length > 0) {
    await getDb().delete(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.id, versionIds.splice(0)));
  }
  if (importBatchIds.length > 0) {
    await getDb().delete(dialerImportBatches)
      .where(inArray(dialerImportBatches.id, importBatchIds.splice(0)));
  }
  if (profileIds.length > 0 || teamIds.length > 0) {
    await getDb()
      .delete(auditLogs)
      .where(or(
        profileIds.length > 0 ? inArray(auditLogs.actorProfileId, profileIds) : undefined,
        teamIds.length > 0 ? inArray(auditLogs.entityId, teamIds) : undefined,
      ));
  }
  if (teamIds.length > 0) {
    await getDb()
      .delete(teamMemberships)
      .where(inArray(teamMemberships.teamId, teamIds));
    await getDb().delete(teams).where(inArray(teams.id, teamIds.splice(0)));
  }
  if (profileIds.length > 0) {
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  }
  if (organizationIds.length > 0) {
    await getDb()
      .delete(organizations)
      .where(inArray(organizations.id, organizationIds.splice(0)));
  }
});

describe("team production visibility and mutation safety", () => {
  it("excludes foreign, inactive, archived, and deleted teams from listings and dropdowns", async () => {
    const visibleId = newId();
    const inactiveId = newId();
    const archivedId = newId();
    const deletedId = newId();
    const foreignId = newId();
    teamIds.push(visibleId, inactiveId, archivedId, deletedId, foreignId);
    await getDb().insert(teams).values([
      {
        id: visibleId,
        organizationId: admin.organizationId,
        name: `Visible ${visibleId}`,
        active: true,
      },
      {
        id: inactiveId,
        organizationId: admin.organizationId,
        name: `Inactive ${inactiveId}`,
        active: false,
      },
      {
        id: archivedId,
        organizationId: admin.organizationId,
        name: `Archived ${archivedId}`,
        active: true,
        archivedAt: new Date(),
      },
      {
        id: deletedId,
        organizationId: admin.organizationId,
        name: `Deleted ${deletedId}`,
        active: true,
        deletedAt: new Date(),
      },
      {
        id: foreignId,
        organizationId: organizationIds[1],
        name: `Foreign ${foreignId}`,
        active: true,
      },
    ]);

    const listed = await listTeams(admin);
    const references = await getAdminReferenceData(admin);
    expect(listed.teams.map((team) => team.id)).toEqual([visibleId]);
    expect(references.teams.map((team) => team.id)).toEqual([visibleId]);
  });

  it("rejects non-admin creation before writing", async () => {
    await expect(
      createTeam({ ...admin, role: "manager" }, "Blocked Team"),
    ).rejects.toThrow("Forbidden");
  });

  it("allows only one winner for concurrent duplicate creation", async () => {
    const name = `Concurrent Unique ${newId()}`;
    const outcomes = await Promise.allSettled([
      createTeam(admin, name),
      createTeam(admin, name),
    ]);
    const createdIds = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : [],
    );
    teamIds.push(...createdIds);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({
        message: "A team with this name already exists.",
      }),
    });
  });

  it("inspects explicit cleanup IDs without mutating them", async () => {
    const teamId = await createTeam(admin, `Cleanup Dry Run ${newId()}`);
    teamIds.push(teamId);

    const summary = await inspectTeamCleanup({
      organizationId: admin.organizationId!,
      teamIds: [teamId],
    });
    const [unchanged] = await getDb()
      .select()
      .from(teams)
      .where(inArray(teams.id, [teamId]));

    expect(summary).toEqual([
      expect.objectContaining({ teamId, historicalMemberships: 0, metrics: 0 }),
    ]);
    expect(unchanged.active).toBe(true);
    expect(unchanged.archivedAt).toBeNull();
    expect(unchanged.deletedAt).toBeNull();
  });

  it("requires exact confirmation before transactionally archiving explicit IDs", async () => {
    const teamId = await createTeam(admin, `Cleanup Execute ${newId()}`);
    teamIds.push(teamId);
    const memberId = newId();
    profileIds.push(memberId);
    await getDb().insert(profiles).values({
      id: memberId,
      organizationId: admin.organizationId,
      email: `${memberId}@example.test`,
      name: "Cleanup Member",
      role: "agent",
      active: true,
      accountStatus: "active",
      passwordHash: "test-hash",
    });
    const membershipId = newId();
    await getDb().insert(teamMemberships).values({
      id: membershipId,
      profileId: memberId,
      teamId,
      role: "agent",
      active: true,
    });
    const importBatchId = newId();
    const versionId = newId();
    const metricId = newId();
    const importRowId = newId();
    importBatchIds.push(importBatchId);
    versionIds.push(versionId);
    metricIds.push(metricId);
    importRowIds.push(importRowId);
    await getDb().insert(dialerImportBatches).values({
      id: importBatchId,
      source: "dialer",
      fileName: `cleanup-${importBatchId}.csv`,
      fileHash: importBatchId.replaceAll("-", "").padEnd(64, "0"),
      uploadedById: admin.id,
      rawFileContent: "Agent,Calls\nCleanup Member,1",
    });
    await getDb().insert(dialerDatasetVersions).values({
      id: versionId,
      importBatchId,
      scopeKey: `cleanup|${teamId}|${versionId}`,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-08-01",
      teamId,
      versionNumber: 1,
    });
    await getDb().insert(dialerAgentHourlyMetrics).values({
      id: metricId,
      source: "dialer",
      sourceAgentName: "Cleanup Member",
      agentProfileId: memberId,
      batchId: importBatchId,
      versionId,
      metricDate: "2099-08-01",
      metricHour: 9,
      metricKey: "09:00",
      calls: 1,
      teamIdSnapshot: teamId,
      teamNameSnapshot: "Cleanup Team",
      rowHash: metricId.replaceAll("-", "").padEnd(64, "0"),
    });
    await getDb().insert(dialerImportRows).values({
      id: importRowId,
      batchId: importBatchId,
      versionId,
      rowNumber: 1,
      sourceAgentName: "Cleanup Member",
      normalizedAgentName: "cleanup member",
      matchedAgentProfileId: memberId,
      metricDate: "2099-08-01",
      metricHour: 9,
      calls: 1,
      teamIdSnapshot: teamId,
      matchingStatus: "mapped",
      validationStatus: "valid",
    });
    const dryRun = await inspectTeamCleanup({
      organizationId: admin.organizationId!,
      teamIds: [teamId],
    });
    expect(dryRun[0]).toMatchObject({ imports: 1, metrics: 1, importRows: 1 });
    const expectedDigest = teamCleanupDigest(dryRun);
    const confirmation = teamCleanupConfirmation({
      organizationId: admin.organizationId!,
      expectedCount: 1,
      expectedDigest,
    });

    await expect(
      archiveTeamsForCleanup({
        actorId: admin.id,
        confirmation: "ARCHIVE:wrong-id",
        expectedCount: 1,
        expectedDigest,
        organizationId: admin.organizationId!,
        teamIds: [teamId],
      }),
    ).rejects.toThrow("Confirmation must exactly equal");

    await archiveTeamsForCleanup({
      actorId: admin.id,
      confirmation,
      expectedCount: 1,
      expectedDigest,
      organizationId: admin.organizationId!,
      teamIds: [teamId],
    });
    const [archived] = await getDb()
      .select()
      .from(teams)
      .where(inArray(teams.id, [teamId]));
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.deletedAt).toBeNull();
    const [endedMembership] = await getDb()
      .select()
      .from(teamMemberships)
      .where(inArray(teamMemberships.id, [membershipId]));
    expect(endedMembership.active).toBe(false);
    expect(endedMembership.endedAt).toBeInstanceOf(Date);
    expect(await getDb().select({ id: dialerAgentHourlyMetrics.id })
      .from(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.id, [metricId]))).toHaveLength(1);
    expect(await getDb().select({ id: dialerImportRows.id })
      .from(dialerImportRows)
      .where(inArray(dialerImportRows.id, [importRowId]))).toHaveLength(1);
  });

  it("invalidates cleanup approval when dependency counts change", async () => {
    const teamId = await createTeam(admin, `Cleanup Changed ${newId()}`);
    teamIds.push(teamId);
    const dryRun = await inspectTeamCleanup({
      organizationId: admin.organizationId!,
      teamIds: [teamId],
    });
    const expectedDigest = teamCleanupDigest(dryRun);
    const confirmation = teamCleanupConfirmation({
      organizationId: admin.organizationId!,
      expectedCount: 1,
      expectedDigest,
    });
    const memberId = newId();
    profileIds.push(memberId);
    await getDb().insert(profiles).values({
      id: memberId,
      organizationId: admin.organizationId,
      email: `${memberId}@example.test`,
      name: "Changed Cleanup Member",
      role: "agent",
      active: true,
      accountStatus: "active",
      passwordHash: "test-hash",
    });
    await getDb().insert(teamMemberships).values({
      id: newId(),
      profileId: memberId,
      teamId,
      role: "agent",
      active: true,
    });

    await expect(archiveTeamsForCleanup({
      actorId: admin.id,
      confirmation,
      expectedCount: 1,
      expectedDigest,
      organizationId: admin.organizationId!,
      teamIds: [teamId],
    })).rejects.toThrow("dependency counts changed");
  });
});
