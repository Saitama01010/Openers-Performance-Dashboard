# Tier 1 + Tier 2 production readiness

## Runtime architecture

The release remains one single-company Next.js application backed by MySQL 8.
It has three lightweight Node entry points that share the same schema and
authorization rules:

- `npm run start` serves the web application.
- `npm run worker:imports` claims and processes durable CSV jobs.
- `npm run worker:email` delivers durable transactional-email intents.

MySQL is the queue, lease, application-data, and audit store. Redis, object
storage, and a separate message broker are intentionally not required for this
single-instance, approximately 600-employee deployment. The application must
have exactly one active organization in production. Browser-supplied
organization IDs are never authoritative.

## Required production configuration

Set the Tier 1 variables in `production-hardening.md` plus:

- `OUTBOX_ENCRYPTION_KEY`: an independent base64-encoded random 32-byte key.
- `DATABASE_POOL_CONNECTION_LIMIT` (default `10`).
- `DATABASE_POOL_QUEUE_LIMIT` (default `500`) provides bounded backpressure for
  short bursts without opening more MySQL connections.
- `DATABASE_CONNECT_TIMEOUT_MS` (default `10000`).
- `DATABASE_IDLE_TIMEOUT_MS` (default `60000`).
- `DATABASE_TLS=required` when the database endpoint presents a publicly
  trusted certificate; otherwise `disabled` only on a private trusted link.
- `IMPORT_WORKER_CONCURRENCY`, `IMPORT_WORKER_LEASE_SECONDS`, and
  `IMPORT_WORKER_POLL_MS` (defaults `2`, `120`, and `2000`).
- `EMAIL_WORKER_CONCURRENCY`, `EMAIL_WORKER_LEASE_SECONDS`,
  `EMAIL_WORKER_POLL_MS`, and `EMAIL_PROVIDER_TIMEOUT_MS` (defaults `2`, `60`,
  `2000`, and `10000`).
- `SESSION_ABSOLUTE_HOURS`, `ADMIN_SESSION_ABSOLUTE_HOURS`, and
  `SESSION_IDLE_MINUTES` (defaults `168`, `24`, and `720`).
- the `CLEANUP_*` and retention values documented below.
- `APP_VERSION` and `GIT_COMMIT_SHA`, set by the reviewed deployment artifact.

The pool default is deliberately modest. Web traffic and both workers share the
database server, so increase it only after observing acquisition waits and the
server's `max_connections`; 600 registered employees does not imply 600 open
database connections. The local 50-user rehearsal below used a measured
`DATABASE_POOL_CONNECTION_LIMIT=20`; start production at 10 and move to 20 only
after confirming Hostinger/MySQL connection headroom and reproducing the load
result. Keep the outbox key stable while queued email exists.
Rotating it requires draining the queue or a planned re-encryption migration.

## Durable imports

The upload request validates file metadata and limits, stores one private raw
CSV payload, creates a `dialer_import_batches` record and one `import_jobs` row,
then returns the batch ID immediately. The worker uses `SELECT ... FOR UPDATE
SKIP LOCKED`, bounded concurrency, expiring leases, periodic heartbeats, three
bounded attempts, safe failure codes, and exponential retry for transient
database failures. A crashed worker's expired lease can be reclaimed.

Parsing and validation results are persisted on the batch, so opening a preview
does not parse the raw CSV again. Publication, rollback, restoration,
deactivation, and deletion retain the existing scope-row locks and atomic active
version switching. Batch and version uniqueness make duplicate delivery
idempotent; a second worker cannot normally own the same lease.

Run the worker continuously when Hostinger supports another Node process. If it
does not, schedule `npm run worker:imports -- --once` every minute with overlap
disabled. `--once` atomically claims no more than the configured concurrency and
is safe to repeat. On shutdown, the process stops claiming work, awaits its
current claims, and closes its database pool. A failed job exposes only its job
ID, batch ID, safe code, and safe reason; inspect structured server logs using
the job ID. Invalid CSV is terminal and is not retried endlessly.

Raw CSV remains private MySQL `LONGTEXT`. This avoids a paid storage dependency
and keeps database backup/restore atomic, at the cost of larger backups. List and
preview queries select metadata and processed summaries without selecting the
raw payload. The 10 MB upload and 50,000-row limits remain enforced. Raw content
is loaded only for processing or an authorized `text/csv`, no-store download.

## Durable email outbox

Invitation, reset, password-change, and access-revocation transactions insert an
encrypted outbox intent in the same MySQL transaction as the business change.
Only the minimum token-bearing template payload is AES-256-GCM encrypted; it is
scrubbed after provider acceptance. Passwords, session values, provider keys,
and plaintext secrets are never stored in the outbox or logs.

