import "dotenv/config";

import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";

import type { Actor } from "../src/auth/authorization";
import { closeDatabasePool, getDb } from "../src/db";
import {
  dialerImportBatches,
  importJobs,
  organizations,
  profiles,
  sourceUserMappings,
} from "../src/db/schema";
import { validateEnv } from "../src/env";
import { processNextImportJob } from "../src/import/jobs";
import { deleteDialerImportBatch } from "../src/import/delete-service";
import { enqueueDialerPreviewBatch, rejectDialerImportBatch } from "../src/import/service";

function fixedId(label: string) {
  const hex = createHash("sha256").update(`openers-performance-import:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function main() {
  const env = validateEnv();
  const databaseUrl = new URL(env.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "").toLowerCase();
  if (process.env.ALLOW_PERFORMANCE_FIXTURE !== "true") {
    throw new Error("ALLOW_PERFORMANCE_FIXTURE=true is required.");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) || !/(test|perf)/.test(databaseName)) {
    throw new Error("Import performance checks require a local database whose name contains test or perf.");
  }

  const db = getDb();
  const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, "Performance Fixture Company")).limit(1);
  if (!organization) throw new Error("Run npm run perf:fixture before the import performance check.");
  const [admin] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.organizationId, organization.id), eq(profiles.role, "admin"))).limit(1);
  const agents = await db
    .select({ id: profiles.id, name: profiles.name })
    .from(profiles)
    .where(
      and(
        eq(profiles.organizationId, organization.id),
        eq(profiles.role, "agent"),
      ),
    )
    .limit(600);
  if (!admin || agents.length === 0) {
    throw new Error("The performance fixture is missing its administrator or agents.");
  }

  await db
    .insert(sourceUserMappings)
    .values(
      agents.map((agent) => {
        const normalizedName = agent.name.trim().toLowerCase();
        return {
          id: fixedId(`mapping:${agent.id}`),
          source: "dialer" as const,
          sourceAgentName: agent.name,
          normalizedAgentName: normalizedName,
          activeMappingKey: `dialer:${normalizedName}`,
          primaryMappingKey: `dialer:${agent.id}`,
          profileId: agent.id,
          active: true,
          isPrimary: true,
          approvedById: admin.id,
          approvedAt: new Date(),
        };
      }),
    )
    .onDuplicateKeyUpdate({ set: { active: true } });

  const actor: Actor = { id: admin.id, role: "admin", teamIds: [], organizationId: organization.id };
  const cleanupBatch = async (batchId: string) => {
    try {
      await rejectDialerImportBatch({ actor, batchId, reason: "Performance rehearsal cleanup." });
    } catch {
      // Failed/rejected batches are already eligible for the scoped deletion service.
    }
    await deleteDialerImportBatch({
      actor,
      batchId,
      confirmation: "DELETE IMPORT",
      reason: "Performance rehearsal cleanup.",
    });
  };
  const staleBatches = await db.select({ id: dialerImportBatches.id }).from(dialerImportBatches).where(and(
    eq(dialerImportBatches.organizationId, organization.id),
    eq(dialerImportBatches.fileName, "performance-import.csv"),
    ne(dialerImportBatches.status, "active"),
  ));
  for (const stale of staleBatches) await cleanupBatch(stale.id);

  const reportingDate = "2099-01-01";
  const csv = [
    "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls",
    ...agents.map(
      (agent, index) =>
        `${agent.name},${reportingDate},${index % 24},3600,600,1200,120,180,300,1200,0,24`,
    ),
    "",
  ].join("\n");
  let batchId: string | undefined;

  try {
    const queueStarted = performance.now();
    const queued = await enqueueDialerPreviewBatch({
      actor,
      source: "dialer",
      fileName: "performance-import.csv",
      fileContent: csv,
      selectedReportingDate: reportingDate,
    });
    const queueMs = performance.now() - queueStarted;
    batchId = queued.batchId;
    const workerStarted = performance.now();
    const externalWorker = process.argv.includes("--worker-external");
    let result: Awaited<ReturnType<typeof processNextImportJob>> = null;
    if (externalWorker) {
      const deadline = Date.now() + 30_000;
      do {
        const [job] = await db
          .select({ id: importJobs.id, status: importJobs.status })
          .from(importJobs)
          .where(eq(importJobs.batchId, batchId))
          .limit(1);
        if (job?.status === "completed") {
          result = { jobId: job.id, status: "completed" };
          break;
        }
        if (job?.status === "failed" || job?.status === "cancelled") {
          throw new Error(`The external import worker finished with ${job.status}.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (Date.now() < deadline);
    } else {
      result = await processNextImportJob(`performance-${process.pid}`);
    }
    const processingMs = performance.now() - workerStarted;
    if (!result || result.status !== "completed") throw new Error("The background import performance job did not complete.");
    // Existing MySQL DATETIME columns have one-second precision, so they cannot
    // produce an honest sub-second worker duration. Inline execution uses this
    // process's precise timer; external-worker duration is emitted by that
    // worker's structured import.succeeded log.
    const backgroundProcessingMs = externalWorker ? null : processingMs;

    console.info(JSON.stringify({
      action: "performance_import.complete",
      queueSubmissionMs: Number(queueMs.toFixed(2)),
      queueWaitAndProcessingMs: Number(processingMs.toFixed(2)),
      backgroundProcessingMs:
        backgroundProcessingMs === null
          ? null
          : Number(backgroundProcessingMs.toFixed(2)),
      workerMode: externalWorker ? "external" : "inline",
      backgroundThroughputRowsPerSecond:
        backgroundProcessingMs === null
          ? null
          : Number(((agents.length * 1_000) / backgroundProcessingMs).toFixed(2)),
      observedEndToEndThroughputRowsPerSecond: Number(
        ((agents.length * 1_000) / processingMs).toFixed(2),
      ),
      rows: agents.length,
      status: result.status,
    }));
  } finally {
    if (batchId) await cleanupBatch(batchId);
    await closeDatabasePool();
  }
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabasePool();
  process.exitCode = 1;
});
