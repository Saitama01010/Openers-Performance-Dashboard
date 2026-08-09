import "dotenv/config";

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { closeDatabasePool } from "../src/db";
import { processNextEmail } from "../src/email/outbox";
import { getEnv, validateEnv } from "../src/env";
import { logOperationalEvent } from "../src/lib/logging";

validateEnv();
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const env = getEnv();
  const runOnce = process.argv.includes("--once");
  logOperationalEvent({
    action: "email.worker_started",
    entityId: workerId,
    details: { concurrency: env.EMAIL_WORKER_CONCURRENCY },
  });
  while (!stopping) {
    const results = await Promise.all(
      Array.from({ length: env.EMAIL_WORKER_CONCURRENCY }, () => processNextEmail(workerId)),
    );
    if (results.every((result) => result === null)) {
      if (runOnce) break;
      await sleep(env.EMAIL_WORKER_POLL_MS);
    }
    if (runOnce) break;
  }
}

main()
  .catch((error) => {
    console.error("Email worker stopped unexpectedly.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePool();
    logOperationalEvent({ action: "email.worker_stopped", entityId: workerId });
  });
