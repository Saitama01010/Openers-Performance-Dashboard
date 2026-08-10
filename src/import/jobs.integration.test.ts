import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { count, eq, inArray } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerImportRows,
  dialerImportBatches,
  importJobs,
  organizations,
  profiles,
} from "@/db/schema";
import {
  claimNextImportJob,
  processNextImportJob,
} from "@/import/jobs";
import {
  enqueueDialerPreviewBatch,
  ImportConfirmationError,
  processDialerBatch,
} from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const organizationIds: string[] = [];
const profileIds: string[] = [];
const batchIds: string[] = [];

async function setup() {
  const organizationId = newId();
  const profileId = newId();
  organizationIds.push(organizationId);
  profileIds.push(profileId);
  await getDb().insert(organizations).values({ id: organizationId, name: `Job ${organizationId}` });
  await getDb().insert(profiles).values({
    id: profileId,
    organizationId,
    email: `${profileId}@example.test`,
    name: "Import Worker Admin",
    role: "admin",
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  const actor: Actor = { id: profileId, role: "admin", teamIds: [], organizationId };
  const queued = await enqueueDialerPreviewBatch({
    actor,
    source: "dialer",
    fileName: "job.csv",
    fileContent: "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls\nWorker Agent,2099-01-01,1,3600,60,120,10,20,30,40,0,5\n",
    selectedReportingDate: "2099-01-01",
  });
  batchIds.push(queued.batchId);
  return { actor, batchId: queued.batchId, organizationId };
}

afterEach(async () => {
  if (batchIds.length) await getDb().delete(dialerImportBatches).where(inArray(dialerImportBatches.id, batchIds.splice(0)));
  if (profileIds.length) await getDb().delete(profiles).where(inArray(profiles.id, profileIds.splice(0)));
  if (organizationIds.length) {
    const ids = organizationIds.splice(0);
    await getDb().delete(auditLogs).where(inArray(auditLogs.organizationId, ids));
    await getDb().delete(organizations).where(inArray(organizations.id, ids));
  }
});

describe("durable import jobs", () => {
  it("creates an organization-scoped queued job", async () => {
    const { batchId, organizationId } = await setup();
    const [job] = await getDb().select().from(importJobs).where(eq(importJobs.batchId, batchId));
    expect(job).toMatchObject({ batchId, organizationId, status: "queued", attemptCount: 0 });
  });

  it("atomically allows only one worker to claim a job", async () => {
    await setup();
    const [first, second] = await Promise.all([
      claimNextImportJob("worker-a"),
      claimNextImportJob("worker-b"),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("recovers a stale lease and increments the attempt", async () => {
    await setup();
    const first = await claimNextImportJob("crashed", new Date("2099-01-01T00:00:00Z"));
    expect(first?.attemptCount).toBe(1);
    const recovered = await claimNextImportJob("replacement", new Date("2099-01-01T00:10:00Z"));
    expect(recovered).toMatchObject({ id: first?.id, attemptCount: 2, leaseOwner: "replacement" });
  });

  it("retries transient failures but permanently fails invalid input with a safe reason", async () => {
    await setup();
    const retry = await processNextImportJob("retry-worker", {
      processor: async () => { throw new Error("database connection timeout with internal host details"); },
    });
    expect(retry?.status).toBe("queued");
    const [retryJob] = await getDb().select().from(importJobs).where(eq(importJobs.id, retry!.jobId));
    expect(retryJob.failureReason).not.toContain("internal host");

    const second = await setup();
    const failed = await processNextImportJob("failure-worker", {
      processor: async () => { throw new ImportConfirmationError("raw parser details", "invalid_file"); },
    });
    expect(failed?.status).toBe("failed");
    const [failedJob] = await getDb().select().from(importJobs).where(eq(importJobs.batchId, second.batchId));
    expect(failedJob).toMatchObject({ status: "failed", failureCode: "invalid_file" });
    expect(failedJob.failureReason).not.toContain("raw parser details");
  });

  it("completes exactly once when the same delivery is polled repeatedly", async () => {
    await setup();
    const processor = vi.fn(async () => ({ batchId: "test" }) as never);
    expect((await processNextImportJob("worker", { processor }))?.status).toBe("completed");
    expect(await processNextImportJob("worker", { processor })).toBeNull();
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it("fences both success and failure updates after a lease takeover", async () => {
    const successful = await setup();
    const success = await processNextImportJob("stale-success", {
      processor: async () => {
        await getDb()
          .update(importJobs)
          .set({ leaseOwner: "replacement", leaseExpiresAt: new Date("2100-01-01T00:00:00Z") })
          .where(eq(importJobs.batchId, successful.batchId));
        return { batchId: successful.batchId } as never;
      },
    });
    expect(success?.status).toBe("lease_lost");
    const [successJob] = await getDb().select().from(importJobs).where(eq(importJobs.batchId, successful.batchId));
    expect(successJob).toMatchObject({ status: "processing", leaseOwner: "replacement" });

    const failed = await setup();
    const failure = await processNextImportJob("stale-failure", {
      processor: async () => {
        await getDb()
          .update(importJobs)
          .set({ leaseOwner: "replacement", leaseExpiresAt: new Date("2100-01-01T00:00:00Z") })
          .where(eq(importJobs.batchId, failed.batchId));
        throw new Error("database connection timeout");
      },
    });
    expect(failure?.status).toBe("lease_lost");
    const [failureJob] = await getDb().select().from(importJobs).where(eq(importJobs.batchId, failed.batchId));
    const [failureBatch] = await getDb().select().from(dialerImportBatches).where(eq(dialerImportBatches.id, failed.batchId));
    expect(failureJob).toMatchObject({ status: "processing", leaseOwner: "replacement", failureCode: null });
    expect(failureBatch.status).toBe("uploaded");
  });

  it("terminally recovers an exhausted stale lease without exceeding max attempts", async () => {
    const { batchId } = await setup();
    await getDb()
      .update(importJobs)
      .set({
        status: "processing",
        attemptCount: 3,
        maxAttempts: 3,
        leaseOwner: "crashed",
        leaseExpiresAt: new Date("2026-01-01T00:00:00Z"),
      })
      .where(eq(importJobs.batchId, batchId));

    expect(await claimNextImportJob("replacement", new Date("2026-01-01T00:01:00Z"))).toBeNull();
    const [job] = await getDb().select().from(importJobs).where(eq(importJobs.batchId, batchId));
    const [batch] = await getDb().select().from(dialerImportBatches).where(eq(dialerImportBatches.id, batchId));
    expect(job).toMatchObject({ status: "failed", attemptCount: 3, failureCode: "retry_exhausted", leaseOwner: null });
    expect(batch.status).toBe("failed");
  });

  it("replays a crash after preview persistence idempotently", async () => {
    const { actor, batchId } = await setup();
    const first = await claimNextImportJob("crashed", new Date("2099-01-01T00:00:00Z"));
    expect(first?.batchId).toBe(batchId);
    await processDialerBatch({
      actor,
      batchId,
      jobLease: { jobId: first!.id, workerId: "crashed" },
    });
    const [before] = await getDb()
      .select({ count: count() })
      .from(dialerImportRows)
      .where(eq(dialerImportRows.batchId, batchId));
    await getDb()
      .update(importJobs)
      .set({ leaseExpiresAt: new Date("2099-01-01T00:00:01Z") })
      .where(eq(importJobs.id, first!.id));

    expect((await processNextImportJob("replacement", { now: new Date("2099-01-01T00:01:00Z") }))?.status).toBe("completed");
    const [after] = await getDb()
      .select({ count: count() })
      .from(dialerImportRows)
      .where(eq(dialerImportRows.batchId, batchId));
    expect(Number(after.count)).toBe(Number(before.count));
  });
});