The email worker uses atomic claims, leases, a provider timeout, five attempts,
bounded exponential backoff, permanent-failure classification, and the stable
provider idempotency key. A crash after provider acceptance is safe because a
retry uses that same provider key. Run `npm run worker:email` continuously, or
schedule `npm run worker:email -- --once` every minute without overlapping runs.
Terminal invitation-delivery failure is reflected on the invitation. An
administrator can request an audited, organization-scoped retry through
`POST /api/admin/email-outbox/{messageId}/retry`; use the message ID from the
structured operational log. The route is authenticated, administrator-only,
origin checked, UUID validated, rate limited, and no-store.

Resend webhook processing was intentionally not added: the current application
needs provider acceptance and retry reliability, while verified delivery/bounce
webhooks require an externally managed signing secret and operational inbox.
Provider IDs are retained so a future authenticated webhook can be correlated
without changing the outbox design.

## Sessions and retention

Sessions have absolute and idle expiry. Administrators default to a 24-hour
absolute lifetime; other users default to seven days. Activity writes are
throttled to once per five minutes. Password reset/replacement, privilege or
role changes, deactivation, revocation, and temporary-password regeneration
continue to revoke existing sessions.

Run `npm run cleanup:retention` for a read-only dry run. Schedule
`npm run cleanup:retention -- --execute` daily after reviewing the first dry run.
Each category deletes at most `CLEANUP_BATCH_SIZE` rows per invocation, and the
command is restartable. Defaults are:

- raw CSV content: 120 days, scrubbed without deleting version metadata;
- failed/rejected imports: 45 days;
- abandoned drafts: 14 days;
- user-import previews: their approximately 30-minute application expiry;
- used/revoked expired auth tokens: 30 days after expiry;
- expired/revoked sessions: 30 days after expiry/revocation;
- rate-limit windows: deleted after their own expiry;
- completed/failed outbox messages: 30 days.

Cleanup never selects audit logs, active versions, superseded rollback history,
or any published version. Organization-specific invocations scope sessions,
tokens, imports, and outbox data through the owning profile/organization.

## Health, version, and observability

- `GET /health/live` checks only that the Node process can answer.
- `GET /health/ready` verifies a real database connection and the critical
  Tier 2 tables. It returns `503` with a generic reason on failure.
- `GET /health/version` returns only application version, the first 40
  characters of the Git SHA, and environment class.

All three endpoints are dynamic and `no-store`. Configure Hostinger liveness
against `/health/live` and traffic readiness/uptime checks against
`/health/ready`; alert on sustained 503s. Verify `/health/version` matches the
reviewed commit after deployment.

The request proxy replaces browser-supplied request IDs with a server UUID and
returns it in `X-Request-Id`. Structured logs redact known secret fields and
record safe action, actor/entity/organization, duration, job/message IDs, and
error category. Import and email queue depth are available to operational code,
and the baseline script records database plans and latency. The error-tracker
interface defaults to redacted server logging; a Sentry adapter may be supplied
later without enabling request bodies, cookies, headers, or PII. A Sentry DSN,
project, sampling choice, and data-processing approval are external operator
decisions, so no monitoring account is required for local/test operation.

## Query, pagination, aggregate, and cache decisions

Actual dashboard paths aggregate active-version metrics in SQL. Import
comparison now loads only exact parsed scope keys rather than the complete
active metric dataset. User, team, audit, import-history, coaching-session, flag,
and legacy audit reads are bounded; browser page sizes are validated and capped.
Coaching report reads have a hard 200-row safety bound, and dashboard
shadowing/manual-case support reads have a stable 500-row bound.

Migrations `0021` through `0025` add queue, lease, cleanup, organization/action,
session, import-error, profile-access, and version-lifecycle indexes. Queue work
and stale leases use separate indexes because their predicates order by
different timestamps. Migration `0025` adds date-led active-metric indexes after
the 12-month fixture exposed avoidable range scans. Do not add leading-wildcard
indexes without measured evidence; current approximately 600-profile searches
remain bounded.

Daily materialized aggregate tables were intentionally not introduced. The
normalized active-version SQL, version index, profile/date index, and realistic
fixture meet the deployment target without creating another state that must be
rebuilt on publish/rollback. Revisit only if `npm run perf:baseline` on production-
representative hardware misses the documented target after `EXPLAIN` review.

No shared dashboard result cache was added. Request-scoped React memoization is
used for current-user and current-actor resolution. The only process cache is
the external Sheets cache: it has TTL, in-flight coalescing, stale fallback, and
a hard eight-entry eviction bound. There is no cross-organization/session cache,
and import/version changes therefore require no shared cache invalidation.

## Performance fixture and load test

Never run performance fixtures against production. On a disposable local schema
whose name contains `test` or `perf`, migrate first, then set
`ALLOW_PERFORMANCE_FIXTURE=true` and a private 16+ character
`PERF_FIXTURE_PASSWORD`. `npm run perf:fixture` creates an idempotent 600-user,
20-team, 20-manager, 365-day fixture with about 211,000 active metric rows, 40
import-history rows, 5,000 audit rows, and 50 active sessions. `-- --smoke`
creates a smaller validation fixture.

