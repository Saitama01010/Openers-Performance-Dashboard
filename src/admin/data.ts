import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Actor, Role } from "@/auth/authorization";
import { assertPermission } from "@/auth/permissions";
import { getCurrentSessionId } from "@/auth/session";
import {
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
} from "@/auth/security";
import { hashPassword } from "@/auth/password";
import {
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  generateTemporaryPassword,
} from "@/auth/temporary-password";
import {
  activeMappingKey,
  assertCanRemoveAdmin,
  assertValidRole,
  primaryMappingKey,
  roleRequiresTeam,
  validatePermissionOverrides,
  type PermissionOverrideInput,
} from "@/admin/policy";
import { parseBulkUserIds, parseUserIds } from "@/admin/bulk-user-deletion";
import { sortedIdDigest } from "@/admin/remediation-confirmation";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  coachingSessionParticipants,
  coachingSessions,
  dialerAgentHourlyMetrics,
  dialerDatasetVersions,
  dialerImportBatches,
  dialerImportRows,
  emailDeliveryAttempts,
  importErrors,
  passwordResetTokens,
  profiles,
  sessions,
  sourceUserMappings,
  teamMemberships,
  teams,
  transfersFixtures,
  userImportBatches,
  userPermissionOverrides,
} from "@/db/schema";
import { getEnv } from "@/env";
import {
  accessRevokedEmail,
  deliverEmail,
  invitationEmail,
  passwordResetEmail,
} from "@/email/provider";
import { newId } from "@/lib/ids";
import {
  actorOrganizationId,
  normalizeTeamName,
  teamBelongsToActorWhere,
  visibleTeamWhere,
} from "@/teams/visibility";
import { activeProfileWhere } from "@/users/visibility";

export type InvitationStatus =
  | "not invited"
  | "invitation sent"
  | "invitation expired"
  | "password created"
  | "revoked"
  | "delivery failed";

type AccountStatus =
  | "invited"
  | "active"
  | "deactivated"
  | "revoked"
  | "deleted";

export type AdminUserListFilters = {
  query?: string;
  role?: Role;
  teamId?: string;
  accountStatus?: AccountStatus;
  invitationStatus?: InvitationStatus;
  page: number;
  pageSize: number;
};

export type CreateUserInput = {
  name: string;
  email: string;
  role: Role;
  teamId?: string;
  dialerName?: string;
  shift?: string;
  dialerAliases: string[];
  permissionOverrides: PermissionOverrideInput[];
  importBatchId?: string;
  employmentStartDate?: string;
};

export type UpdateUserInput = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  teamId?: string;
  shift?: string;
  permissionOverrides: PermissionOverrideInput[];
};

export type InlineUserUpdateResult =
  | {
      field: "email";
      value: string;
      changed: boolean;
    }
  | {
      field: "dialerName";
      value: string;
      normalizedValue: string;
      changed: boolean;
    }
  | {
      field: "teamId";
      value: string;
      teamName: string;
      changed: boolean;
    }
  | {
      field: "shift";
      value: string;
      changed: boolean;
    };

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") {
    throw new Error("Forbidden");
  }
}

function trimText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDialerDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDialerIdentity(value: string) {
  return normalizeDialerDisplayName(value).toLowerCase();
}

function normalizeShift(value?: string) {
  const shift = trimText(value ?? "");
  if (shift.length > 80) {
    throw new Error("Shift must be 80 characters or fewer.");
  }
  return shift || null;
}

function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
  };

  return (
    candidate.code === "ER_DUP_ENTRY" ||
    candidate.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (candidate.cause !== error && isDuplicateEntryError(candidate.cause))
  );
}

function invitationStatus(token?: {
  deliveryStatus: "pending" | "accepted" | "expired" | "revoked" | "delivery_failed";
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}, passwordState?: "temporary" | "permanent", passwordChangedAt?: Date | null) {
  if (passwordState === "permanent" && passwordChangedAt) {
    return "password created" satisfies InvitationStatus;
  }
  if (!token) return "not invited" satisfies InvitationStatus;
  if (token.usedAt) return "password created" satisfies InvitationStatus;
  if (token.revokedAt || token.deliveryStatus === "revoked") {
    return "revoked" satisfies InvitationStatus;
  }
  if (token.deliveryStatus === "delivery_failed") {
    return "delivery failed" satisfies InvitationStatus;
  }
  if (token.expiresAt.getTime() <= Date.now()) {
    return "invitation expired" satisfies InvitationStatus;
  }
  return "invitation sent" satisfies InvitationStatus;
}

function safeProfileState(profile: {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  active: boolean;
  accountStatus: AccountStatus;
}) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    active: profile.active,
    accountStatus: profile.accountStatus,
  };
}

async function writeAudit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await getDb().insert(auditLogs).values({
    id: newId(),
    actorProfileId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
  });
}

async function getActiveAdminCountForUpdate(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  organizationId: string,
) {
  const rows = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountStatus, "active"),
        eq(profiles.active, true),
        eq(profiles.organizationId, organizationId),
      ),
    )
    .for("update");

  return rows.length;
}

async function recordEmailAttempt(input: {
  profileId?: string;
  tokenId?: string;
  messageType: string;
  recipientEmail: string;
  provider: string;
  ok: boolean;
  acceptedAt?: Date | null;
  providerMessageId?: string | null;
  error?: string;
}) {
  await getDb().insert(emailDeliveryAttempts).values({
    id: newId(),
    profileId: input.profileId,
    tokenId: input.tokenId,
    messageType: input.messageType,
    provider: input.provider,
    recipientEmail: input.recipientEmail,
    status: input.ok ? "accepted" : "failed",
    providerMessageId: input.providerMessageId,
    acceptedAt: input.acceptedAt,
    errorMessage: input.error,
  });
}

async function deliverInvitationAfterCommit(input: {
  actorId: string;
  profileId: string;
  tokenId: string;
  email: string;
  name: string;
  token: string;
  resent: boolean;
}) {
  const result = await deliverEmail(
    invitationEmail({
      email: input.email,
      name: input.name,
      token: input.token,
      tokenId: input.tokenId,
      resent: input.resent,
    }),
  );

  await recordEmailAttempt({
    profileId: input.profileId,
    tokenId: input.tokenId,
    messageType: input.resent ? "account_invitation_resent" : "account_invitation",
    recipientEmail: input.email,
    provider: result.provider,
    ok: result.ok,
    acceptedAt: result.ok ? result.acceptedAt : null,
    providerMessageId: result.ok ? result.providerMessageId : null,
    error: result.ok ? undefined : result.error,
  });

  if (!result.ok) {
    await getDb()
      .update(accountInvitationTokens)
      .set({ deliveryStatus: "delivery_failed" })
      .where(eq(accountInvitationTokens.id, input.tokenId));
    await writeAudit({
      actorId: input.actorId,
      action: "user.invitation_email_failed",
      entityType: "profile",
      entityId: input.profileId,
    });
  }

  return result;
}

async function deliverPasswordResetAfterCommit(input: {
  profileId: string;
  tokenId: string;
  email: string;
  name: string;
  token: string;
}) {
  const result = await deliverEmail(
    passwordResetEmail({
      email: input.email,
      name: input.name,
      token: input.token,
      tokenId: input.tokenId,
    }),
  );

  await recordEmailAttempt({
    profileId: input.profileId,
    tokenId: input.tokenId,
    messageType: "password_reset",
    recipientEmail: input.email,
    provider: result.provider,
    ok: result.ok,
    acceptedAt: result.ok ? result.acceptedAt : null,
    providerMessageId: result.ok ? result.providerMessageId : null,
    error: result.ok ? undefined : result.error,
  });

  return result;
}

async function sendAccessRevokedNotice(input: {
  profileId: string;
  email: string;
  name: string;
}) {
  const result = await deliverEmail(
    accessRevokedEmail({ email: input.email, name: input.name }),
  );

  await recordEmailAttempt({
    profileId: input.profileId,
    messageType: "access_revoked",
    recipientEmail: input.email,
    provider: result.provider,
    ok: result.ok,
    acceptedAt: result.ok ? result.acceptedAt : null,
    providerMessageId: result.ok ? result.providerMessageId : null,
    error: result.ok ? undefined : result.error,
  });

  return result;
}

