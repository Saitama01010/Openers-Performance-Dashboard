import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

import {
  addDialerMapping,
  listAdminUsers,
  listTeams,
  moveUserToTeam,
  updateUserEmail,
  updateUserPrimaryDialerName,
} from "@/admin/data";
import type { Actor, Role } from "@/auth/authorization";
import { hashPassword } from "@/auth/password";
import { hashOpaqueToken } from "@/auth/security";
import { authenticateCredentials } from "@/auth/service";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  passwordResetTokens,
  profiles,
  sourceUserMappings,
  teamMemberships,
  teams,
} from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const teamIds: string[] = [];

function actor(id: string): Actor {
  return { id, role: "admin", teamIds: [] };
}

async function createProfile(
  role: Role,
  options: {
    email?: string;
    passwordHash?: string;
  } = {},
) {
  const id = newId();
  profileIds.push(id);
  const email = options.email ?? `${id}@example.test`;

  await getDb().insert(profiles).values({
    id,
    email,
    name: `${role} ${id.slice(0, 8)}`,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: options.passwordHash ?? "test-hash",
  });

  return { id, email };
}

async function createTeam(namePrefix: string) {
  const id = newId();
  teamIds.push(id);
  await getDb().insert(teams).values({
    id,
    name: `${namePrefix} ${id.slice(0, 8)}`,
    active: true,
  });
  return id;
}

async function createMembership(input: {
  actorId: string;
  profileId: string;
  role: "manager" | "agent";
  teamId: string;
}) {
  await getDb().insert(teamMemberships).values({
    id: newId(),
    profileId: input.profileId,
    teamId: input.teamId,
    role: input.role,
    active: true,
    createdById: input.actorId,
  });
}

