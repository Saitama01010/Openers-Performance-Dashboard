import "server-only";

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerImportBatches,
  importJobs,
  profiles,
  teamMemberships,
  teams,
} from "@/db/schema";
import { getEnv } from "@/env";
import {
  ImportConfirmationError,
  processDialerBatch,
} from "@/import/service";
import { newId } from "@/lib/ids";
import { logOperationalEvent, logServerError } from "@/lib/logging";

export type ClaimedImportJob = typeof importJobs.$inferSelect;

const TRANSIENT_IMPORT_CODES = new Set([
  "deadlock",
  "lock_wait_timeout",
  "connection_failure",
  "worker_interrupted",
]);

function safeFailure(error: unknown) {
  if (error instanceof ImportConfirmationError) {
    return {
      code: error.code.slice(0, 80),
      reason: ["invalid_file", "invalid_reporting_date", "invalid_status", "forbidden"].includes(error.code)
        ? "The import could not be processed because its input or state is invalid."
        : "The import could not be processed.",
      retryable: TRANSIENT_IMPORT_CODES.has(error.code),
    };
  }
  const message = error instanceof Error ? error.message : "";
  const retryable = /deadlock|lock wait|connection|timeout|ECONN|PROTOCOL/i.test(message);
  return {
    code: retryable ? "transient_database_failure" : "processing_failure",
    reason: retryable
      ? "Import processing was interrupted and will be retried."
      : "The import could not be processed. Review the file and try again.",
    retryable,
  };
}

export async function claimNextImportJob(
  workerId: string,
  now = new Date(),
): Promise<ClaimedImportJob | null> {
  const leaseExpiresAt = new Date(
    now.getTime() + getEnv().IMPORT_WORKER_LEASE_SECONDS * 1_000,
  );

  return getDb().transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(importJobs)
      .where(
        or(
          and(
            eq(importJobs.status, "queued"),
            lte(importJobs.availableAt, now),
          ),
          and(
            eq(importJobs.status, "processing"),
            lte(importJobs.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(importJobs.availableAt), asc(importJobs.queuedAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!job) return null;
    const attemptCount = job.attemptCount + 1;
    await tx
      .update(importJobs)
      .set({
        status: "processing",
        attemptCount,
        processingStartedAt: now,
        heartbeatAt: now,
        leaseOwner: workerId,
        leaseExpiresAt,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(importJobs.id, job.id));

    return {
      ...job,
      status: "processing",
      attemptCount,
      processingStartedAt: now,
      heartbeatAt: now,
      leaseOwner: workerId,
      leaseExpiresAt,
      failureCode: null,
      failureReason: null,
    };
  });
}

async function actorForJob(job: ClaimedImportJob): Promise<Actor | null> {
  if (!job.actorProfileId) return null;
  const [profile] = await getDb()
    .select({
      id: profiles.id,
      role: profiles.role,
      organizationId: profiles.organizationId,
      active: profiles.active,
      accountStatus: profiles.accountStatus,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.id, job.actorProfileId),
        eq(profiles.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  if (!profile || !profile.active || profile.accountStatus !== "active") return null;

  const memberships = await getDb()
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(teamMemberships.profileId, profile.id),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
        eq(teams.organizationId, profile.organizationId),
        eq(teams.active, true),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
      ),
    );
  return {
    id: profile.id,
    role: profile.role,
    teamIds: memberships.map((membership) => membership.teamId),
    organizationId: profile.organizationId,
  };
}

export async function heartbeatImportJob(
  jobId: string,
  workerId: string,
  now = new Date(),
) {
  const leaseExpiresAt = new Date(
    now.getTime() + getEnv().IMPORT_WORKER_LEASE_SECONDS * 1_000,
  );
  await getDb()
    .update(importJobs)
    .set({ heartbeatAt: now, leaseExpiresAt })
    .where(
      and(
        eq(importJobs.id, jobId),
        eq(importJobs.status, "processing"),
        eq(importJobs.leaseOwner, workerId),
      ),
    );
}

export async function processNextImportJob(
  workerId: string,
  options: {
    now?: Date;
    processor?: typeof processDialerBatch;
  } = {},
) {
  const now = options.now ?? new Date();
  const job = await claimNextImportJob(workerId, now);
  if (!job) return null;
  const actor = await actorForJob(job);
  const startedAt = Date.now();
  const heartbeatTimer = setInterval(
    () => void heartbeatImportJob(job.id, workerId).catch((error) => {
      logServerError({
        action: "import.heartbeat_failed",
        actorId: actor?.id,
        entityId: job.id,
        category: "database_failure",
        error,
      });
    }),
    Math.max(1_000, Math.floor(getEnv().IMPORT_WORKER_LEASE_SECONDS * 1_000 / 3)),
  );
  heartbeatTimer.unref();

  try {
    if (!actor) {
      throw new ImportConfirmationError(
        "The import actor is no longer eligible.",
        "forbidden",
      );
    }
    await (options.processor ?? processDialerBatch)({
      actor,
      batchId: job.batchId,
    });
    const completedAt = new Date();
    await getDb().transaction(async (tx) => {
      await tx
        .update(importJobs)
        .set({
          status: "completed",
          completedAt,
          heartbeatAt: completedAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(
          and(eq(importJobs.id, job.id), eq(importJobs.leaseOwner, workerId)),
        );
      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: job.organizationId,
        actorProfileId: actor.id,
        action: "dialer_import.job_completed",
        entityType: "import_job",
        entityId: job.id,
        metadata: { batchId: job.batchId, attemptCount: job.attemptCount },
      });
    });
    logOperationalEvent({
      action: "import.succeeded",
      organizationId: job.organizationId,
      actorId: actor.id,
      entityId: job.id,
      durationMs: Date.now() - startedAt,
      details: { batchId: job.batchId, attemptCount: job.attemptCount },
    });
    return { jobId: job.id, status: "completed" as const };
  } catch (error) {
    const failure = safeFailure(error);
    const exhausted = job.attemptCount >= job.maxAttempts;
    const retry = failure.retryable && !exhausted;
    const nextAttemptAt = new Date(
      now.getTime() + Math.min(60_000, 1_000 * 2 ** Math.max(0, job.attemptCount - 1)),
    );
    await getDb().transaction(async (tx) => {
      await tx
        .update(importJobs)
        .set({
          status: retry ? "queued" : "failed",
          availableAt: retry ? nextAttemptAt : job.availableAt,
          failedAt: retry ? null : new Date(),
          failureCode: failure.code,
          failureReason: failure.reason,
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(
          and(eq(importJobs.id, job.id), eq(importJobs.leaseOwner, workerId)),
        );
      if (retry) {
        await tx
          .update(dialerImportBatches)
          .set({ status: "uploaded" })
          .where(eq(dialerImportBatches.id, job.batchId));
      }
      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: job.organizationId,
        actorProfileId: actor?.id ?? null,
        action: retry ? "dialer_import.job_retried" : "dialer_import.job_failed",
        entityType: "import_job",
        entityId: job.id,
        metadata: {
          batchId: job.batchId,
          attemptCount: job.attemptCount,
          failureCode: failure.code,
        },
      });
    });
    logServerError({
      action: retry ? "import.retry" : "import.failed",
      actorId: actor?.id,
      entityId: job.id,
      category: failure.code,
      error,
    });
    return {
      jobId: job.id,
      status: retry ? ("queued" as const) : ("failed" as const),
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function importQueueDepth() {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(importJobs)
    .where(or(eq(importJobs.status, "queued"), eq(importJobs.status, "processing")));
  return Number(row?.count ?? 0);
}