function listWhere(actor: Actor, filters: AdminUserListFilters) {
  const conditions: SQL[] = [
    ne(profiles.accountStatus, "deleted"),
    eq(profiles.organizationId, actorOrganizationId(actor)),
  ];

  if (filters.query) {
    const search = `%${filters.query}%`;
    conditions.push(
      or(
        like(profiles.name, search),
        like(profiles.email, search),
        sql`exists (
          select 1 from source_user_mappings mappings
          where mappings.profile_id = ${profiles.id}
          and (
            mappings.source_agent_name like ${search}
            or mappings.normalized_agent_name like ${search}
          )
        )`,
      )!,
    );
  }

  if (filters.role) {
    conditions.push(eq(profiles.role, filters.role));
  }

  if (filters.accountStatus) {
    conditions.push(eq(profiles.accountStatus, filters.accountStatus));
  }

  if (filters.teamId) {
    conditions.push(sql`exists (
      select 1 from team_memberships memberships
      inner join teams scoped_team on scoped_team.id = memberships.team_id
      where memberships.profile_id = ${profiles.id}
      and memberships.team_id = ${filters.teamId}
      and memberships.ended_at is null
      and memberships.active = true
      and scoped_team.organization_id = ${actorOrganizationId(actor)}
      and scoped_team.active = true
      and scoped_team.archived_at is null
      and scoped_team.deleted_at is null
    )`);
  }

  if (filters.invitationStatus === "not invited") {
    conditions.push(
      and(
        eq(profiles.passwordState, "temporary"),
        sql`not exists (
          select 1 from account_invitation_tokens invitations
          where invitations.profile_id = ${profiles.id}
        )`,
      )!,
    );
  } else if (filters.invitationStatus === "invitation sent") {
    conditions.push(sql`exists (
      select 1 from account_invitation_tokens invitations
      where invitations.profile_id = ${profiles.id}
      and invitations.used_at is null
      and invitations.revoked_at is null
      and invitations.expires_at > now()
      and invitations.invitation_delivery_status = 'pending'
    )`);
  } else if (filters.invitationStatus === "password created") {
    conditions.push(
      or(
        and(
          eq(profiles.passwordState, "permanent"),
          sql`${profiles.passwordChangedAt} is not null`,
        ),
        sql`exists (
          select 1 from account_invitation_tokens invitations
          where invitations.profile_id = ${profiles.id}
          and invitations.used_at is not null
        )`,
      )!,
    );
  } else if (filters.invitationStatus === "invitation expired") {
    conditions.push(sql`exists (
      select 1 from account_invitation_tokens invitations
      where invitations.profile_id = ${profiles.id}
      and invitations.used_at is null
      and invitations.revoked_at is null
      and invitations.expires_at <= now()
    )`);
  } else if (filters.invitationStatus === "revoked") {
    conditions.push(sql`exists (
      select 1 from account_invitation_tokens invitations
      where invitations.profile_id = ${profiles.id}
      and invitations.revoked_at is not null
    )`);
  } else if (filters.invitationStatus === "delivery failed") {
    conditions.push(sql`exists (
      select 1 from account_invitation_tokens invitations
      where invitations.profile_id = ${profiles.id}
      and invitations.invitation_delivery_status = 'delivery_failed'
    )`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listAdminUsers(actor: Actor, filters: AdminUserListFilters) {
  assertAdmin(actor);

  const page = Math.max(1, filters.page);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize));
  const where = listWhere(actor, filters);
  const [rows, totalRows, teamRows] = await Promise.all([
    getDb()
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        shift: profiles.shift,
        role: profiles.role,
        accountStatus: profiles.accountStatus,
        passwordState: profiles.passwordState,
        passwordChangedAt: profiles.passwordChangedAt,
        lastLoginAt: profiles.lastLoginAt,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.createdAt), desc(profiles.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb()
      .select({ total: countDistinct(profiles.id) })
      .from(profiles)
      .where(where),
    getDb()
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(visibleTeamWhere(actor))
      .orderBy(asc(teams.name), asc(teams.id)),
  ]);
  const userIds = rows.map((row) => row.id);

  if (userIds.length === 0) {
    return {
      users: [],
      teams: teamRows,
      pagination: { page, pageSize, total: totalRows[0]?.total ?? 0 },
    };
  }

  const [membershipRows, mappingRows, invitationRows] = await Promise.all([
    getDb()
      .select({
        profileId: teamMemberships.profileId,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .where(
        and(
          inArray(teamMemberships.profileId, userIds),
          isNull(teamMemberships.endedAt),
          eq(teamMemberships.active, true),
          visibleTeamWhere(actor),
        ),
      ),
    getDb()
      .select({
        profileId: sourceUserMappings.profileId,
        sourceAgentName: sourceUserMappings.sourceAgentName,
      })
      .from(sourceUserMappings)
      .where(
        and(
          inArray(sourceUserMappings.profileId, userIds),
          eq(sourceUserMappings.active, true),
          eq(sourceUserMappings.isPrimary, true),
        ),
      ),
    getDb()
      .select({
        profileId: accountInvitationTokens.profileId,
        deliveryStatus: accountInvitationTokens.deliveryStatus,
        usedAt: accountInvitationTokens.usedAt,
        revokedAt: accountInvitationTokens.revokedAt,
        expiresAt: accountInvitationTokens.expiresAt,
        createdAt: accountInvitationTokens.createdAt,
      })
      .from(accountInvitationTokens)
      .where(inArray(accountInvitationTokens.profileId, userIds))
      .orderBy(desc(accountInvitationTokens.createdAt)),
  ]);

  const membershipByUser = new Map(
    membershipRows.map((row) => [row.profileId, row]),
  );
  const mappingByUser = new Map(mappingRows.map((row) => [row.profileId, row]));
  const invitationByUser = new Map<string, (typeof invitationRows)[number]>();

  for (const invitation of invitationRows) {
    if (!invitationByUser.has(invitation.profileId)) {
      invitationByUser.set(invitation.profileId, invitation);
    }
  }

  return {
    users: rows.map((row) => ({
      ...row,
      team: membershipByUser.get(row.id) ?? null,
      dialerAgentName: mappingByUser.get(row.id)?.sourceAgentName ?? null,
      invitationStatus: invitationStatus(
        invitationByUser.get(row.id),
        row.passwordState,
        row.passwordChangedAt,
      ),
    })),
    teams: teamRows,
    pagination: { page, pageSize, total: totalRows[0]?.total ?? 0 },
  };
}

export async function getAdminReferenceData(actor: Actor) {
  assertAdmin(actor);

  const [teamRows, agentRows, managerRows] = await Promise.all([
    getDb()
      .select({ id: teams.id, name: teams.name, active: teams.active })
      .from(teams)
      .where(visibleTeamWhere(actor))
      .orderBy(asc(teams.name)),
    getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
      ))
      .orderBy(asc(profiles.name)),
    getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "manager"),
      ))
      .orderBy(asc(profiles.name)),
  ]);

  return { teams: teamRows, agents: agentRows, managers: managerRows };
}

async function validateTeamForAssignment(actor: Actor, teamId?: string) {
  if (!teamId) throw new Error("Select a team before changing this user to this role.");

  const rows = await getDb()
    .select({ id: teams.id, active: teams.active })
    .from(teams)
    .where(and(eq(teams.id, teamId), visibleTeamWhere(actor)))
    .limit(1);
  const team = rows[0];

  if (!team) throw new Error("Team was not found.");
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return (
    candidate.code === "ER_LOCK_DEADLOCK" ||
    candidate.code === "ER_LOCK_WAIT_TIMEOUT" ||
    (candidate.cause !== error && isRetryableTransactionError(candidate.cause))
  );
}

async function hasActiveDialerMapping(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
) {
  const rows = await tx
    .select({ id: sourceUserMappings.id })
    .from(sourceUserMappings)
    .where(
      and(
        eq(sourceUserMappings.profileId, userId),
        eq(sourceUserMappings.source, "dialer"),
        eq(sourceUserMappings.active, true),
      ),
    )
    .limit(1)
    .for("update");

  return Boolean(rows[0]);
}

async function createInvitationRecord(input: {
  profileId: string;
  createdById: string;
}) {
  const token = createOpaqueToken();
  const tokenId = newId();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + getEnv().INVITATION_TTL_HOURS * 60 * 60 * 1000,
  );

  await getDb()
    .update(accountInvitationTokens)
    .set({ revokedAt: now, deliveryStatus: "revoked" })
    .where(
      and(
        eq(accountInvitationTokens.profileId, input.profileId),
        isNull(accountInvitationTokens.usedAt),
        isNull(accountInvitationTokens.revokedAt),
      ),
    );
  await getDb().insert(accountInvitationTokens).values({
    id: tokenId,
    profileId: input.profileId,
    tokenHash: hashOpaqueToken(token),
    createdById: input.createdById,
    deliveryStatus: "pending",
    expiresAt,
  });

  return { token, tokenId, expiresAt };
}

function mappingValues(input: {
  id?: string;
  source: string;
  sourceAgentName: string;
  profileId: string;
  isPrimary: boolean;
  actorId: string;
}) {
  const displayName = normalizeDialerDisplayName(input.sourceAgentName);
  const normalizedName = normalizeDialerIdentity(displayName);

  if (!normalizedName) {
    throw new Error("Dialer agent name is required.");
  }

  return {
    id: input.id ?? newId(),
    source: input.source,
    sourceAgentName: displayName,
    normalizedAgentName: normalizedName,
    activeMappingKey: activeMappingKey(input.source, normalizedName),
    primaryMappingKey: input.isPrimary
      ? primaryMappingKey(input.source, input.profileId)
      : null,
    profileId: input.profileId,
    active: true,
    isPrimary: input.isPrimary,
    approvedById: input.actorId,
    approvedAt: new Date(),
  };
}

async function assertActiveDialerMappingAvailable(
  source: string,
  normalizedAgentName: string,
) {
  const duplicateRows = await getDb()
    .select({ id: sourceUserMappings.id })
    .from(sourceUserMappings)
    .where(
      eq(
        sourceUserMappings.activeMappingKey,
        activeMappingKey(source, normalizedAgentName),
      ),
    )
    .limit(1);

  if (duplicateRows[0]) {
    throw new Error("This active dialer identity is already mapped.");
  }
}