describe("inline admin user management integration", () => {
  afterEach(async () => {
    const ids = profileIds.splice(0);
    const teamIdsToDelete = teamIds.splice(0);

    if (ids.length > 0) {
      await getDb()
        .delete(accountInvitationTokens)
        .where(inArray(accountInvitationTokens.profileId, ids));
      await getDb()
        .delete(passwordResetTokens)
        .where(inArray(passwordResetTokens.profileId, ids));
      await getDb()
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.actorProfileId, ids),
            inArray(auditLogs.entityId, ids),
          ),
        );
      await getDb()
        .delete(sourceUserMappings)
        .where(inArray(sourceUserMappings.profileId, ids));
      await getDb()
        .delete(teamMemberships)
        .where(inArray(teamMemberships.profileId, ids));
      await getDb().delete(profiles).where(inArray(profiles.id, ids));
    }

    if (teamIdsToDelete.length > 0) {
      await getDb().delete(teams).where(inArray(teams.id, teamIdsToDelete));
    }
  });

  it("updates and normalizes login email while revoking old-address tokens", async () => {
    const admin = await createProfile("admin");
    const password = "InlineEmail1!";
    const user = await createProfile("agent", {
      email: "before@example.test",
      passwordHash: await hashPassword(password),
    });
    const invitationId = newId();
    const resetId = newId();

    await getDb().insert(accountInvitationTokens).values({
      id: invitationId,
      profileId: user.id,
      tokenHash: hashOpaqueToken(`invite-${invitationId}`),
      createdById: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await getDb().insert(passwordResetTokens).values({
      id: resetId,
      profileId: user.id,
      tokenHash: hashOpaqueToken(`reset-${resetId}`),
      createdById: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await updateUserEmail(actor(admin.id), {
      userId: user.id,
      email: "  AFTER@Example.Test ",
    });

    expect(result).toEqual({
      field: "email",
      value: "after@example.test",
      changed: true,
    });
    const [updated] = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    expect(updated.email).toBe("after@example.test");

    const [invitation] = await getDb()
      .select()
      .from(accountInvitationTokens)
      .where(eq(accountInvitationTokens.id, invitationId));
    const [reset] = await getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.id, resetId));
    expect(invitation.revokedAt).toBeInstanceOf(Date);
    expect(invitation.deliveryStatus).toBe("revoked");
    expect(reset.revokedAt).toBeInstanceOf(Date);

    expect(
      await authenticateCredentials("before@example.test", password),
    ).toMatchObject({ ok: false });
    expect(
      await authenticateCredentials("after@example.test", password),
    ).toMatchObject({ ok: true });

    const [audit] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, user.id),
          eq(auditLogs.action, "user.email_updated"),
        ),
      );
    expect(audit.metadata).toMatchObject({
      before: { email: "before@example.test" },
      after: { email: "after@example.test" },
    });
  });

  it("rejects duplicate emails and treats the current normalized email as a no-op", async () => {
    const admin = await createProfile("admin");
    const first = await createProfile("agent", {
      email: "first@example.test",
    });
    await createProfile("agent", {
      email: "second@example.test",
    });

    await expect(
      updateUserEmail(actor(admin.id), {
        userId: first.id,
        email: " SECOND@example.test ",
      }),
    ).rejects.toThrow("Another user already owns this email address.");

    await expect(
      updateUserEmail(actor(admin.id), {
        userId: first.id,
        email: " FIRST@example.test ",
      }),
    ).resolves.toEqual({
      field: "email",
      value: "first@example.test",
      changed: false,
    });

    const audits = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, first.id),
          eq(auditLogs.action, "user.email_updated"),
        ),
      );
    expect(audits).toHaveLength(0);
  });

  it("replaces a primary dialer mapping while preserving the old row", async () => {
    const admin = await createProfile("admin");
    const first = await createProfile("agent");
    const second = await createProfile("agent");

    await addDialerMapping(actor(admin.id), {
      userId: first.id,
      sourceAgentName: "First Dialer",
      makePrimary: true,
    });
    await addDialerMapping(actor(admin.id), {
      userId: second.id,
      sourceAgentName: "Taken Name",
      makePrimary: true,
    });

    await expect(
      updateUserPrimaryDialerName(actor(admin.id), {
        userId: first.id,
        dialerName: " taken   NAME ",
      }),
    ).rejects.toThrow("Another user already owns this dialer name.");

    const before = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, first.id));
    const previousPrimary = before.find((mapping) => mapping.isPrimary)!;

    const result = await updateUserPrimaryDialerName(actor(admin.id), {
      userId: first.id,
      dialerName: "  Replacement   Dialer ",
    });
    expect(result).toMatchObject({
      field: "dialerName",
      value: "Replacement Dialer",
      normalizedValue: "replacement dialer",
      changed: true,
    });

    const after = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, first.id));
    const oldMapping = after.find(
      (mapping) => mapping.id === previousPrimary.id,
    );
    const activePrimary = after.find(
      (mapping) => mapping.active && mapping.isPrimary,
    );
    expect(oldMapping).toMatchObject({
      active: false,
      isPrimary: false,
      activeMappingKey: null,
      primaryMappingKey: null,
    });
    expect(oldMapping?.deactivatedAt).toBeInstanceOf(Date);
    expect(activePrimary).toMatchObject({
      sourceAgentName: "Replacement Dialer",
      normalizedAgentName: "replacement dialer",
      active: true,
      isPrimary: true,
    });
    expect(after).toHaveLength(2);
  });

  it("creates a primary dialer mapping when the user has none", async () => {
    const admin = await createProfile("admin");
    const manager = await createProfile("manager");

    await expect(
      updateUserPrimaryDialerName(actor(admin.id), {
        userId: manager.id,
        dialerName: "New Manager Dialer",
      }),
    ).resolves.toMatchObject({
      value: "New Manager Dialer",
      changed: true,
    });

    const mappings = await getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, manager.id));
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({ active: true, isPrimary: true });
  });

  it("moves agents and managers with one active membership and shared page state", async () => {
    const admin = await createProfile("admin");
    const agent = await createProfile("agent");
    const manager = await createProfile("manager");
    const firstTeamId = await createTeam("First");
    const secondTeamId = await createTeam("Second");

    await createMembership({
      actorId: admin.id,
      profileId: agent.id,
      role: "agent",
      teamId: firstTeamId,
    });
    await createMembership({
      actorId: admin.id,
      profileId: manager.id,
      role: "manager",
      teamId: firstTeamId,
    });

    await expect(
      moveUserToTeam(actor(admin.id), {
        userId: agent.id,
        teamId: secondTeamId,
      }),
    ).resolves.toMatchObject({ changed: true, value: secondTeamId });
    await expect(
      moveUserToTeam(actor(admin.id), {
        userId: manager.id,
        teamId: secondTeamId,
      }),
    ).resolves.toMatchObject({ changed: true, value: secondTeamId });

    for (const member of [agent, manager]) {
      const memberships = await getDb()
        .select()
        .from(teamMemberships)
        .where(eq(teamMemberships.profileId, member.id));
      const oldMembership = memberships.find(
        (membership) => membership.teamId === firstTeamId,
      );
      const activeMemberships = memberships.filter(
        (membership) => membership.active && !membership.endedAt,
      );
      expect(oldMembership?.active).toBe(false);
      expect(oldMembership?.endedAt).toBeInstanceOf(Date);
      expect(activeMemberships).toHaveLength(1);
      expect(activeMemberships[0].teamId).toBe(secondTeamId);
    }

    const beforeNoOp = await getDb()
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.profileId, agent.id));
    await expect(
      moveUserToTeam(actor(admin.id), {
        userId: agent.id,
        teamId: secondTeamId,
      }),
    ).resolves.toMatchObject({ changed: false });
    const afterNoOp = await getDb()
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.profileId, agent.id));
    expect(afterNoOp).toHaveLength(beforeNoOp.length);

    const usersState = await listAdminUsers(actor(admin.id), {
      page: 1,
      pageSize: 50,
      teamId: secondTeamId,
    });
    expect(usersState.users.map((user) => user.id)).toEqual(
      expect.arrayContaining([agent.id, manager.id]),
    );

    const teamsState = await listTeams(actor(admin.id));
    const secondTeam = teamsState.teams.find(
      (team) => team.id === secondTeamId,
    );
    expect(secondTeam?.members.map((member) => member.profileId)).toEqual(
      expect.arrayContaining([agent.id, manager.id]),
    );
  });
});
