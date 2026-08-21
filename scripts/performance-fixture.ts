import "dotenv/config";

import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";

import { closeDatabasePool, getDb } from "../src/db";
import {
  auditLogs,
  dialerAgentHourlyMetrics,
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  organizations,
  profiles,
  sessions,
  teamMemberships,
  teams,
} from "../src/db/schema";
import { getEnv, validateEnv } from "../src/env";

async function main() {
validateEnv();
const env = getEnv();
const databaseUrl = new URL(env.DATABASE_URL);
const databaseName = databaseUrl.pathname.replace(/^\/+/, "").toLowerCase();
if (process.env.ALLOW_PERFORMANCE_FIXTURE !== "true") {
  throw new Error("ALLOW_PERFORMANCE_FIXTURE=true is required.");
}
if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) || !/(test|perf)/.test(databaseName)) {
  throw new Error("Performance fixtures require a local database whose name contains test or perf.");
}
const password = process.env.PERF_FIXTURE_PASSWORD;
if (!password || password.length < 16) throw new Error("PERF_FIXTURE_PASSWORD must be at least 16 characters.");

const smoke = process.argv.includes("--smoke");
const employeeCount = smoke ? 30 : 600;
const teamCount = smoke ? 5 : 20;
const managerCount = teamCount;
const historyDays = smoke ? 30 : 365;
const auditCount = smoke ? 100 : 5_000;
const db = getDb();