Run `npm run perf:baseline` for repeated query latency plus `EXPLAIN`. After a
production build, `npm run load:rehearsal` starts and warms a local production
server plus the real import worker, runs concurrency 10, 25, and 50 against the
shared database pool, then terminates both gracefully. The lower-
level `npm run load:test` targets an already running server. `npm run
perf:import` measures a real durable CSV enqueue and worker parse/validation
cycle, then removes its disposable batch; it has the same fixture/local guards.
`LOAD_TEST_USE_FIXTURE_SESSION=true` assigns the fixture admin, managers, and
agents their own deterministic sessions and role-appropriate paths only when
`ALLOW_PERFORMANCE_FIXTURE=true`; otherwise provide a short-lived local
`LOAD_TEST_COOKIE`. Configure paths, duration, concurrency, and human think time
with `LOAD_TEST_PATHS`, `LOAD_TEST_DURATION_SECONDS`,
`LOAD_TEST_CONCURRENCY`, and `LOAD_TEST_THINK_TIME_MS`. The scripts refuse
non-local targets unless the operator explicitly opts in.

Measured on the disposable 600-user/20-team/365-day fixture with 211,335 active
metric rows, five baseline repetitions produced these p95 query timings:
session lookup 6.03 ms, initial dashboard 204.97 ms, team dashboard 112.42 ms,
agent dashboard 115.96 ms, 90-day filtering 256.51 ms, leaderboard 124.01 ms,
flags 165.78 ms, import history 2.40 ms, admin users 3.47 ms, and audit history
1.90 ms. Queue depth queries were under 1.5 ms p95. A real one-row durable CSV
rehearsal queued in 9.14 ms and completed parsing, mapping, comparison, staging,
and persisted preview work in 50.19 ms before safe fixture cleanup.

The warmed production-server rehearsal used 500 ms think time and a measured
20-connection candidate. Results were: 10 users, 112 requests, zero errors,
p50 28.7 ms/p95 119.4 ms/p99 263.6 ms; 25 users, 272 requests, zero errors,
p50 47.4 ms/p95 165.2 ms/p99 233.3 ms; and 50 users, 496 requests, zero errors,
p50 102.9 ms/p95 299.1 ms/p99 458.2 ms. These results include the real import
worker polling concurrently. A deliberately unrealistic workload in
which every virtual user shared the administrator session saturated the pool;
the retained role-distributed scenario models the application's actual employee
population and still exercises each admin list with the fixture administrator.

Initial acceptance is zero sustained 5xx/error rate, no pool exhaustion, and
p95 below approximately one second for normal dashboard reads. Heavy reports
may exceed that target. Record real results; never treat a health-only run as a
dashboard performance result.

## Release rehearsal and deployment

From a clean reviewed checkout, run:

```bash
npm ci
npm run production:rehearsal
```

The rehearsal runs lint, typecheck, all tests, production build, migration
generation plus tracked-drift verification, high-severity dependency audit, and
`git diff --check`. Against disposable local MySQL only, configure the isolated
URLs and run `npm run production:rehearsal -- --with-db`; it additionally runs
test/application migrations, bootstrap, health, both workers once, and retention
dry-run. It never creates or selects a production URL itself.

Deployment sequence:

1. Review and merge the exact commit through required GitHub checks.
2. Record the merge SHA and set `GIT_COMMIT_SHA`/`APP_VERSION` on the artifact.
3. Stop import writes and drain/stop workers.
4. Take and verify a restorable MySQL backup.
5. Run `npm run db:migrate`, then `npm run db:bootstrap` once.
6. Run `npm run db:health` and start the web application.
7. Start both workers (or enable the non-overlapping cron commands).
8. Verify live, ready, version, login, role scopes, queued import completion,
   invitation/reset delivery, audit history, and hostile-origin rejection.
9. Run retention dry-run and inspect counts before enabling daily execution.

For rollback, stop writes/workers first. Application-only rollback is safe only
to a build compatible with migrations `0021`-`0025`. Otherwise restore the
verified pre-release database backup and the matching application SHA together.
Never hand-edit queue leases or active-version pointers. Queue rows with expired
leases recover automatically after the compatible worker restarts.

## External operator actions and known limitations

Hostinger must supply process/cron supervision, TLS and trusted-proxy header
behavior, MySQL TLS capability, backups, secret storage, log retention, and
uptime alerts. GitHub rulesets, required review/checks, secret scanning, and
force-push protection remain repository-owner settings. Resend DNS/domain and
API-key configuration remain provider actions.

This is a single-company, normally single-Node deployment. It does not provide
multi-region failover, SSO, Redis, a message broker, device management,
distributed tracing, or guaranteed exactly-once delivery from an external email
provider that ignores idempotency keys. MySQL/database availability is still a
shared dependency for web and workers. These are accepted non-enterprise limits,
not unfinished repository work.
