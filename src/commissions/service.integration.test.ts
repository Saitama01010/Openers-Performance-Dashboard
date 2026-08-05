import "@/test/integration-env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const { ingestAndMatchLeaderboardSources } = vi.hoisted(() => ({
  ingestAndMatchLeaderboardSources: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/leaderboard/transfers", () => ({
  ingestAndMatchLeaderboardSources,
  transferSheetConfigFromEnv: () => ({
    endpointUrl: "https://script.google.com/macros/s/test/exec",
    secret: "test-secret",
    timeZone: "Africa/Cairo",
  }),
}));

import { getCommissionReport } from "@/commissions/service";
import { getDb, getPool } from "@/db";
import {
  organizations,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import type { NormalizedClosedDeal } from "@/sheets/contracts";

const suffix = randomUUID().slice(0, 8);
const ids = {
  organization: `commission-org-${suffix}`,
  east: `commission-east-${suffix}`,
  west: `commission-west-${suffix}`,
  manager: `commission-manager-${suffix}`,
  eastAgent: `commission-east-agent-${suffix}`,
  westAgent: `commission-west-agent-${suffix}`,
  inactiveAgent: `commission-inactive-${suffix}`,
};
const profileIds = [ids.manager, ids.eastAgent, ids.westAgent, ids.inactiveAgent];

function closedDeal(profileId: string, timestamp: string): NormalizedClosedDeal {
  return {
    sourceRowNumber: 2,
    timestamp: new Date(timestamp),
    timestampIso: timestamp,
    closer: "",
    customerName: "",
    fileNumber: "",
    debtAmount: "",
    readyForSubmission: "",
    sheetOpener: profileId,
    extractedAmericanName: profileId,
    normalizedAmericanName: profileId,
    matchedUserId: profileId,
    matchStatus: "matched",
    validationErrors: [],
  };
}

describe("commission service authorization and visibility", () => {
  beforeAll(async () => {
    await getDb().insert(organizations).values({ id: ids.organization, name: `Commission ${suffix}` });
    await getDb().insert(teams).values([
      { id: ids.east, organizationId: ids.organization, name: `East ${suffix}` },
      { id: ids.west, organizationId: ids.organization, name: `West ${suffix}` },
    ]);
    await getDb().insert(profiles).values([
      { id: ids.manager, organizationId: ids.organization, email: `${ids.manager}@example.com`, name: "Manager", role: "manager", accountStatus: "active" },
      { id: ids.eastAgent, organizationId: ids.organization, email: `${ids.eastAgent}@example.com`, name: "East Agent", role: "agent", accountStatus: "active" },
      { id: ids.westAgent, organizationId: ids.organization, email: `${ids.westAgent}@example.com`, name: "West Agent", role: "agent", accountStatus: "active" },
      { id: ids.inactiveAgent, organizationId: ids.organization, email: `${ids.inactiveAgent}@example.com`, name: "Inactive Agent", role: "agent", active: false, accountStatus: "deactivated" },
    ]);
    await getDb().insert(teamMemberships).values([
      { id: randomUUID(), teamId: ids.east, profileId: ids.manager, role: "manager" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.eastAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.west, profileId: ids.westAgent, role: "agent" },
      { id: randomUUID(), teamId: ids.east, profileId: ids.inactiveAgent, role: "agent" },
    ]);
    await getDb().insert(sourceUserMappings).values(
      [ids.eastAgent, ids.westAgent, ids.inactiveAgent].map((profileId) => ({
        id: randomUUID(),
        source: "dialer",
        sourceAgentName: profileId,
        normalizedAgentName: profileId,
        activeMappingKey: `dialer:${profileId}`,
        primaryMappingKey: `dialer:${profileId}`,
        profileId,
        active: true,
        isPrimary: true,
      })),
    );
  });

  beforeEach(() => {
    ingestAndMatchLeaderboardSources.mockReset();
    ingestAndMatchLeaderboardSources.mockResolvedValue({
      status: "ready",
      timeZone: "Africa/Cairo",
      closedRecords: [
        ...Array.from({ length: 10 }, () => closedDeal(ids.eastAgent, "2026-08-10T10:00:00Z")),
        closedDeal(ids.westAgent, "2026-08-10T10:00:00Z"),
        closedDeal(ids.inactiveAgent, "2026-07-10T10:00:00Z"),
        closedDeal(ids.inactiveAgent, "2026-08-10T10:00:00Z"),
      ],
      stale: false,
    });
  });

  afterAll(async () => {
    await getDb().delete(sourceUserMappings).where(inArray(sourceUserMappings.profileId, profileIds));
    await getDb().delete(teamMemberships).where(inArray(teamMemberships.profileId, profileIds));
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds));
    await getDb().delete(teams).where(inArray(teams.id, [ids.east, ids.west]));
    await getDb().delete(organizations).where(eq(organizations.id, ids.organization));
    await getPool().end();
  });

  it("keeps managers inside assigned teams and includes inactive agents only in their final deal month", async () => {
    const report = await getCommissionReport(
      { id: ids.manager, role: "manager", teamIds: [ids.east], organizationId: ids.organization },
      { commissionMonth: "2026-08" },
    );
    expect(report.status).toBe("ready");
    if (report.status !== "ready") return;
    expect(report.rows.map((row) => row.id)).toEqual([ids.eastAgent, ids.inactiveAgent]);
    expect(report.rows.find((row) => row.id === ids.eastAgent)?.commissionAmount).toBe(2_500);
    expect(report.rows.some((row) => row.id === ids.westAgent)).toBe(false);
    expect(ingestAndMatchLeaderboardSources).toHaveBeenCalledTimes(1);
  });

  it("returns an empty scope for a manager with no assigned teams", async () => {
    const report = await getCommissionReport(
      { id: ids.manager, role: "manager", teamIds: [], organizationId: ids.organization },
      { commissionMonth: "2026-08" },
    );
    expect(report.status).toBe("ready");
    if (report.status === "ready") expect(report.rows).toEqual([]);
  });

  it("keeps agents self-only without aggregate totals", async () => {
    const report = await getCommissionReport(
      { id: ids.eastAgent, role: "agent", teamIds: [ids.east], organizationId: ids.organization },
      { commissionMonth: "2026-08" },
    );
    expect(report.status).toBe("ready");
    if (report.status !== "ready") return;
    expect(report.rows.map((row) => row.id)).toEqual([ids.eastAgent]);
    expect(report.summary).toBeNull();
  });

  it("applies an admin team filter to rows and summaries", async () => {
    const report = await getCommissionReport(
      { id: ids.manager, role: "admin", teamIds: [], organizationId: ids.organization },
      { commissionMonth: "2026-08", teamId: ids.west },
    );
    expect(report.status).toBe("ready");
    if (report.status !== "ready") return;
    expect(report.rows.map((row) => row.id)).toEqual([ids.westAgent]);
    expect(report.summary?.totalEmployees).toBe(1);
  });

  it("does not convert Closed-source failure into zero-deal compensation", async () => {
    ingestAndMatchLeaderboardSources.mockResolvedValue({ status: "closed_error", message: "Closed unavailable" });
    const report = await getCommissionReport(
      { id: ids.manager, role: "manager", teamIds: [ids.east], organizationId: ids.organization },
      { commissionMonth: "2026-08" },
    );
    expect(report).toMatchObject({ status: "source_unavailable", message: "Closed unavailable" });
    expect(report).not.toHaveProperty("rows");
  });
});
