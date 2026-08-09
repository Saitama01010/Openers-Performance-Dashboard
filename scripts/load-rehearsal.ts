import "dotenv/config";

import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3011");
if (!["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)) {
  throw new Error("The local load rehearsal may only start a server on a loopback host.");
}

const port = baseUrl.port || "3011";
const projectRoot = process.cwd();
const warmPaths = (process.env.LOAD_TEST_PATHS ?? "/health/live,/health/ready,/dashboard,/leaderboard,/flags/performance,/admin/users,/admin/audit,/admin/imports")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function runLoadTest(concurrency: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/load-test.ts"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        LOAD_TEST_BASE_URL: baseUrl.origin,
        LOAD_TEST_CONCURRENCY: String(concurrency),
        LOAD_TEST_MEASURE_DB: "true",
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Load test exited with code ${code}.`)));
  });
}

function runImportDuringLoad() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/performance-import.ts", "--worker-external"],
      { cwd: projectRoot, env: process.env, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Concurrent import rehearsal exited with code ${code}.`)));
  });
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health/live", baseUrl), { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The production server did not become live within 30 seconds.");
}

async function main() {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let exited = false;
  server.once("exit", () => { exited = true; });
  let worker: ReturnType<typeof spawn> | undefined;
  let workerExited = false;
  const stop = () => {
    if (!exited) server.kill("SIGTERM");
    if (worker && !workerExited) worker.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await waitUntilReady();
    worker = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/import-worker.ts"], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    worker.once("exit", () => { workerExited = true; });
    const cookie = process.env.LOAD_TEST_COOKIE ?? (process.env.LOAD_TEST_USE_FIXTURE_SESSION === "true"
      ? `op_session=${(await import("node:crypto")).createHash("sha256").update("openers-performance-fixture:load-session").digest("base64url")}`
      : undefined);
    for (const path of warmPaths) {
      await fetch(new URL(path, baseUrl), { headers: cookie ? { cookie } : undefined, signal: AbortSignal.timeout(15_000) });
    }
    for (const concurrency of [10, 25, 50]) {
      const exerciseImportWorker =
        concurrency === 25 &&
        process.env.ALLOW_PERFORMANCE_FIXTURE === "true" &&
        process.env.LOAD_TEST_IMPORT_DURING_REHEARSAL !== "false";
      await Promise.all([
        runLoadTest(concurrency),
        ...(exerciseImportWorker ? [runImportDuringLoad()] : []),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } finally {
    stop();
    await Promise.race([
      new Promise<void>((resolve) => server.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (!exited) server.kill("SIGKILL");
    if (worker && !workerExited) {
      await Promise.race([
        new Promise<void>((resolve) => worker!.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (!workerExited) worker.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
