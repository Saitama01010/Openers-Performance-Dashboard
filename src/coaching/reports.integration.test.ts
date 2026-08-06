import "@/test/integration-env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("server-only", () => ({}));

import type { Actor } from "@/auth/authorization";
import {
  acknowledgeCoachingReport,
  finalizeCoachingReport,
  listCoachingReports,
  publishCoachingReport,
  saveCoachingReport,
} from "@/coaching/reports";
import { getDb, getPool } from "@/db";
import {
  auditLogs,
  coachingReportRevisions,
  coachingReports,
  coachingRubricTemplates,
  coachingSessionParticipants,
  coachingSessions,
  organizations,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";

const suffix = randomUUID().slice(0, 8);
const ids = {
  organization: `report-org-${suffix}`,
  east: `report-east-${suffix}`,
  west: `report-west-${suffix}`,
  admin: `report-admin-${suffix}`,
  manager: `report-manager-${suffix}`,
  eastAgent: `report-east-agent-${suffix}`,
  westAgent: `report-west-agent-${suffix}`,
  eastSession: `report-east-session-${suffix}`,
  westSession: `report-west-session-${suffix}`,
  template: `report-template-${suffix}`,
};
const profileIds = [ids.admin, ids.manager, ids.eastAgent, ids.westAgent];
const manager: Actor = { id: ids.manager, role: "manager", teamIds: [ids.east], organizationId: ids.organization };
const agent: Actor = { id: ids.eastAgent, role: "agent", teamIds: [ids.east], organizationId: ids.organization };
const admin: Actor = { id: ids.admin, role: "admin", teamIds: [], organizationId: ids.organization };
const westAgent: Actor = { id: ids.westAgent, role: "agent", teamIds: [ids.west], organizationId: ids.organization };

describe("coaching rubric report lifecycle", () => {
  beforeAll(async () => {
    await getDb().insert(organizations).values({ id: ids.organization, name: `Reports ${suffix}` });
    await getDb().insert(teams).values([
      { id: ids.east, organizationId: ids.organization, name: `East ${suffix}` },
      { id: ids.west, organizationId: ids.organization, name: `West ${suffix}` },
    ]);
    await getDb().insert(profiles).values([
      { id: ids.admin, organizationId: ids.organization, name: "Admin", email: `${ids.admin}@example.com`, role: "admin", accountStatus: "active" },
      { id: ids.manager, organizationId: ids.organization, name: "Manager", email: `${ids.manager}@example.com`, role: "manager", accountStatus: "active" },
      { id: ids.eastAgent, organizationId: ids.organization, name: "East Agent", email: `${ids.eastAgent}@example.com`, role: "agent", accountStatus: "active" },
      { id: ids.westAgent, organizationId: ids.organization, name: "West Agent", email: `${ids.westAgent}@example.com`, role: "agent", accountStatus: "active" },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: randomUUID(), teamId: ids.east, profileId: ids.manager, role: "manager" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.eastAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.west, profileId: ids.westAgent, role: "agent" },
    ]);
    await getDb().insert(coachingSessions).values([
      { id: ids.eastSession, organizationId: ids.organization, createdByProfileId: ids.manager, coachProfileId: ids.manager, category: "performance", sessionDate: "2026-08-06" },
      { id: ids.westSession, organizationId: ids.organization, createdByProfileId: ids.admin, coachProfileId: ids.admin, category: "performance", sessionDate: "2026-08-06" },
    ]);
    await getDb().insert(coachingSessionParticipants).values([
      { id: randomUUID(), sessionId: ids.eastSession, agentProfileId: ids.eastAgent, teamIdSnapshot: ids.east, teamNameSnapshot: "East" },
      { id: randomUUID(), sessionId: ids.westSession, agentProfileId: ids.westAgent, teamIdSnapshot: ids.west, teamNameSnapshot: "West" },
    ]);
    await getDb().insert(coachingRubricTemplates).values({
      id: ids.template,
      organizationId: ids.organization,
      name: "Quality",
      version: 1,
      active: true,
      sections: [{ id: "quality", label: "Quality", criteria: [{ id: "opening", label: "Opening", maximumScore: 5, required: true }] }],
      createdById: ids.admin,
    });
  });

  afterAll(async () => {
    const reportIds = (await getDb().select({ id: coachingReports.id }).from(coachingReports).where(eq(coachingReports.organizationId, ids.organization))).map((row) => row.id);
    if (reportIds.length) await getDb().delete(coachingReportRevisions).where(inArray(coachingReportRevisions.reportId, reportIds));
    await getDb().delete(coachingReports).where(eq(coachingReports.organizationId, ids.organization));
    await getDb().delete(coachingRubricTemplates).where(eq(coachingRubricTemplates.organizationId, ids.organization));
    await getDb().delete(coachingSessionParticipants).where(inArray(coachingSessionParticipants.sessionId, [ids.eastSession, ids.westSession]));
    await getDb().delete(coachingSessions).where(inArray(coachingSessions.id, [ids.eastSession, ids.westSession]));
    await getDb().delete(auditLogs).where(inArray(auditLogs.actorProfileId, profileIds));
    await getDb().delete(teamMemberships).where(inArray(teamMemberships.profileId, profileIds));
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds));
    await getDb().delete(teams).where(inArray(teams.id, [ids.east, ids.west]));
    await getDb().delete(organizations).where(eq(organizations.id, ids.organization));
    await getPool().end();
  });

  it("keeps drafts private, calculates totals server-side, and publishes to the agent", async () => {
    const reportId = await saveCoachingReport(manager, {
      coachingSessionId: ids.eastSession,
      agentProfileId: ids.eastAgent,
      templateId: ids.template,
      criterionScores: [{ criterionId: "opening", score: 4 }],
      strengths: "Clear opening",
      improvementAreas: "Discovery",
      actionItems: ["Practice discovery"],
    });
    expect(await listCoachingReports(agent)).toEqual([]);

    await saveCoachingReport(manager, {
      reportId,
      coachingSessionId: ids.eastSession,
      agentProfileId: ids.eastAgent,
      templateId: ids.template,
      criterionScores: [{ criterionId: "opening", score: 5 }],
      strengths: "Excellent opening",
    });
    const revisions = await getDb().select().from(coachingReportRevisions).where(eq(coachingReportRevisions.reportId, reportId));
    expect(revisions).toHaveLength(1);
    const [stored] = await getDb().select({ overallScore: coachingReports.overallScore }).from(coachingReports).where(eq(coachingReports.id, reportId));
    expect(Number(stored?.overallScore)).toBe(100);

    await finalizeCoachingReport(manager, reportId);
    await publishCoachingReport(manager, reportId);
    const published = await listCoachingReports(agent);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ status: "published", strengths: "Excellent opening", coachName: "Manager" });
    expect(await listCoachingReports(admin)).toHaveLength(1);
    await expect(acknowledgeCoachingReport(westAgent, reportId)).rejects.toThrow(/not found/);
    await acknowledgeCoachingReport(agent, reportId);
    expect((await listCoachingReports(agent))[0]?.status).toBe("acknowledged");
  });

  it("rejects manager rubric submission for another team", async () => {
    await expect(saveCoachingReport(manager, {
      coachingSessionId: ids.westSession,
      agentProfileId: ids.westAgent,
      templateId: ids.template,
      criterionScores: [{ criterionId: "opening", score: 4 }],
    })).rejects.toThrow("Forbidden");
  });
});