async function createProvisionedUser(actor: Actor, input: CreateUserInput) {
  assertValidRole(input.role);

  const name = trimText(input.name);
  const email = normalizeEmail(input.email);
  const shift = normalizeShift(input.shift);

  if (name.length < 2) throw new Error("Full name is required.");
  if (!email.includes("@")) throw new Error("A valid email is required.");
  if (!input.teamId) throw new Error("Select a team before creating this user.");
  if (input.role === "manager" && !input.teamId) {
    throw new Error("Select a team before changing this user to manager.");
  }
  if (input.role === "agent" && !input.teamId) {
    throw new Error("Select a team before changing this user to agent.");
  }
  await validateTeamForAssignment(actor, input.teamId);
  if (!input.dialerName?.trim()) {
    throw new Error("Dialer agent name is required.");
  }

  validatePermissionOverrides(input.permissionOverrides, input.role);

  const duplicate = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (duplicate[0]) throw new Error("A user with this email already exists.");

  const profileId = newId();
  const temporaryPassword = generateTemporaryPassword();
  const [passwordHash, encryptedTemporaryPassword] = await Promise.all([
    hashPassword(temporaryPassword),
    Promise.resolve(encryptTemporaryPassword(temporaryPassword)),
  ]);
  const requestedDialerNames = [
    input.dialerName ?? "",
    ...input.dialerAliases,
  ].filter((nameInput) => nameInput.trim().length > 0);
  const seenRequestedDialerNames = new Set<string>();

  for (const dialerName of requestedDialerNames) {
    const normalizedName = normalizeDialerIdentity(dialerName);
    if (!normalizedName || seenRequestedDialerNames.has(normalizedName)) continue;
    seenRequestedDialerNames.add(normalizedName);
    await assertActiveDialerMappingAvailable("dialer", normalizedName);
  }

  await getDb().transaction(async (tx) => {
    await tx.insert(profiles).values({
      id: profileId,
      organizationId: actorOrganizationId(actor),
      email,
      name,
      shift,
      role: input.role,
      active: true,
      passwordHash,
      passwordState: "temporary",
      encryptedTemporaryPassword,
      accountStatus: "active",
      employmentStartDate: input.employmentStartDate || null,
      employmentStatus: "active",
    });

    if (input.teamId) {
      await tx.insert(teamMemberships).values({
        id: newId(),
        profileId,
        teamId: input.teamId,
        role: input.role,
        active: true,
        createdById: actor.id,
      });
    }

    const dialerNames = requestedDialerNames;
    const seenDialerNames = new Set<string>();

    for (const [index, dialerName] of dialerNames.entries()) {
      const normalizedName = normalizeDialerIdentity(dialerName);
      if (seenDialerNames.has(normalizedName)) continue;
      seenDialerNames.add(normalizedName);
      await tx.insert(sourceUserMappings).values(
        mappingValues({
          source: "dialer",
          sourceAgentName: dialerName,
          profileId,
          isPrimary: index === 0,
          actorId: actor.id,
        }),
      );
    }

    for (const override of input.permissionOverrides) {
      if (override.value === "inherit") continue;
      await tx.insert(userPermissionOverrides).values({
        profileId,
        permissionKey: override.permissionKey,
        allowed: override.value === "allow",
      });
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: input.importBatchId ? "user.imported" : "user.created",
      entityType: "profile",
      entityId: profileId,
      metadata: {
        after: {
          id: profileId,
          email,
          name,
          shift,
          role: input.role,
          accountStatus: "active",
          teamId: input.teamId ?? null,
          passwordState: "temporary",
          importBatchId: input.importBatchId,
        },
      },
    });
  });
  return { profileId };
}

export async function createAdminUser(actor: Actor, input: CreateUserInput) {
  assertAdmin(actor);
  return await createProvisionedUser(actor, input);
}

export async function createTeamAgent(actor: Actor, input: {
  name: string;
  email: string;
  teamId: string;
  dialerName: string;
  shift?: string;
  employmentStartDate?: string;
}) {
  if (actor.role !== "manager") throw new Error("Forbidden");
  await assertPermission(actor, "users.create_team_agent");
  if (!actor.teamIds.includes(input.teamId)) {
    throw new Error("Managers may create agents only in their assigned teams.");
  }
  const created = await createProvisionedUser(actor, {
    ...input,
    role: "agent",
    dialerAliases: [],
    permissionOverrides: [],
  });
  const invitation = await createInvitationRecord({
    profileId: created.profileId,
    createdById: actor.id,
  });
  await writeAudit({
    actorId: actor.id,
    action: "user.invitation_sent",
    entityType: "profile",
    entityId: created.profileId,
    metadata: { expiresAt: invitation.expiresAt.toISOString() },
  });
  const delivery = await deliverInvitationAfterCommit({
    actorId: actor.id,
    profileId: created.profileId,
    tokenId: invitation.tokenId,
    email: normalizeEmail(input.email),
    name: trimText(input.name),
    token: invitation.token,
    resent: false,
  });
  return { ...created, invitationDelivered: delivery.ok };
}

export async function revealTemporaryPassword(actor: Actor, userId: string) {
  assertAdmin(actor);

  const rows = await getDb()
    .select({
      accountStatus: profiles.accountStatus,
      passwordState: profiles.passwordState,
      encryptedTemporaryPassword: profiles.encryptedTemporaryPassword,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = rows[0];

  if (
    !profile ||
    profile.accountStatus === "deleted" ||
    profile.passwordState !== "temporary" ||
    !profile.encryptedTemporaryPassword
  ) {
    throw new Error("Temporary password is no longer available.");
  }

  const password = decryptTemporaryPassword(profile.encryptedTemporaryPassword);
  await writeAudit({
    actorId: actor.id,
    action: "user.temporary_password_viewed",
    entityType: "profile",
    entityId: userId,
  });
  return password;
}

export async function regenerateTemporaryPassword(actor: Actor, userId: string) {
  assertAdmin(actor);

  const temporaryPassword = generateTemporaryPassword();
  const [passwordHash, encryptedTemporaryPassword] = await Promise.all([
    hashPassword(temporaryPassword),
    Promise.resolve(encryptTemporaryPassword(temporaryPassword)),
  ]);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: profiles.id,
        accountStatus: profiles.accountStatus,
        passwordState: profiles.passwordState,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)
      .for("update");
    const profile = rows[0];

    if (
      !profile ||
      profile.accountStatus === "deleted" ||
      profile.passwordState !== "temporary"
    ) {
      throw new Error("Temporary password is no longer available.");
    }

    const now = new Date();
    await tx
      .update(profiles)
      .set({
        passwordHash,
        encryptedTemporaryPassword,
        passwordState: "temporary",
        passwordChangedAt: null,
        mustResetPassword: false,
      })
      .where(eq(profiles.id, userId));
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.profileId, userId), isNull(sessions.revokedAt)));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.temporary_password_regenerated",
      entityType: "profile",
      entityId: userId,
      metadata: { sessionsRevoked: true },
    });
  });
}

export async function bulkSendInvitations(actor: Actor, userIds: string[]) {
  assertAdmin(actor);
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean))).slice(0, 100);
  const outcomes = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const result = await sendOrResendInvitation(actor, userId);
        if (!result.ok) {
          return {
            userId,
            status: "failed" as const,
            reason: "The invitation email could not be delivered.",
          };
        }
        return { userId, status: "sent" as const };
      } catch (error) {
        return {
          userId,
          status: "skipped" as const,
          reason:
            error instanceof Error
              ? error.message
              : "The invitation could not be sent.",
        };
      }
    }),
  );

  await writeAudit({
    actorId: actor.id,
    action: "user.bulk_invitation_completed",
    entityType: "profile_batch",
    metadata: {
      selected: uniqueIds.length,
      successful: outcomes.filter((outcome) => outcome.status === "sent").length,
      skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    },
  });
  return outcomes;
}

export type PermanentDeletionApproval = {
  confirmation: string;
  expectedCount: number;
  expectedDigest: string;
  requiredAccountStatus: "deleted";
};

