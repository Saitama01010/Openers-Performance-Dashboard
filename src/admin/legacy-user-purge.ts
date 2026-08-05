import "server-only";

import { and, count, eq, inArray, or, sql } from "drizzle-orm";

import {
  permanentlyDeleteValidatedUsers,
  type PermanentDeletionApproval,
} from "@/admin/data";
import { sortedIdDigest } from "@/admin/remediation-confirmation";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  coachingSessionParticipants,
  coachingSessions,
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  dialerImportRows,
  emailDeliveryAttempts,
  passwordResetTokens,
  profiles,
  sessions,
  sourceUserMappings,
  teamMemberships,
  transfersFixtures,
  userImportBatches,
  userPermissionOverrides,
} from "@/db/schema";

export type LegacyDeletedProfileSummary = {
  organizationId: string;
  profiles: Array<{ id: string; displayIdentifier: string; role: string }>;
  profileIds: string[];
  expectedCount: number;
  digest: string;
  confirmation: string;
  dependencies: {
    memberships: number;
    sessions: number;
    invitations: number;
    resetRecords: number;
    mappings: number;
    importedRows: number;
    performanceMetrics: number;
    calls: number;
    leaderboardRecords: number;
    auditReferences: number;
    permissionOverrides: number;
    emailDeliveryRecords: number;
    userImportBatches: number;
    dialerImportActorReferences: number;
    coachingSessions: number;
    coachingParticipations: number;
  };
};

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