function fixedId(label: string) {
  const hex = createHash("sha256").update(`openers-performance-fixture:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function dateKey(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function chunks<T>(rows: T[], size: number, insert: (values: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += size) await insert(rows.slice(index, index + size));
}

const organizationId = fixedId("organization");
const adminId = fixedId("admin");
const batchId = fixedId("batch");
const passwordHash = await bcrypt.hash(password, 10);
await db.insert(organizations).values({ id: organizationId, name: "Performance Fixture Company" }).onDuplicateKeyUpdate({ set: { name: "Performance Fixture Company" } });

const teamRows = Array.from({ length: teamCount }, (_, index) => ({ id: fixedId(`team:${index}`), organizationId, name: `Fixture Team ${String(index + 1).padStart(2, "0")}`, active: true }));
await chunks(teamRows, 100, (values) => db.insert(teams).values(values).onDuplicateKeyUpdate({ set: { active: true } }));

const profileRows = Array.from({ length: employeeCount }, (_, index) => ({
  id: index === 0 ? adminId : fixedId(`profile:${index}`),
  organizationId,
  email: `perf-${String(index).padStart(3, "0")}@example.test`,
  name: index === 0 ? "Performance Admin" : `Performance Agent ${String(index).padStart(3, "0")}`,
  role: index === 0
    ? ("admin" as const)
    : index <= managerCount
      ? ("manager" as const)
      : ("agent" as const),
  passwordHash,
  passwordState: "permanent" as const,
  active: true,
  accountStatus: "active" as const,
  mustResetPassword: false,
}));
await chunks(profileRows, 250, (values) => db.insert(profiles).values(values).onDuplicateKeyUpdate({
  set: {
    // A full run upgrades the additional manager rows created as agents by a
    // prior smoke run, while a later smoke run never demotes full-fixture
    // managers. This keeps both fixture modes restartable.
    role: sql`case when values(${profiles.role}) in ('admin', 'manager') then values(${profiles.role}) else ${profiles.role} end`,
    passwordState: "permanent",
    active: true,
    accountStatus: "active",
    mustResetPassword: false,
  },
}));

const managerRows = profileRows.slice(1, managerCount + 1);
const agentRows = profileRows.slice(managerCount + 1);
const memberships = [
  ...managerRows.map((profile, index) => ({
    id: fixedId(`manager-membership:${index}`),
    teamId: teamRows[index].id,
    profileId: profile.id,
    role: "manager" as const,
    active: true,
    createdById: adminId,
  })),
  ...agentRows.map((profile, index) => ({
  id: fixedId(`membership:${index}`),
  teamId: teamRows[index % teamRows.length].id,
  profileId: profile.id,
  role: "agent" as const,
  active: true,
  createdById: adminId,
  })),
];
await chunks(memberships, 250, (values) => db.insert(teamMemberships).values(values).onDuplicateKeyUpdate({ set: { active: true, endedAt: null } }));

const loadSessionToken = createHash("sha256")
  .update("openers-performance-fixture:load-session")
  .digest("base64url");
const sessionRows = profileRows.slice(0, Math.min(50, profileRows.length)).map((profile, index) => ({
  id: index === 0
    ? createHash("sha256").update(loadSessionToken).digest("hex")
    : createHash("sha256").update(`performance-fixture-session:${profile.id}`).digest("hex"),
  profileId: profile.id,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
  lastSeenAt: new Date(),
}));
await chunks(sessionRows, 100, (values) => db.insert(sessions).values(values).onDuplicateKeyUpdate({ set: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000), revokedAt: null } }));

await db.insert(dialerImportBatches).values({
  id: batchId,
  organizationId,
  source: "performance_fixture",
  importType: "agent_hours_performance",
  granularity: "daily",
  fileName: "performance-fixture.csv",
  fileHash: createHash("sha256").update("performance-fixture").digest("hex"),
  status: "active",
  uploadedById: adminId,
  rawFileContent: null,
  rowCount: agentRows.length * historyDays,
  publishedById: adminId,
  publishedAt: new Date(),
}).onDuplicateKeyUpdate({ set: { status: "active", rowCount: agentRows.length * historyDays } });

const importHistoryRows = Array.from({ length: smoke ? 5 : 40 }, (_, index) => ({
  id: fixedId(`history-batch:${index}`),
  organizationId,
  source: "performance_fixture",
  importType: "agent_hours_performance",
  granularity: "daily" as const,
  fileName: `fixture-history-${String(index + 1).padStart(2, "0")}.csv`,
  fileHash: createHash("sha256").update(`fixture-history-${index}`).digest("hex"),
  status: index % 9 === 0 ? ("failed" as const) : ("superseded" as const),
  uploadedById: adminId,
  rawFileContent: null,
  rowCount: agentRows.length,
  createdAt: new Date(Date.now() - (index + 1) * 7 * 24 * 60 * 60 * 1_000),
}));
await chunks(importHistoryRows, 100, (values) => db.insert(dialerImportBatches).values(values).onDuplicateKeyUpdate({ set: { rowCount: sql`${dialerImportBatches.rowCount}` } }));

for (let day = 0; day < historyDays; day += 1) {
  const metricDate = dateKey(day);
  const scopeRows = teamRows.map((team) => ({
    scopeKey: `performance_fixture:agent_hours_performance:${metricDate}:${team.id}:all`,
    source: "performance_fixture",
    importType: "agent_hours_performance",
    reportingDate: metricDate,
    teamId: team.id,
  }));
  await db.insert(dialerDatasetScopes).values(scopeRows).onDuplicateKeyUpdate({ set: { revision: sql`${dialerDatasetScopes.revision}` } });
  const versionRows = scopeRows.map((scope) => ({
    id: fixedId(`version:${scope.scopeKey}`),
    importBatchId: batchId,
    scopeKey: scope.scopeKey,
    source: scope.source,
    importType: scope.importType,
    granularity: "daily" as const,
    reportingDate: metricDate,
    teamId: scope.teamId,
    versionNumber: 1,
    status: "active" as const,
    rowCount: Math.ceil(agentRows.length / teamRows.length),
    activatedAt: new Date(),
  }));
  await db.insert(dialerDatasetVersions).values(versionRows).onDuplicateKeyUpdate({ set: { status: "active" } });
  for (const version of versionRows) {
    await db.update(dialerDatasetScopes).set({ activeVersionId: version.id }).where(sql`${dialerDatasetScopes.scopeKey} = ${version.scopeKey}`);
  }
  const versionByTeam = new Map(versionRows.map((version) => [version.teamId, version.id]));
  const metrics = agentRows.map((agent, index) => {
    const team = teamRows[index % teamRows.length];
    const calls = 35 + ((index * 7 + day * 3) % 85);
    return {
      id: fixedId(`metric:${metricDate}:${agent.id}`),
      source: "performance_fixture",
      sourceAgentName: agent.name,
      agentProfileId: agent.id,
      batchId,
      versionId: versionByTeam.get(team.id)!,
      granularity: "daily" as const,
      metricDate,
      metricHour: null,
      metricKey: metricDate,
      calls,
      loggedInSeconds: 25_200 + ((index + day) % 3_600),
      readySeconds: 7_200,
      talkSeconds: 10_800,
      ringingSeconds: 900,
      wrapSeconds: 1_800,
      pausedSeconds: 1_200,
      systemPauseSeconds: 300,
      netSeconds: 24_000,
      idleSeconds: 2_400,
      untrackedSeconds: 0,
      teamIdSnapshot: team.id,
      teamNameSnapshot: team.name,
      rowHash: createHash("sha256").update(`${metricDate}:${agent.id}:${calls}`).digest("hex"),
    };
  });
  await chunks(metrics, 400, (values) => db.insert(dialerAgentHourlyMetrics).values(values).onDuplicateKeyUpdate({ set: { calls: sql`${dialerAgentHourlyMetrics.calls}` } }));
  if (day % 30 === 0) console.info(JSON.stringify({ action: "performance_fixture.progress", day, historyDays }));
}

const auditRows = Array.from({ length: auditCount }, (_, index) => ({
  id: fixedId(`audit:${index}`),
  organizationId,
  actorProfileId: adminId,
  actorDisplayName: "Performance Admin",
  action: index % 5 === 0 ? "user.updated" : "dashboard.viewed",
  entityType: "profile",
  entityId: agentRows[index % agentRows.length]?.id ?? adminId,
  metadata: { fixture: true, sequence: index },
}));
await chunks(auditRows, 400, (values) => db.insert(auditLogs).values(values).onDuplicateKeyUpdate({ set: { action: sql`${auditLogs.action}` } }));

console.info(JSON.stringify({ action: "performance_fixture.complete", employeeCount, managerCount, teamCount, historyDays, metricRows: agentRows.length * historyDays, auditCount, concurrentSessions: sessionRows.length }));
await closeDatabasePool();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabasePool();
  process.exitCode = 1;
});
