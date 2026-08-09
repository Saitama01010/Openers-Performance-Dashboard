import "dotenv/config";

import { createHash } from "node:crypto";

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
      samples.push({ path, durationMs: performance.now() - started, ok: response.status < 500, status: response.status });
      await response.arrayBuffer();
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

function summary(rows: Sample[]) {
  const durations = rows.map((row) => row.durationMs);
  return {
    requests: rows.length,
    errors: rows.filter((row) => !row.ok).length,
    errorRate: rows.length ? Number((rows.filter((row) => !row.ok).length / rows.length).toFixed(4)) : 0,
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

async function main() {
  await Promise.all(Array.from({ length: concurrency }, (_, index) => user(index)));
  const observedPaths = Array.from(new Set(samples.map((sample) => sample.path))).sort();
  console.info(JSON.stringify({
    baseUrl: url.origin,
    concurrency,
    durationSeconds,
    thinkTimeMs,
    overall: summary(samples),
    paths: Object.fromEntries(observedPaths.map((path) => [path, summary(samples.filter((sample) => sample.path === path))])),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