export async function inspectLegacyDeletedProfiles(input: {
  organizationId: string;
}): Promise<LegacyDeletedProfileSummary> {
  const db = getDb();
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      role: profiles.role,
      email: profiles.email,
    })
    .from(profiles)
    .where(and(
      eq(profiles.organizationId, input.organizationId),
      eq(profiles.accountStatus, "deleted"),
    ))
    .orderBy(profiles.id);
  const profileIds = rows.map((row) => row.id).sort();
  const emails = rows.flatMap((row) => row.email ? [row.email] : []);
  const digest = sortedIdDigest(profileIds);
  const confirmation =
    `PURGE_LEGACY_DELETED:${input.organizationId}:${profileIds.length}:${digest}`;

  if (profileIds.length === 0) {
    return {
      organizationId: input.organizationId,
      profiles: [],
      profileIds,
      expectedCount: 0,
      digest,
      confirmation,
      dependencies: {
        memberships: 0,
        sessions: 0,
        invitations: 0,
        resetRecords: 0,
        mappings: 0,
        importedRows: 0,
        performanceMetrics: 0,
        calls: 0,
        leaderboardRecords: 0,
        auditReferences: 0,
        permissionOverrides: 0,
        emailDeliveryRecords: 0,
        userImportBatches: 0,
        dialerImportActorReferences: 0,
        coachingSessions: 0,
        coachingParticipations: 0,
      },
    };
  }

  const [
    memberships,
    sessionRows,
    invitations,
    resets,
    mappings,
    importedRows,
    metrics,
    leaderboard,
    audits,
    overrides,
    emailRows,
    userImports,
    dialerImports,
    coachingRows,
    coachingParticipants,
  ] = await Promise.all([
    db.select({ total: count() }).from(teamMemberships)
      .where(inArray(teamMemberships.profileId, profileIds)),
    db.select({ total: count() }).from(sessions)
      .where(inArray(sessions.profileId, profileIds)),
    db.select({ total: count() }).from(accountInvitationTokens)
      .where(or(
        inArray(accountInvitationTokens.profileId, profileIds),
        inArray(accountInvitationTokens.createdById, profileIds),
      )),
    db.select({ total: count() }).from(passwordResetTokens)
      .where(or(
        inArray(passwordResetTokens.profileId, profileIds),
        inArray(passwordResetTokens.createdById, profileIds),
      )),
    db.select({ total: count() }).from(sourceUserMappings)
      .where(or(
        inArray(sourceUserMappings.profileId, profileIds),
        inArray(sourceUserMappings.approvedById, profileIds),
        inArray(sourceUserMappings.deactivatedById, profileIds),
      )),
    db.select({ total: count() }).from(dialerImportRows)
      .where(inArray(dialerImportRows.matchedAgentProfileId, profileIds)),
    db.select({
      total: count(),
      calls: sql<number>`coalesce(sum(${dialerAgentHourlyMetrics.calls}), 0)`,
    }).from(dialerAgentHourlyMetrics)
      .where(inArray(dialerAgentHourlyMetrics.agentProfileId, profileIds)),
    db.select({ total: count() }).from(transfersFixtures)
      .where(inArray(transfersFixtures.agentProfileId, profileIds)),
    db.select({ total: count() }).from(auditLogs)
      .where(or(
        inArray(auditLogs.actorProfileId, profileIds),
        inArray(auditLogs.entityId, profileIds),
      )),
    db.select({ total: count() }).from(userPermissionOverrides)
      .where(inArray(userPermissionOverrides.profileId, profileIds)),
    db.select({ total: count() }).from(emailDeliveryAttempts)
      .where(or(
        inArray(emailDeliveryAttempts.profileId, profileIds),
        emails.length > 0
          ? inArray(emailDeliveryAttempts.recipientEmail, emails)
          : undefined,
      )),
    db.select({ total: count() }).from(userImportBatches)
      .where(inArray(userImportBatches.uploadedById, profileIds)),
    db.select({ total: count() }).from(dialerImportBatches)
      .where(or(
        inArray(dialerImportBatches.uploadedById, profileIds),
        inArray(dialerImportBatches.confirmedById, profileIds),
        inArray(dialerImportBatches.publishedById, profileIds),
        inArray(dialerImportBatches.legacyWarningReviewerId, profileIds),
        inArray(dialerImportBatches.rejectedById, profileIds),
        inArray(dialerImportBatches.rolledBackById, profileIds),
      )),
    db.select({ total: count() }).from(coachingSessions)
      .where(or(
        inArray(coachingSessions.createdByProfileId, profileIds),
        inArray(coachingSessions.coachProfileId, profileIds),
      )),
    db.select({ total: count() }).from(coachingSessionParticipants)
      .where(inArray(coachingSessionParticipants.agentProfileId, profileIds)),
  ]);

  return {
    organizationId: input.organizationId,
    profiles: rows.map((row) => ({
      id: row.id,
      displayIdentifier: row.name,
      role: row.role,
    })),
    profileIds,
    expectedCount: profileIds.length,
    digest,
    confirmation,
    dependencies: {
      memberships: numberValue(memberships[0]?.total),
      sessions: numberValue(sessionRows[0]?.total),
      invitations: numberValue(invitations[0]?.total),
      resetRecords: numberValue(resets[0]?.total),
      mappings: numberValue(mappings[0]?.total),
      importedRows: numberValue(importedRows[0]?.total),
      performanceMetrics: numberValue(metrics[0]?.total),
      calls: numberValue(metrics[0]?.calls),
      leaderboardRecords: numberValue(leaderboard[0]?.total),
      auditReferences: numberValue(audits[0]?.total),
      permissionOverrides: numberValue(overrides[0]?.total),
      emailDeliveryRecords: numberValue(emailRows[0]?.total),
      userImportBatches: numberValue(userImports[0]?.total),
      dialerImportActorReferences: numberValue(dialerImports[0]?.total),
      coachingSessions: numberValue(coachingRows[0]?.total),
      coachingParticipations: numberValue(coachingParticipants[0]?.total),
    },
  };
}

export async function purgeLegacyDeletedProfiles(input: {
  actorId: string;
  organizationId: string;
  profileIds: string[];
  approval: PermanentDeletionApproval;
}) {
  const actor: Actor = {
    id: input.actorId,
    role: "admin",
    teamIds: [],
    organizationId: input.organizationId,
  };
  return permanentlyDeleteValidatedUsers(actor, {
    userIds: input.profileIds,
    approval: input.approval,
  });
}