export async function permanentlyDeleteValidatedUsers(
  actor: Actor,
  input: { userIds: unknown; approval?: PermanentDeletionApproval },
) {
  assertAdmin(actor);
  const userIds = parseUserIds(input.userIds);

  if (userIds.includes(actor.id.toLowerCase())) {
    throw new Error("You cannot permanently delete your own account.");
  }

  return getDb().transaction(async (tx) => {
    const actorRows = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(
        eq(profiles.id, actor.id),
        eq(profiles.organizationId, actorOrganizationId(actor)),
        eq(profiles.role, "admin"),
        activeProfileWhere(actorOrganizationId(actor)),
      ))
      .limit(1)
      .for("update");
    if (!actorRows[0]) {
      throw new Error("An active administrator is required.");
    }

    const rows = await tx
      .select()
      .from(profiles)
      .where(and(
        inArray(profiles.id, userIds),
        eq(profiles.organizationId, actorOrganizationId(actor)),
      ))
      .for("update");

    if (rows.length !== userIds.length) {
      throw new Error("One or more selected users were not found.");
    }

    if (input.approval) {
      const currentTargetRows = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(
          eq(profiles.organizationId, actorOrganizationId(actor)),
          eq(profiles.accountStatus, input.approval.requiredAccountStatus),
        ))
        .orderBy(profiles.id)
        .for("update");
      const currentIds = currentTargetRows.map((row) => row.id).sort();
      const currentDigest = sortedIdDigest(currentIds);
      const expectedConfirmation =
        `PURGE_LEGACY_DELETED:${actorOrganizationId(actor)}:` +
        `${input.approval.expectedCount}:${input.approval.expectedDigest}`;

      if (input.approval.confirmation !== expectedConfirmation) {
        throw new Error(`Confirmation must exactly equal ${expectedConfirmation}`);
      }
      if (
        currentIds.length !== input.approval.expectedCount ||
        currentDigest !== input.approval.expectedDigest ||
        currentDigest !== sortedIdDigest(userIds) ||
        rows.some((profile) => profile.accountStatus !== "deleted")
      ) {
        throw new Error(
          "The legacy deleted-profile target set changed after dry run; run the dry run again.",
        );
      }
    }

    const activeAdminCount = await getActiveAdminCountForUpdate(
      tx,
      actorOrganizationId(actor),
    );
    const selectedActiveAdminCount = rows.filter(
      (profile) =>
        profile.role === "admin" &&
        profile.accountStatus === "active" &&
        profile.active,
    ).length;
    if (
      selectedActiveAdminCount > 0 &&
      activeAdminCount - selectedActiveAdminCount < 1
    ) {
      throw new Error("The final active admin cannot be changed.");
    }

    const emails = rows.flatMap((profile) =>
      profile.email ? [profile.email] : [],
    );
    const [metricReferences, importRowReferences] = await Promise.all([
      tx
        .select({
          versionId: dialerAgentHourlyMetrics.versionId,
          batchId: dialerAgentHourlyMetrics.batchId,
        })
        .from(dialerAgentHourlyMetrics)
        .where(inArray(dialerAgentHourlyMetrics.agentProfileId, userIds)),
      tx
        .select({
          versionId: dialerImportRows.versionId,
          batchId: dialerImportRows.batchId,
        })
        .from(dialerImportRows)
        .where(inArray(dialerImportRows.matchedAgentProfileId, userIds)),
    ]);
    const affectedVersionIds = Array.from(
      new Set(
        [...metricReferences, ...importRowReferences].flatMap((row) =>
          row.versionId ? [row.versionId] : [],
        ),
      ),
    );
    const affectedBatchIds = Array.from(
      new Set(
        [...metricReferences, ...importRowReferences].flatMap((row) =>
          row.batchId ? [row.batchId] : [],
        ),
      ),
    );
    const [ownedCoachingRows, coachingParticipantRows] = await Promise.all([
      tx
        .select({ id: coachingSessions.id })
        .from(coachingSessions)
        .where(
          or(
            inArray(coachingSessions.createdByProfileId, userIds),
            inArray(coachingSessions.coachProfileId, userIds),
          ),
        ),
      tx
        .select({ sessionId: coachingSessionParticipants.sessionId })
        .from(coachingSessionParticipants)
        .where(inArray(coachingSessionParticipants.agentProfileId, userIds)),
    ]);
    const ownedCoachingSessionIds = ownedCoachingRows.map((row) => row.id);
    const participantSessionIds = Array.from(
      new Set(coachingParticipantRows.map((row) => row.sessionId)),
    );

    // Preserve shared import history while removing references to the account.
    await tx
      .update(userImportBatches)
      .set({ uploadedById: actor.id })
      .where(inArray(userImportBatches.uploadedById, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ uploadedById: actor.id })
      .where(inArray(dialerImportBatches.uploadedById, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ confirmedById: null })
      .where(inArray(dialerImportBatches.confirmedById, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ publishedById: null })
      .where(inArray(dialerImportBatches.publishedById, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ legacyWarningReviewerId: null })
      .where(inArray(dialerImportBatches.legacyWarningReviewerId, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ rejectedById: null })
      .where(inArray(dialerImportBatches.rejectedById, userIds));
    await tx
      .update(dialerImportBatches)
      .set({ rolledBackById: null })
      .where(inArray(dialerImportBatches.rolledBackById, userIds));

    await tx
      .update(teamMemberships)
      .set({ createdById: null })
      .where(inArray(teamMemberships.createdById, userIds));
    await tx
      .update(sourceUserMappings)
      .set({ approvedById: null })
      .where(inArray(sourceUserMappings.approvedById, userIds));
    await tx
      .update(sourceUserMappings)
      .set({ deactivatedById: null })
      .where(inArray(sourceUserMappings.deactivatedById, userIds));
    await tx
      .update(accountInvitationTokens)
      .set({ createdById: null })
      .where(inArray(accountInvitationTokens.createdById, userIds));
    await tx
      .update(passwordResetTokens)
      .set({ createdById: null })
      .where(inArray(passwordResetTokens.createdById, userIds));

    await tx
      .delete(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.agentProfileId, userIds));
    await tx
      .delete(dialerImportRows)
      .where(inArray(dialerImportRows.matchedAgentProfileId, userIds));
    await tx
      .delete(transfersFixtures)
      .where(inArray(transfersFixtures.agentProfileId, userIds));
    await tx
      .delete(emailDeliveryAttempts)
      .where(or(
        inArray(emailDeliveryAttempts.profileId, userIds),
        emails.length > 0
          ? inArray(emailDeliveryAttempts.recipientEmail, emails)
          : undefined,
      ));
    await tx
      .delete(accountInvitationTokens)
      .where(inArray(accountInvitationTokens.profileId, userIds));
    await tx
      .delete(passwordResetTokens)
      .where(inArray(passwordResetTokens.profileId, userIds));
    await tx.delete(sessions).where(inArray(sessions.profileId, userIds));
    await tx
      .delete(userPermissionOverrides)
      .where(inArray(userPermissionOverrides.profileId, userIds));
    await tx
      .delete(sourceUserMappings)
      .where(inArray(sourceUserMappings.profileId, userIds));
    await tx
      .delete(teamMemberships)
      .where(inArray(teamMemberships.profileId, userIds));
    if (ownedCoachingSessionIds.length > 0) {
      await tx
        .delete(coachingSessionParticipants)
        .where(
          inArray(
            coachingSessionParticipants.sessionId,
            ownedCoachingSessionIds,
          ),
        );
      await tx
        .delete(coachingSessions)
        .where(inArray(coachingSessions.id, ownedCoachingSessionIds));
    }
    await tx
      .delete(coachingSessionParticipants)
      .where(inArray(coachingSessionParticipants.agentProfileId, userIds));
    const remainingCandidateIds = participantSessionIds.filter(
      (id) => !ownedCoachingSessionIds.includes(id),
    );
    let emptiedCoachingSessionIds: string[] = [];
    if (remainingCandidateIds.length > 0) {
      const remainingRows = await tx
        .select({
          sessionId: coachingSessionParticipants.sessionId,
          total: count(),
        })
        .from(coachingSessionParticipants)
        .where(
          inArray(coachingSessionParticipants.sessionId, remainingCandidateIds),
        )
        .groupBy(coachingSessionParticipants.sessionId);
      const nonEmptyIds = new Set(remainingRows.map((row) => row.sessionId));
      emptiedCoachingSessionIds = remainingCandidateIds.filter(
        (id) => !nonEmptyIds.has(id),
      );
      if (emptiedCoachingSessionIds.length > 0) {
        await tx
          .delete(coachingSessions)
          .where(inArray(coachingSessions.id, emptiedCoachingSessionIds));
      }
    }
    await tx
      .delete(auditLogs)
      .where(or(
        inArray(auditLogs.actorProfileId, userIds),
        inArray(auditLogs.entityId, userIds),
      ));

    for (const versionId of affectedVersionIds) {
      const [totals] = await tx
        .select({
          rowCount: count(),
          matchedAgentCount: countDistinct(dialerAgentHourlyMetrics.agentProfileId),
          totalCalls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
          totalLoggedInSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.loggedInSeconds}), 0)`,
          totalTalkSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.talkSeconds}), 0)`,
          totalWrapSeconds: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.wrapSeconds}), 0)`,
        })
        .from(dialerAgentHourlyMetrics)
        .where(eq(dialerAgentHourlyMetrics.versionId, versionId));
      await tx
        .update(dialerDatasetVersions)
        .set({
          rowCount: Number(totals?.rowCount ?? 0),
          matchedAgentCount: Number(totals?.matchedAgentCount ?? 0),
          totalCalls: Number(totals?.totalCalls ?? 0),
          totalLoggedInSeconds: Number(totals?.totalLoggedInSeconds ?? 0),
          totalTalkSeconds: Number(totals?.totalTalkSeconds ?? 0),
          totalWrapSeconds: Number(totals?.totalWrapSeconds ?? 0),
        })
        .where(eq(dialerDatasetVersions.id, versionId));
    }

    for (const batchId of affectedBatchIds) {
      const [totals] = await tx
        .select({
          rowCount: count(),
          matchedAgentCount: sql<number>`count(distinct case when ${dialerImportRows.matchedAgentProfileId} is not null then ${dialerImportRows.matchedAgentProfileId} end)`,
          unmatchedAgentCount: sql<number>`count(distinct case when ${dialerImportRows.matchedAgentProfileId} is null then ${dialerImportRows.normalizedAgentName} end)`,
        })
        .from(dialerImportRows)
        .where(eq(dialerImportRows.batchId, batchId));
      await tx
        .update(dialerImportBatches)
        .set({
          rowCount: Number(totals?.rowCount ?? 0),
          matchedAgentCount: Number(totals?.matchedAgentCount ?? 0),
          unmatchedAgentCount: Number(totals?.unmatchedAgentCount ?? 0),
        })
        .where(eq(dialerImportBatches.id, batchId));
    }

    await tx.delete(profiles).where(inArray(profiles.id, userIds));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.permanently_deleted",
      entityType: "profile_batch",
      metadata: {
        deletedCount: userIds.length,
        affectedVersionCount: affectedVersionIds.length,
        affectedImportCount: affectedBatchIds.length,
        removedCoachingSessionCount:
          ownedCoachingSessionIds.length + emptiedCoachingSessionIds.length,
      },
    });

    return { deletedIds: userIds };
  });
}

export async function permanentlyDeleteUsers(
  actor: Actor,
  input: { userIds: unknown },
) {
  return permanentlyDeleteValidatedUsers(actor, {
    userIds: parseBulkUserIds(input.userIds),
  });
}

export async function permanentlyDeleteUser(
  actor: Actor,
  input: { userId: string },
) {
  try {
    return await permanentlyDeleteUsers(actor, { userIds: [input.userId] });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "One or more selected users were not found."
    ) {
      throw new Error("User was not found.");
    }
    throw error;
  }
}

export async function getAdminUserDetails(actor: Actor, userId: string) {
  assertAdmin(actor);

  const profileRows = await getDb()
    .select()
    .from(profiles)
    .where(and(
      eq(profiles.id, userId),
      eq(profiles.organizationId, actorOrganizationId(actor)),
    ))
    .limit(1);
  const profile = profileRows[0];

  if (!profile || !profile.email || profile.accountStatus === "deleted") return null;

  const [
    membershipRows,
    mappingRows,
    overrideRows,
    invitationRows,
    resetRows,
    sessionRows,
    auditRows,
    teamRows,
  ] = await Promise.all([
    getDb()
      .select({
        id: teamMemberships.id,
        teamId: teamMemberships.teamId,
        teamName: teams.name,
        role: teamMemberships.role,
        active: teamMemberships.active,
        startedAt: teamMemberships.startedAt,
        endedAt: teamMemberships.endedAt,
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .where(eq(teamMemberships.profileId, userId))
      .orderBy(desc(teamMemberships.startedAt)),
    getDb()
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.profileId, userId))
      .orderBy(desc(sourceUserMappings.active), desc(sourceUserMappings.isPrimary)),
    getDb()
      .select()
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.profileId, userId)),
    getDb()
      .select()
      .from(accountInvitationTokens)
      .where(eq(accountInvitationTokens.profileId, userId))
      .orderBy(desc(accountInvitationTokens.createdAt)),
    getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.profileId, userId))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(5),
    getDb()
      .select({ total: count() })
      .from(sessions)
      .where(
        and(
          eq(sessions.profileId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      ),
    getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "profile"), eq(auditLogs.entityId, userId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25),
    getDb()
      .select({ id: teams.id, name: teams.name, active: teams.active })
      .from(teams)
      .where(visibleTeamWhere(actor))
      .orderBy(asc(teams.name)),
  ]);

  const latestInvitation = invitationRows[0];
  const activeMembership =
    membershipRows.find((membership) => membership.active && !membership.endedAt) ??
    null;

  return {
    profile,
    teams: teamRows,
    activeMembership,
    memberships: membershipRows,
    mappings: mappingRows,
    overrides: overrideRows,
    invitationStatus: invitationStatus(
      latestInvitation,
      profile.passwordState,
      profile.passwordChangedAt,
    ),
    invitations: invitationRows,
    passwordResets: resetRows,
    activeSessionCount: sessionRows[0]?.total ?? 0,
    audits: auditRows,
  };
}

export async function updateUserEmail(
  actor: Actor,
  input: { userId: string; email: string },
): Promise<Extract<InlineUserUpdateResult, { field: "email" }>> {
  assertAdmin(actor);

  const email = normalizeEmail(input.email);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!isValidEmail || email.length > 255) {
    throw new Error("Enter a valid email address.");
  }

  try {
    return await getDb().transaction(async (tx) => {
      const profileRows = await tx
        .select({
          id: profiles.id,
          email: profiles.email,
          accountStatus: profiles.accountStatus,
        })
        .from(profiles)
        .where(eq(profiles.id, input.userId))
        .limit(1)
        .for("update");
      const profile = profileRows[0];

      if (!profile || profile.accountStatus === "deleted") {
        throw new Error("User was not found.");
      }

      if (profile.email === email) {
        return { field: "email", value: email, changed: false };
      }

      const duplicateRows = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.email, email), ne(profiles.id, input.userId)))
        .limit(1)
        .for("update");

      if (duplicateRows[0]) {
        throw new Error("Another user already owns this email address.");
      }

      const now = new Date();

      await tx
        .update(accountInvitationTokens)
        .set({ revokedAt: now, deliveryStatus: "revoked" })
        .where(
          and(
            eq(accountInvitationTokens.profileId, input.userId),
            isNull(accountInvitationTokens.usedAt),
            isNull(accountInvitationTokens.revokedAt),
          ),
        );
      await tx
        .update(passwordResetTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(passwordResetTokens.profileId, input.userId),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
      await tx
        .update(profiles)
        .set({ email })
        .where(eq(profiles.id, input.userId));
      await tx.insert(auditLogs).values({
        id: newId(),
        actorProfileId: actor.id,
        action: "user.email_updated",
        entityType: "profile",
        entityId: input.userId,
        metadata: {
          before: { email: profile.email },
          after: { email },
          outstandingTokensRevoked: true,
        },
      });

      return { field: "email", value: email, changed: true };
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new Error("Another user already owns this email address.");
    }
    throw error;
  }
}

export async function updateUserShift(
  actor: Actor,
  input: { userId: string; shift: string },
): Promise<Extract<InlineUserUpdateResult, { field: "shift" }>> {
  assertAdmin(actor);
  const shift = normalizeShift(input.shift);

  return getDb().transaction(async (tx) => {
    const profileRows = await tx
      .select({
        id: profiles.id,
        shift: profiles.shift,
        accountStatus: profiles.accountStatus,
      })
      .from(profiles)
      .where(and(
        eq(profiles.id, input.userId),
        eq(profiles.organizationId, actorOrganizationId(actor)),
      ))
      .limit(1)
      .for("update");
    const profile = profileRows[0];

    if (!profile || profile.accountStatus === "deleted") {
      throw new Error("User was not found.");
    }
    if (profile.shift === shift) {
      return { field: "shift", value: shift ?? "", changed: false };
    }

    await tx
      .update(profiles)
      .set({ shift })
      .where(eq(profiles.id, input.userId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.shift_updated",
      entityType: "profile",
      entityId: input.userId,
      metadata: {
        before: { shift: profile.shift },
        after: { shift },
      },
    });

    return { field: "shift", value: shift ?? "", changed: true };
  });
}


export async function updateUserPrimaryDialerName(
  actor: Actor,
  input: { userId: string; dialerName: string },
): Promise<Extract<InlineUserUpdateResult, { field: "dialerName" }>> {
  assertAdmin(actor);

  const sourceAgentName = normalizeDialerDisplayName(input.dialerName);
  const normalizedAgentName = normalizeDialerIdentity(sourceAgentName);

  if (!normalizedAgentName) {
    throw new Error("Dialer name is required.");
  }
  if (sourceAgentName.length > 255) {
    throw new Error("Dialer name must be 255 characters or fewer.");
  }

  try {
    return await getDb().transaction(async (tx) => {
      const profileRows = await tx
        .select({ id: profiles.id, accountStatus: profiles.accountStatus })
        .from(profiles)
        .where(eq(profiles.id, input.userId))
        .limit(1)
        .for("update");
      const profile = profileRows[0];

      if (!profile || profile.accountStatus === "deleted") {
        throw new Error("User was not found.");
      }

      const activeMappings = await tx
        .select()
        .from(sourceUserMappings)
        .where(
          and(
            eq(sourceUserMappings.profileId, input.userId),
            eq(sourceUserMappings.source, "dialer"),
            eq(sourceUserMappings.active, true),
          ),
        )
        .for("update");
      const currentPrimary =
        activeMappings.find((mapping) => mapping.isPrimary) ?? null;

      if (
        currentPrimary &&
        currentPrimary.sourceAgentName === sourceAgentName &&
        currentPrimary.normalizedAgentName === normalizedAgentName
      ) {
        return {
          field: "dialerName",
          value: currentPrimary.sourceAgentName,
          normalizedValue: currentPrimary.normalizedAgentName,
          changed: false,
        };
      }

      const duplicateRows = await tx
        .select()
        .from(sourceUserMappings)
        .where(
          eq(
            sourceUserMappings.activeMappingKey,
            activeMappingKey("dialer", normalizedAgentName),
          ),
        )
        .limit(1)
        .for("update");
      const duplicate = duplicateRows[0];

      if (duplicate && duplicate.profileId !== input.userId) {
        throw new Error("Another user already owns this dialer name.");
      }

      const mappingsToDeactivate = Array.from(
        new Set(
          [currentPrimary?.id, duplicate?.id].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      );
      const now = new Date();

      if (mappingsToDeactivate.length > 0) {
        await tx
          .update(sourceUserMappings)
          .set({
            active: false,
            isPrimary: false,
            activeMappingKey: null,
            primaryMappingKey: null,
            deactivatedAt: now,
            deactivatedById: actor.id,
          })
          .where(inArray(sourceUserMappings.id, mappingsToDeactivate));
      }

      await tx
        .update(sourceUserMappings)
        .set({ isPrimary: false, primaryMappingKey: null })
        .where(
          and(
            eq(sourceUserMappings.profileId, input.userId),
            eq(sourceUserMappings.source, "dialer"),
            eq(sourceUserMappings.active, true),
          ),
        );

      const values = mappingValues({
        source: "dialer",
        sourceAgentName,
        profileId: input.userId,
        isPrimary: true,
        actorId: actor.id,
      });

      await tx.insert(sourceUserMappings).values(values);
      await tx.insert(auditLogs).values({
        id: newId(),
        actorProfileId: actor.id,
        action: "user.primary_dialer_updated",
        entityType: "profile",
        entityId: input.userId,
        metadata: {
          before: currentPrimary
            ? {
                sourceAgentName: currentPrimary.sourceAgentName,
                normalizedAgentName: currentPrimary.normalizedAgentName,
              }
            : null,
          after: {
            sourceAgentName: values.sourceAgentName,
            normalizedAgentName: values.normalizedAgentName,
          },
          previousMappingId: currentPrimary?.id ?? null,
          mappingId: values.id,
        },
      });

      return {
        field: "dialerName",
        value: values.sourceAgentName,
        normalizedValue: values.normalizedAgentName,
        changed: true,
      };
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new Error("Another user already owns this dialer name.");
    }
    throw error;
  }
}

export async function moveUserToTeam(
  actor: Actor,
  input: { userId: string; teamId: string },
): Promise<Extract<InlineUserUpdateResult, { field: "teamId" }>> {
  assertAdmin(actor);

  if (!input.teamId) {
    throw new Error("Select an active team.");
  }

  return getDb().transaction(async (tx) => {
    const profileRows = await tx
      .select({
        id: profiles.id,
        role: profiles.role,
        accountStatus: profiles.accountStatus,
      })
      .from(profiles)
      .where(and(
        eq(profiles.id, input.userId),
        eq(profiles.organizationId, actorOrganizationId(actor)),
      ))
      .limit(1)
      .for("update");
    const profile = profileRows[0];

    if (!profile || profile.accountStatus === "deleted") {
      throw new Error("User was not found.");
    }
    if (profile.role !== "agent" && profile.role !== "manager") {
      throw new Error("Team can only be changed for agents and managers.");
    }

    const teamRows = await tx
      .select({ id: teams.id, name: teams.name, active: teams.active })
      .from(teams)
      .where(and(eq(teams.id, input.teamId), visibleTeamWhere(actor)))
      .limit(1)
      .for("update");
    const team = teamRows[0];

    if (!team) throw new Error("Team was not found.");
    if (!team.active) throw new Error("Select an active team.");

    const activeMemberships = await tx
      .select({
        id: teamMemberships.id,
        teamId: teamMemberships.teamId,
        role: teamMemberships.role,
      })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.profileId, input.userId),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
        ),
      )
      .for("update");
    const currentMembership = activeMemberships[0] ?? null;

    if (
      activeMemberships.some(
        (membership) => membership.teamId === input.teamId,
      )
    ) {
      return {
        field: "teamId",
        value: input.teamId,
        teamName: team.name,
        changed: false,
      };
    }

    const now = new Date();

    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: now })
      .where(
        and(
          eq(teamMemberships.profileId, input.userId),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
        ),
      );

    const membershipId = newId();
    await tx.insert(teamMemberships).values({
      id: membershipId,
      profileId: input.userId,
      teamId: input.teamId,
      role: profile.role,
      active: true,
      createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.team_moved",
      entityType: "profile",
      entityId: input.userId,
        metadata: {
          before: currentMembership
            ? {
              teamId: currentMembership.teamId,
              role: currentMembership.role,
            }
            : null,
          after: {
            teamId: input.teamId,
            teamName: team.name,
            role: profile.role,
          },
          membershipId,
        },
      });

    return {
      field: "teamId",
      value: input.teamId,
      teamName: team.name,
      changed: true,
    };
  });
}

export async function updateAdminUser(actor: Actor, input: UpdateUserInput) {
  assertAdmin(actor);
  assertValidRole(input.role);

  if (actor.id === input.userId && input.role !== "admin") {
    throw new Error("You cannot demote your own admin role.");
  }

  const name = trimText(input.name);
  const email = normalizeEmail(input.email);
  const shift = normalizeShift(input.shift);

  if (name.length < 2) throw new Error("Full name is required.");
  if (!email.includes("@")) throw new Error("A valid email is required.");
  if (input.role === "manager" && !input.teamId) {
    throw new Error("Select a team before changing this user to manager.");
  }
  if (input.role === "agent" && !input.teamId) {
    throw new Error("Select a team before changing this user to agent.");
  }
  if (roleRequiresTeam(input.role)) {
    await validateTeamForAssignment(actor, input.teamId);
  }

  validatePermissionOverrides(input.permissionOverrides, input.role);

  if (
    actor.id === input.userId &&
    input.permissionOverrides.some(
      (override) =>
        override.permissionKey === "users.manage_permissions" &&
        override.value === "deny",
    )
  ) {
    throw new Error("You cannot deny your own permission-management access.");
  }

  await getDb().transaction(async (tx) => {
    const profileRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.userId))
      .limit(1)
      .for("update");
    const profile = profileRows[0];

    if (!profile) throw new Error("User was not found.");
    if (profile.accountStatus === "deleted") {
      throw new Error("Deleted users cannot be edited.");
    }

    const duplicateRows = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.email, email), ne(profiles.id, input.userId)))
      .limit(1);

    if (duplicateRows[0]) throw new Error("A user with this email already exists.");

    const activeAdminCount = await getActiveAdminCountForUpdate(
      tx,
      actorOrganizationId(actor),
    );
    assertCanRemoveAdmin({
      targetRole: profile.role,
      targetStatus: profile.accountStatus,
      activeAdminCount,
      nextRole: input.role,
    });

    if (input.role === "agent" && !(await hasActiveDialerMapping(tx, input.userId))) {
      throw new Error("Assign a dialer name before changing this user to agent.");
    }

    await tx
      .update(profiles)
      .set({ name, email, role: input.role, shift })
      .where(eq(profiles.id, input.userId));

    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: new Date() })
      .where(
        and(
          eq(teamMemberships.profileId, input.userId),
          isNull(teamMemberships.endedAt),
          eq(teamMemberships.active, true),
        ),
      );

    if (roleRequiresTeam(input.role) && input.teamId) {
      await tx.insert(teamMemberships).values({
        id: newId(),
        profileId: input.userId,
        teamId: input.teamId,
        role: input.role === "manager" ? "manager" : "agent",
        active: true,
        createdById: actor.id,
      });
    }

    await tx
      .delete(userPermissionOverrides)
      .where(eq(userPermissionOverrides.profileId, input.userId));

    const overrideValues = input.permissionOverrides
      .filter((override) => override.value !== "inherit")
      .map((override) => ({
        profileId: input.userId,
        permissionKey: override.permissionKey,
        allowed: override.value === "allow",
      }));

    if (overrideValues.length > 0) {
      await tx.insert(userPermissionOverrides).values(overrideValues);
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.updated",
      entityType: "profile",
      entityId: input.userId,
      metadata: {
        before: safeProfileState(profile),
        after: {
          id: input.userId,
          email,
          name,
          role: input.role,
          shift,
          teamId: input.teamId ?? null,
        },
      },
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "permission.override.updated",
      entityType: "profile",
      entityId: input.userId,
      metadata: {
        supportedNamespaces: ["teams", "imports"],
        overrideCount: overrideValues.length,
      },
    });
  });
}

export async function sendOrResendInvitation(actor: Actor, userId: string) {
  assertAdmin(actor);

  const profileRows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = profileRows[0];

  if (
    !profile ||
    !profile.email ||
    !(
      (profile.accountStatus === "active" &&
        profile.passwordState === "temporary") ||
      (profile.accountStatus === "invited" && !profile.passwordHash)
    )
  ) {
    throw new Error("This account does not need an invitation.");
  }
  const recipientEmail = profile.email;

  const previousRows = await getDb()
    .select({ id: accountInvitationTokens.id })
    .from(accountInvitationTokens)
    .where(
      and(
        eq(accountInvitationTokens.profileId, userId),
        isNull(accountInvitationTokens.usedAt),
        isNull(accountInvitationTokens.revokedAt),
      ),
    );
  const invitation = await createInvitationRecord({
    profileId: userId,
    createdById: actor.id,
  });

  await writeAudit({
    actorId: actor.id,
    action: previousRows.length > 0 ? "user.invitation_resent" : "user.invitation_sent",
    entityType: "profile",
    entityId: userId,
    metadata: { expiresAt: invitation.expiresAt.toISOString() },
  });

  return deliverInvitationAfterCommit({
    actorId: actor.id,
    profileId: userId,
    tokenId: invitation.tokenId,
    email: recipientEmail,
    name: profile.name,
    token: invitation.token,
    resent: previousRows.length > 0,
  });
}

export async function revokeInvitation(actor: Actor, userId: string) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    await tx
      .update(accountInvitationTokens)
      .set({ revokedAt: new Date(), deliveryStatus: "revoked" })
      .where(
        and(
          eq(accountInvitationTokens.profileId, userId),
          isNull(accountInvitationTokens.usedAt),
          isNull(accountInvitationTokens.revokedAt),
        ),
      );
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.invitation_revoked",
      entityType: "profile",
      entityId: userId,
    });
  });
}

export async function forcePasswordReset(actor: Actor, input: {
  userId: string;
  revokeSessions: boolean;
}) {
  assertAdmin(actor);

  const token = createOpaqueToken();
  const tokenId = newId();

  const profile = await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.userId))
      .limit(1)
      .for("update");
    const current = rows[0];

    if (!current || current.accountStatus !== "active") {
      throw new Error("Only active users can receive a password reset.");
    }

    if (!current.email) throw new Error("This user does not have a login email.");
    const resetProfile = { id: current.id, email: current.email, name: current.name };
    const now = new Date();

    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.profileId, input.userId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
    await tx.insert(passwordResetTokens).values({
      id: tokenId,
      profileId: input.userId,
      tokenHash: hashOpaqueToken(token),
      createdById: actor.id,
      expiresAt: new Date(
        now.getTime() + getEnv().PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
      ),
    });
    await tx
      .update(profiles)
      .set({ mustResetPassword: true })
      .where(eq(profiles.id, input.userId));

    if (input.revokeSessions) {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.profileId, input.userId), isNull(sessions.revokedAt)));
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "user.password_reset_forced",
      entityType: "profile",
      entityId: input.userId,
      metadata: { sessionsRevoked: input.revokeSessions },
    });

    return resetProfile;
  });

  return deliverPasswordResetAfterCommit({
    profileId: profile.id,
    tokenId,
    email: profile.email,
    name: profile.name,
    token,
  });
}

export async function setUserAccountStatus(actor: Actor, input: {
  userId: string;
  status: "active" | "deactivated" | "revoked";
}) {
  assertAdmin(actor);

  let revokedNotice: { profileId: string; email: string; name: string } | null = null;

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.userId))
      .limit(1)
      .for("update");
    const profile = rows[0];

    if (!profile) throw new Error("User was not found.");
    if (profile.accountStatus === "deleted") {
      throw new Error("Deleted users cannot be reactivated.");
    }

    const activeAdminCount = await getActiveAdminCountForUpdate(
      tx,
      actorOrganizationId(actor),
    );
    assertCanRemoveAdmin({
      targetRole: profile.role,
      targetStatus: profile.accountStatus,
      activeAdminCount,
      nextStatus: input.status,
    });

    if (input.status === "active" && !profile.passwordHash) {
      throw new Error("Invited users must accept an invitation before activation.");
    }

    const now = new Date();
    const active = input.status === "active";

    await tx
      .update(profiles)
      .set({
        active,
        accountStatus: input.status,
        accessRevokedAt: input.status === "revoked" ? now : null,
      })
      .where(eq(profiles.id, input.userId));

    if (input.status !== "active") {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.profileId, input.userId), isNull(sessions.revokedAt)));
    }

    if (input.status === "revoked") {
      await tx
        .update(accountInvitationTokens)
        .set({ revokedAt: now, deliveryStatus: "revoked" })
        .where(
          and(
            eq(accountInvitationTokens.profileId, input.userId),
            isNull(accountInvitationTokens.usedAt),
            isNull(accountInvitationTokens.revokedAt),
          ),
        );
      await tx
        .update(passwordResetTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(passwordResetTokens.profileId, input.userId),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
      if (profile.email) {
        revokedNotice = { profileId: profile.id, email: profile.email, name: profile.name };
      }
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action:
        input.status === "active"
          ? "user.activated"
          : input.status === "deactivated"
            ? "user.deactivated"
            : "user.access_revoked",
      entityType: "profile",
      entityId: input.userId,
      metadata: { before: safeProfileState(profile), after: { accountStatus: input.status } },
    });
  });

  if (revokedNotice) {
    await sendAccessRevokedNotice(revokedNotice);
  }
}

export async function revokeUserSessions(actor: Actor, input: {
  userId: string;
  includeCurrentSession: boolean;
}) {
  assertAdmin(actor);

  const currentSessionId =
    actor.id === input.userId && !input.includeCurrentSession
      ? await getCurrentSessionId()
      : null;

  if (actor.id === input.userId && !input.includeCurrentSession) {
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.profileId, input.userId),
          isNull(sessions.revokedAt),
          currentSessionId ? ne(sessions.id, currentSessionId) : undefined,
        ),
      );
  } else {
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.profileId, input.userId), isNull(sessions.revokedAt)));
  }

  await writeAudit({
    actorId: actor.id,
    action: "user.sessions_revoked",
    entityType: "profile",
    entityId: input.userId,
    metadata: { includeCurrentSession: input.includeCurrentSession },
  });
}

export async function addDialerMapping(actor: Actor, input: {
  userId: string;
  sourceAgentName: string;
  makePrimary: boolean;
}) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const profileRows = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, input.userId))
      .limit(1)
      .for("update");

    if (!profileRows[0]) throw new Error("User was not found.");

    if (input.makePrimary) {
      await tx
        .update(sourceUserMappings)
        .set({ isPrimary: false, primaryMappingKey: null })
        .where(
          and(
            eq(sourceUserMappings.profileId, input.userId),
            eq(sourceUserMappings.source, "dialer"),
            eq(sourceUserMappings.active, true),
          ),
        );
    }

    const values = mappingValues({
      source: "dialer",
      sourceAgentName: input.sourceAgentName,
      profileId: input.userId,
      isPrimary: input.makePrimary,
      actorId: actor.id,
    });
    const duplicateRows = await tx
      .select({ id: sourceUserMappings.id })
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.activeMappingKey, values.activeMappingKey))
      .limit(1);

    if (duplicateRows[0]) {
      throw new Error("This active dialer identity is already mapped.");
    }

    await tx.insert(sourceUserMappings).values(values);
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "dialer_mapping.created",
      entityType: "source_user_mapping",
      entityId: values.id,
      metadata: { after: values },
    });
  });
}

export async function editDialerMapping(actor: Actor, input: {
  mappingId: string;
  sourceAgentName: string;
}) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.id, input.mappingId))
      .limit(1)
      .for("update");
    const mapping = rows[0];

    if (!mapping || !mapping.active) {
      throw new Error("Active mapping was not found.");
    }

    const values = mappingValues({
      source: mapping.source,
      sourceAgentName: input.sourceAgentName,
      profileId: mapping.profileId,
      isPrimary: mapping.isPrimary,
      actorId: actor.id,
    });
    const duplicateRows = await tx
      .select({ id: sourceUserMappings.id })
      .from(sourceUserMappings)
      .where(
        and(
          eq(sourceUserMappings.activeMappingKey, values.activeMappingKey),
          ne(sourceUserMappings.id, mapping.id),
        ),
      )
      .limit(1)
      .for("update");

    if (duplicateRows[0]) {
      throw new Error("This active dialer identity is already mapped.");
    }

    const now = new Date();

    await tx
      .update(sourceUserMappings)
      .set({
        active: false,
        activeMappingKey: null,
        primaryMappingKey: null,
        isPrimary: false,
        deactivatedAt: now,
        deactivatedById: actor.id,
      })
      .where(eq(sourceUserMappings.id, mapping.id));
    await tx.insert(sourceUserMappings).values(values);
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "dialer_mapping.edited",
      entityType: "source_user_mapping",
      entityId: values.id,
      metadata: {
        before: {
          id: mapping.id,
          sourceAgentName: mapping.sourceAgentName,
          normalizedAgentName: mapping.normalizedAgentName,
          isPrimary: mapping.isPrimary,
        },
        after: {
          id: values.id,
          sourceAgentName: values.sourceAgentName,
          normalizedAgentName: values.normalizedAgentName,
          isPrimary: values.isPrimary,
        },
      },
    });
  });
}

export async function deactivateDialerMapping(actor: Actor, mappingId: string) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.id, mappingId))
      .limit(1)
      .for("update");
    const mapping = rows[0];

    if (!mapping) throw new Error("Mapping was not found.");

    await tx
      .update(sourceUserMappings)
      .set({
        active: false,
        activeMappingKey: null,
        primaryMappingKey: null,
        isPrimary: false,
        deactivatedAt: new Date(),
        deactivatedById: actor.id,
      })
      .where(eq(sourceUserMappings.id, mappingId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "dialer_mapping.deactivated",
      entityType: "source_user_mapping",
      entityId: mappingId,
      metadata: { before: mapping },
    });
  });
}

export async function setPrimaryDialerMapping(actor: Actor, mappingId: string) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.id, mappingId))
      .limit(1)
      .for("update");
    const mapping = rows[0];

    if (!mapping || !mapping.active) throw new Error("Active mapping was not found.");

    await tx
      .update(sourceUserMappings)
      .set({ isPrimary: false, primaryMappingKey: null })
      .where(
        and(
          eq(sourceUserMappings.profileId, mapping.profileId),
          eq(sourceUserMappings.source, mapping.source),
          eq(sourceUserMappings.active, true),
        ),
      );
    await tx
      .update(sourceUserMappings)
      .set({
        isPrimary: true,
        primaryMappingKey: primaryMappingKey(mapping.source, mapping.profileId),
      })
      .where(eq(sourceUserMappings.id, mappingId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "dialer_mapping.primary_changed",
      entityType: "source_user_mapping",
      entityId: mappingId,
    });
  });
}

export async function getUnmappedDialerNames(actor: Actor) {
  assertAdmin(actor);

  const rows = await getDb()
    .select({
      batchId: dialerImportBatches.id,
      fileName: dialerImportBatches.fileName,
      batchStatus: dialerImportBatches.status,
      uploadedAt: dialerImportBatches.createdAt,
      uploadedBy: profiles.name,
      rawRow: importErrors.rawRow,
    })
    .from(importErrors)
    .innerJoin(dialerImportBatches, eq(dialerImportBatches.id, importErrors.batchId))
    .innerJoin(profiles, eq(profiles.id, dialerImportBatches.uploadedById))
    .where(
      and(
        eq(importErrors.status, "unknown"),
        inArray(dialerImportBatches.status, [
          "draft",
          "validation_failed",
          "ready_to_publish",
        ]),
      ),
    )
    .orderBy(desc(dialerImportBatches.createdAt));

  const grouped = new Map<string, {
    dialerName: string;
    normalizedName: string;
    affectedRowCount: number;
    files: {
      batchId: string;
      fileName: string;
      batchStatus: string;
      uploadedAt: Date;
      uploadedBy: string;
    }[];
  }>();

  for (const row of rows) {
    const raw = row.rawRow ?? {};
    const dialerName = normalizeDialerDisplayName(String(raw.agent ?? ""));
    const normalizedName = normalizeDialerIdentity(dialerName);

    if (!normalizedName) continue;

    const current = grouped.get(normalizedName) ?? {
      dialerName,
      normalizedName,
      affectedRowCount: 0,
      files: [],
    };
    current.affectedRowCount += 1;
    if (!current.files.some((file) => file.batchId === row.batchId)) {
      current.files.push({
        batchId: row.batchId,
        fileName: row.fileName,
        batchStatus: row.batchStatus,
        uploadedAt: row.uploadedAt,
        uploadedBy: row.uploadedBy,
      });
    }
    grouped.set(normalizedName, current);
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.dialerName.localeCompare(right.dialerName),
  );
}

export async function ignoreUnmappedDialerName(actor: Actor, input: {
  dialerName: string;
  reason: string;
}) {
  assertAdmin(actor);
  const dialerName = normalizeDialerDisplayName(input.dialerName);
  const reason = input.reason.trim();

  if (!dialerName) throw new Error("Dialer name is required.");
  if (reason.length < 5) throw new Error("Ignore reason is required.");

  await writeAudit({
    actorId: actor.id,
    action: "dialer_mapping.unknown_ignored",
    entityType: "source_user_mapping",
    metadata: {
      source: "dialer",
      dialerName,
      normalizedAgentName: normalizeDialerIdentity(dialerName),
      reason,
    },
  });
}

export async function createTeam(actor: Actor, nameInput: string) {
  assertAdmin(actor);
  const name = trimText(nameInput);
  const normalizedName = normalizeTeamName(name);

  if (name.length < 2) throw new Error("Team name is required.");

  const id = newId();
  async function insertTeam() {
    return getDb().transaction(async (tx) => {
      const duplicate = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(
          eq(teams.organizationId, actorOrganizationId(actor)),
          sql`lower(${teams.name}) = ${normalizedName}`,
          isNull(teams.deletedAt),
        ))
        .limit(1)
        .for("update");
      if (duplicate[0]) throw new Error("A team with this name already exists.");

      await tx.insert(teams).values({
        id,
        organizationId: actorOrganizationId(actor),
        name,
        active: true,
      });
      await tx.insert(auditLogs).values({
        id: newId(),
        actorProfileId: actor.id,
        action: "team.created",
        entityType: "team",
        entityId: id,
        metadata: { after: { id, name, active: true } },
      });
    });
  }

  try {
    try {
      await insertTeam();
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      await insertTeam();
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new Error("A team with this name already exists.");
    }
    throw error;
  }

  return id;
}

export async function listTeams(actor: Actor) {
  assertAdmin(actor);

  const [teamRows, membershipRows, managers, agents] = await Promise.all([
    getDb()
      .select()
      .from(teams)
      .where(visibleTeamWhere(actor))
      .orderBy(asc(teams.name), asc(teams.id)),
    getDb()
      .select({
        id: teamMemberships.id,
        teamId: teamMemberships.teamId,
        profileId: profiles.id,
        profileName: profiles.name,
        profileEmail: profiles.email,
        profileRole: profiles.role,
        membershipRole: teamMemberships.role,
        active: teamMemberships.active,
        startedAt: teamMemberships.startedAt,
        endedAt: teamMemberships.endedAt,
      })
      .from(teamMemberships)
      .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .where(
        and(
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
          activeProfileWhere(actorOrganizationId(actor)),
          visibleTeamWhere(actor),
        ),
      )
      .orderBy(asc(profiles.name)),
    getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "manager"),
      ))
      .orderBy(asc(profiles.name)),
    getDb()
      .select({ id: profiles.id, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(and(
        activeProfileWhere(actorOrganizationId(actor)),
        eq(profiles.role, "agent"),
      ))
      .orderBy(asc(profiles.name)),
  ]);

  return {
    teams: teamRows.map((team) => {
      const activeMembers = membershipRows.filter((row) => row.teamId === team.id);
      const manager = activeMembers.find((row) => row.membershipRole === "manager") ?? null;

      return {
        ...team,
        manager,
        agentCount: activeMembers.filter((row) => row.membershipRole === "agent").length,
        members: activeMembers,
      };
    }),
    managers,
    agents,
  };
}

export async function renameTeam(actor: Actor, input: { teamId: string; name: string }) {
  assertAdmin(actor);
  const name = trimText(input.name);

  if (name.length < 2) throw new Error("Team name is required.");

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, input.teamId), teamBelongsToActorWhere(actor)))
      .limit(1)
      .for("update");
    const team = rows[0];

    if (!team) throw new Error("Team was not found.");

    await tx.update(teams).set({ name }).where(eq(teams.id, input.teamId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "team.renamed",
      entityType: "team",
      entityId: input.teamId,
      metadata: { before: { name: team.name }, after: { name } },
    });
  });
}

export async function setTeamStatus(actor: Actor, input: {
  teamId: string;
  active: boolean;
}) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, input.teamId), teamBelongsToActorWhere(actor)))
      .limit(1)
      .for("update");
    const team = rows[0];

    if (!team) throw new Error("Team was not found.");

    await tx
      .update(teams)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(teams.id, input.teamId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: input.active ? "team.activated" : "team.deactivated",
      entityType: "team",
      entityId: input.teamId,
      metadata: { before: { active: team.active }, after: { active: input.active } },
    });
  });
}

export async function assignTeamManager(actor: Actor, input: {
  teamId: string;
  managerId: string;
}) {
  assertAdmin(actor);
  await validateTeamForAssignment(actor, input.teamId);

  await getDb().transaction(async (tx) => {
    const managerRows = await tx
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.id, input.managerId),
          eq(profiles.organizationId, actorOrganizationId(actor)),
          eq(profiles.role, "manager"),
          eq(profiles.accountStatus, "active"),
        ),
      )
      .limit(1);

    if (!managerRows[0]) throw new Error("Active manager was not found.");

    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: new Date() })
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.role, "manager"),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
        ),
      );
    await tx.insert(teamMemberships).values({
      id: newId(),
      profileId: input.managerId,
      teamId: input.teamId,
      role: "manager",
      active: true,
      createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "team.manager_changed",
      entityType: "team",
      entityId: input.teamId,
      metadata: { managerId: input.managerId },
    });
  });
}

export async function moveAgentToTeam(actor: Actor, input: {
  agentId: string;
  teamId: string;
}) {
  assertAdmin(actor);
  await validateTeamForAssignment(actor, input.teamId);

  await getDb().transaction(async (tx) => {
    const agentRows = await tx
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.id, input.agentId),
          eq(profiles.organizationId, actorOrganizationId(actor)),
          eq(profiles.role, "agent"),
          eq(profiles.accountStatus, "active"),
        ),
      )
      .limit(1);

    if (!agentRows[0]) throw new Error("Active agent was not found.");

    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: new Date() })
      .where(
        and(
          eq(teamMemberships.profileId, input.agentId),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
        ),
      );
    await tx.insert(teamMemberships).values({
      id: newId(),
      profileId: input.agentId,
      teamId: input.teamId,
      role: "agent",
      active: true,
      createdById: actor.id,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action: "team.agent_moved",
      entityType: "profile",
      entityId: input.agentId,
      metadata: { teamId: input.teamId },
    });
  });
}

export async function removeTeamMembership(actor: Actor, membershipId: string) {
  assertAdmin(actor);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: teamMemberships.id,
        teamId: teamMemberships.teamId,
        profileId: teamMemberships.profileId,
        role: teamMemberships.role,
        active: teamMemberships.active,
        startedAt: teamMemberships.startedAt,
        endedAt: teamMemberships.endedAt,
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .where(and(
        eq(teamMemberships.id, membershipId),
        teamBelongsToActorWhere(actor),
      ))
      .limit(1)
      .for("update");
    const membership = rows[0];

    if (!membership || !membership.active) throw new Error("Active membership was not found.");

    await tx
      .update(teamMemberships)
      .set({ active: false, endedAt: new Date() })
      .where(eq(teamMemberships.id, membershipId));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: actor.id,
      action:
        membership.role === "agent"
          ? "team.agent_removed"
          : "team.manager_removed",
      entityType: "team_membership",
      entityId: membershipId,
      metadata: { before: membership },
    });
  });
}

export async function listAuditLogs(actor: Actor) {
  assertAdmin(actor);

  return getDb()
    .select({
      id: auditLogs.id,
      actorProfileId: auditLogs.actorProfileId,
      actorName: profiles.name,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.id, auditLogs.actorProfileId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
}
