import "@/test/integration-env";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getAdminAuditEvent, getAdminAuditStats, listAdminAuditEvents, resolveAdminAuditFilters } from "@/admin/audit";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import { auditLogs, organizations, profiles } from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const eventIds: string[] = [];
let admin: Actor;
let adminId: string;
let targetId: string;

async function profile(organizationId: string, role: "admin" | "manager" | "agent", name: string) {
  const id = newId(); profileIds.push(id);
  await getDb().insert(profiles).values({ id, organizationId, email: `${id}@example.test`, name, role, active: true, accountStatus: "active", passwordHash: "test-hash" });
  return id;
}

async function event(actorProfileId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>, createdAt: Date) {
  const id = newId(); eventIds.push(id);
  await getDb().insert(auditLogs).values({ id, actorProfileId, action, entityType, entityId, metadata, createdAt });
  return id;
}

beforeEach(async () => {
  const organizationId = newId(); const otherOrganizationId = newId(); organizationIds.push(organizationId, otherOrganizationId);
  await getDb().insert(organizations).values([{ id: organizationId, name: `Audit ${organizationId}` }, { id: otherOrganizationId, name: `Audit ${otherOrganizationId}` }]);
  adminId = await profile(organizationId, "admin", "John Williams");
  targetId = await profile(organizationId, "agent", "Mia Ford");
  const otherAdmin = await profile(otherOrganizationId, "admin", "Other Admin");
  admin = { id: adminId, role: "admin", teamIds: [], organizationId };
  await event(adminId, "user.created", "profile", targetId, { after: { passwordHash: "never-show" }, resetToken: "never-show" }, new Date("2026-08-08T08:00:00.000Z"));
  await event(adminId, "dialer_import.uploaded", "dialer_import_batch", "missing-import", { fileName: "safe-agents.csv", apiKey: "never-show" }, new Date("2026-08-08T09:00:00.000Z"));
  await event(adminId, "team.created", "team", "missing-team", { after: { teamName: "East Openers" } }, new Date("2026-08-07T09:00:00.000Z"));
  await event(otherAdmin, "user.created", "profile", otherAdmin, { after: { name: "Other Admin" } }, new Date("2026-08-08T10:00:00.000Z"));
});

afterEach(async () => {
  if (eventIds.length) await getDb().delete(auditLogs).where(inArray(auditLogs.id, eventIds.splice(0)));
  if (profileIds.length) await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  if (organizationIds.length) await getDb().delete(organizations).where(inArray(organizations.id, organizationIds.splice(0)));
});

describe("administrator audit inspection", () => {
  it("scopes list, KPI, search, category, sort, and pagination to the actor organization", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const base = resolveAdminAuditFilters({ range: "last-7", pageSize: "10" }, now, "UTC");
    const [data, stats] = await Promise.all([listAdminAuditEvents(admin, base, { now, timeZone: "UTC" }), getAdminAuditStats(admin, base, { now, timeZone: "UTC" })]);
    expect(data.pagination.totalRows).toBe(3);
    expect(data.rows.map((row) => row.actor.name)).not.toContain("Other Admin");
    expect(data.rows.map((row) => row.action)).toEqual(["dialer_import.uploaded", "user.created", "team.created"]);
    expect(stats).toMatchObject({ totalEvents: 3, eventsToday: 2, adminActions: 2, importEvents: 1, uniqueActors: 1 });

    const searched = await listAdminAuditEvents(admin, resolveAdminAuditFilters({ range: "last-7", q: "safe-agents" }, now, "UTC"), { now, timeZone: "UTC" });
    expect(searched.rows.map((row) => row.action)).toEqual(["dialer_import.uploaded"]);
    const titleSearch = await listAdminAuditEvents(admin, resolveAdminAuditFilters({ range: "last-7", q: "user account created" }, now, "UTC"), { now, timeZone: "UTC" });
    expect(titleSearch.rows.map((row) => row.action)).toEqual(["user.created"]);
    const targetSearch = await listAdminAuditEvents(admin, resolveAdminAuditFilters({ range: "last-7", q: "Mia Ford" }, now, "UTC"), { now, timeZone: "UTC" });
    expect(targetSearch.rows.map((row) => row.action)).toEqual(["user.created"]);
    const categorized = await listAdminAuditEvents(admin, resolveAdminAuditFilters({ range: "last-7", category: "team-management", direction: "asc", pageSize: "10" }, now, "UTC"), { now, timeZone: "UTC" });
    expect(categorized.rows).toEqual([expect.objectContaining({ action: "team.created", category: "team-management" })]);
  });

  it("loads only an organization-authorized event and recursively redacts evidence", async () => {
    const ownEvent = eventIds[0];
    const details = await getAdminAuditEvent(admin, ownEvent);
    expect(details).toMatchObject({ id: ownEvent, actor: { name: "John Williams" }, target: { label: "Mia Ford", available: true } });
    expect(details?.metadata).toMatchObject({ after: { passwordHash: "[REDACTED]" }, resetToken: "[REDACTED]" });
    expect(details?.relatedLinks).toEqual([{ href: `/admin/users/${targetId}`, label: "View user" }]);
    await expect(listAdminAuditEvents({ ...admin, role: "manager" }, resolveAdminAuditFilters({}))).rejects.toThrow("Forbidden");

    const [other] = await getDb().select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "user.created")).orderBy(auditLogs.createdAt);
    if (other?.id && other.id !== ownEvent) expect(await getAdminAuditEvent(admin, other.id)).toBeNull();
  });
});
