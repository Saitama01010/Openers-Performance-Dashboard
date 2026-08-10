import "dotenv/config";

import { closeDatabasePool, getPool } from "../src/db";
import { validateEnv } from "../src/env";

async function main() {
validateEnv();
const connection = await getPool().getConnection();
const repetitions = Math.min(20, Math.max(1, Number(process.env.PERF_REPETITIONS ?? 5)));
const operations: Record<string, string> = {
  session_lookup: "SELECT s.id FROM sessions s JOIN profiles p ON p.id=s.profile_id WHERE s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 1",
  dashboard_initial: "SELECT SUM(m.calls), SUM(m.logged_in_seconds) FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE m.metric_date >= CURRENT_DATE - INTERVAL 30 DAY",
  team_dashboard: "SELECT m.team_id_snapshot, SUM(m.calls) FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE m.metric_date >= CURRENT_DATE - INTERVAL 30 DAY GROUP BY m.team_id_snapshot LIMIT 25",
  agent_dashboard: "SELECT m.agent_profile_id, SUM(m.calls) FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE m.metric_date >= CURRENT_DATE - INTERVAL 30 DAY GROUP BY m.agent_profile_id LIMIT 25",
  date_filter: "SELECT metric_date, SUM(calls) FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE metric_date >= CURRENT_DATE - INTERVAL 90 DAY GROUP BY metric_date",
  leaderboard: "SELECT agent_profile_id, SUM(calls) calls FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE m.metric_date >= CURRENT_DATE - INTERVAL 30 DAY GROUP BY agent_profile_id ORDER BY calls DESC LIMIT 50",
  flags: "SELECT agent_profile_id, SUM(wrap_seconds), SUM(paused_seconds) FROM dialer_agent_hourly_metrics m JOIN dialer_dataset_scopes s ON s.active_version_id=m.version_id WHERE m.metric_date >= CURRENT_DATE - INTERVAL 30 DAY GROUP BY agent_profile_id LIMIT 50",
  import_history: "SELECT id, file_name, import_status, created_at FROM dialer_import_batches ORDER BY created_at DESC LIMIT 25",
  admin_users: "SELECT id, name, role, account_status FROM profiles ORDER BY created_at DESC LIMIT 50",
  audit_history: "SELECT id, action, entity_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 25",
  import_queue: "SELECT COUNT(*) FROM import_jobs WHERE background_job_status IN ('queued','processing')",
  email_queue: "SELECT COUNT(*) FROM email_outbox WHERE email_outbox_status IN ('queued','retry','processing')",
};

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
}

const results: Record<string, unknown> = {};
for (const [name, query] of Object.entries(operations)) {
  const durations: number[] = [];
  for (let attempt = 0; attempt < repetitions; attempt += 1) {
    const started = performance.now();
    await connection.query(query);
    durations.push(performance.now() - started);
  }
  const [plan] = await connection.query(`EXPLAIN ${query}`);
  const result = { p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95), plan };
  results[name] = result;
  console.info(JSON.stringify({ action: "performance_baseline.operation", name, ...result }));
}

connection.release();
await closeDatabasePool();
console.info(JSON.stringify({ repetitions, results }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabasePool();
  process.exitCode = 1;
});
