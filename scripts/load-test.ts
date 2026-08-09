import "dotenv/config";

import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";

type Sample = { path: string; durationMs: number; ok: boolean; status: number };

const baseUrl = process.env.LOAD_TEST_BASE_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3000";
const url = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) && process.env.ALLOW_PRODUCTION_LOAD_TEST !== "true") {
  throw new Error("Refusing to load-test a non-local host without ALLOW_PRODUCTION_LOAD_TEST=true.");
}
const concurrency = Math.min(100, Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 10)));
const durationSeconds = Math.min(300, Math.max(1, Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 15)));
const thinkTimeMs = Math.min(10_000, Math.max(0, Number(process.env.LOAD_TEST_THINK_TIME_MS ?? 500)));
const useFixtureSessions = process.env.LOAD_TEST_USE_FIXTURE_SESSION === "true";
if (useFixtureSessions && process.env.ALLOW_PERFORMANCE_FIXTURE !== "true") {
  throw new Error("Fixture authentication requires ALLOW_PERFORMANCE_FIXTURE=true.");
}
const configuredPaths = process.env.LOAD_TEST_PATHS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const adminPaths = (configuredPaths ?? ["/health/live", "/health/ready", "/dashboard", "/leaderboard", "/flags/performance", "/admin/users", "/admin/audit", "/admin/imports"]);
const managerPaths = ["/health/live", "/dashboard", "/leaderboard", "/flags/performance", "/teams/performance", "/agents"];
const agentPaths = ["/health/live", "/dashboard", "/leaderboard", "/flags/performance", "/performance"];
const samples: Sample[] = [];
const deadline = Date.now() + durationSeconds * 1_000;

function fixedId(label: string) {
  const hex = createHash("sha256").update(`openers-performance-fixture:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function fixtureCookie(index: number) {
  const profileIndex = index % 50;
  const token = profileIndex === 0
    ? createHash("sha256").update("openers-performance-fixture:load-session").digest("base64url")
    : `performance-fixture-session:${fixedId(`profile:${profileIndex}`)}`;
  return `op_session=${token}`;
}

function workloadFor(index: number) {
  if (configuredPaths) return configuredPaths;
  if (!useFixtureSessions) return adminPaths;
  const profileIndex = index % 50;
  if (profileIndex === 0) return adminPaths;
  if (profileIndex <= 20) return managerPaths;
  return agentPaths;
}

async function user(index: number) {
  const userPaths = workloadFor(index);
  const cookie = process.env.LOAD_TEST_COOKIE ?? (useFixtureSessions ? fixtureCookie(index) : undefined);
  let request = index;
  while (Date.now() < deadline) {
    const path = userPaths[request % userPaths.length];
    request += 1;
    const started = performance.now();
    try {
      const response = await fetch(new URL(path, url), {
        headers: cookie ? { cookie } : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
      samples.push({
        path,
        durationMs: performance.now() - started,
        ok: response.ok,
        status: response.status,
      });
    } catch {
      samples.push({ path, durationMs: performance.now() - started, ok: false, status: 0 });
    }
    if (thinkTimeMs > 0) await new Promise((resolve) => setTimeout(resolve, thinkTimeMs));
  }
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(1));
}

function summary(rows: Sample[], observedDurationSeconds: number) {
  const durations = rows.map((row) => row.durationMs);
  const failedRequests = rows.filter((row) => !row.ok).length;
  return {
    requests: rows.length,
    successfulRequests: rows.length - failedRequests,
    failedRequests,
    errorRate: rows.length ? Number((failedRequests / rows.length).toFixed(4)) : 0,
    throughputRps: Number((rows.length / Math.max(observedDurationSeconds, 0.001)).toFixed(2)),
    statuses: Object.fromEntries(
      Array.from(new Set(rows.map((row) => row.status)))
        .sort((left, right) => left - right)
        .map((status) => [status, rows.filter((row) => row.status === status).length]),
    ),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
  };
}

async function measureDatabasePool() {
  if (process.env.LOAD_TEST_MEASURE_DB !== "true" || !process.env.DATABASE_URL) {
    return null;
  }
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("DB connection sampling is allowed only for a local load rehearsal.");
  }
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  let peakConnected = 0;
  let peakRunning = 0;
  try {
    while (Date.now() < deadline) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running')",
      );
      const values = new Map(
        rows.map((row) => [String(row.Variable_name), Number(row.Value)]),
      );
      peakConnected = Math.max(peakConnected, values.get("Threads_connected") ?? 0);
      peakRunning = Math.max(peakRunning, values.get("Threads_running") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await connection.end();
  }
  return { peakConnected, peakRunning };
}

async function main() {
  const startedAt = performance.now();
  const [, databasePool] = await Promise.all([
    Promise.all(Array.from({ length: concurrency }, (_, index) => user(index))),
    measureDatabasePool(),
  ]);
  const observedDurationSeconds = (performance.now() - startedAt) / 1_000;
  const observedPaths = Array.from(new Set(samples.map((sample) => sample.path))).sort();
  console.info(JSON.stringify({
    baseUrl: url.origin,
    concurrency,
    durationSeconds,
    observedDurationSeconds: Number(observedDurationSeconds.toFixed(2)),
    thinkTimeMs,
    databasePool,
    overall: summary(samples, observedDurationSeconds),
    paths: Object.fromEntries(observedPaths.map((path) => [path, summary(samples.filter((sample) => sample.path === path), observedDurationSeconds)])),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
