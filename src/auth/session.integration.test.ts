import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizations,
  profiles,
  sessions,
  teamMemberships,
  teams,
} from "@/db/schema";
import {
  createSessionRecord,
  getSessionUser,
  sessionIdFromToken,
} from "@/auth/session";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const teamIds: string[] = [];

afterEach(async () => {
  if (profileIds.length > 0) {
    await getDb().delete(sessions).where(inArray(sessions.profileId, profileIds));
    await getDb()
      .delete(teamMemberships)
      .where(inArray(teamMemberships.profileId, profileIds));
  }
  if (teamIds.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, teamIds.splice(0)));
  }
  if (profileIds.length > 0) {
    await getDb()
      .delete(profiles)
      .where(inArray(profiles.id, profileIds.splice(0)));
  }
  if (organizationIds.length > 0) {
    await getDb()
      .delete(organizations)
      .where(inArray(organizations.id, organizationIds.splice(0)));
  }
});

async function createSessionFixture() {
  const organizationId = newId();
  const profileId = newId();
  const activeTeamId = newId();
  const archivedTeamId = newId();
  organizationIds.push(organizationId);
  profileIds.push(profileId);
  teamIds.push(activeTeamId, archivedTeamId);

  await getDb().insert(organizations).values({
    id: organizationId,
    name: `Session ${organizationId}`,
  });
  await getDb().insert(profiles).values({
    id: profileId,
    organizationId,
    email: `${profileId}@example.test`,
    name: "Session Profile",
    role: "agent",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  await getDb().insert(teams).values([
    { id: activeTeamId, organizationId, name: "Active Session Team", active: true },
    {
      id: archivedTeamId,
      organizationId,
      name: "Archived Session Team",
      active: false,
      archivedAt: new Date(),
    },
  ]);
  await getDb().insert(teamMemberships).values([
    { id: newId(), teamId: activeTeamId, profileId, role: "agent", active: true },
    { id: newId(), teamId: archivedTeamId, profileId, role: "agent", active: true },
  ]);

  return { organizationId, profileId, activeTeamId };
}

describe("session persistence and resolution", () => {
  it("creates a token-hash session and resolves only active team membership", async () => {
    const fixture = await createSessionFixture();
    const record = await createSessionRecord({
      id: fixture.profileId,
      role: "agent",
    });

    const [stored] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionIdFromToken(record.token)))
      .limit(1);
    expect(stored).toMatchObject({ profileId: fixture.profileId });
    expect(
      Math.abs((stored?.expiresAt.getTime() ?? 0) - record.expiresAt.getTime()),
    ).toBeLessThan(1_000);

    await expect(getSessionUser(record.token)).resolves.toMatchObject({
      id: fixture.profileId,
      organizationId: fixture.organizationId,
      teamIds: [fixture.activeTeamId],
    });
  });

  it("rejects revoked, expired, and inactive sessions", async () => {
    const fixture = await createSessionFixture();
    const revoked = await createSessionRecord({ id: fixture.profileId, role: "agent" });
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionIdFromToken(revoked.token)));
    await expect(getSessionUser(revoked.token)).resolves.toBeNull();

    const expired = await createSessionRecord({ id: fixture.profileId, role: "agent" });
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(sessions.id, sessionIdFromToken(expired.token)));
    await expect(getSessionUser(expired.token)).resolves.toBeNull();
    const [expiredRow] = await getDb()
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.id, sessionIdFromToken(expired.token)))
      .limit(1);
    expect(expiredRow?.revokedAt).toBeInstanceOf(Date);

    const inactive = await createSessionRecord({ id: fixture.profileId, role: "agent" });
    await getDb()
      .update(profiles)
      .set({ active: false, accountStatus: "deactivated" })
      .where(eq(profiles.id, fixture.profileId));
    await expect(getSessionUser(inactive.token)).resolves.toBeNull();
  });
});
