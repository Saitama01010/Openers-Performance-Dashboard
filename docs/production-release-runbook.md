# Production release runbook

This runbook deploys the reviewed single-company release. Commands that touch
MySQL must be run only after the operator verifies the selected URL and a
restorable backup. Never run the demo seed in production.

## 1. GitHub release gate

1. Review the pull request from `production/tier-1-tier-2` into `main`.
2. Confirm lint, typecheck, tests, build, migration rehearsal, dependency audit,
   CodeQL, and secret checks are green for the exact head SHA.
3. Obtain at least one independent approval.
4. Confirm the `main` ruleset requires pull requests and required checks, blocks
   direct and force pushes, dismisses stale approvals, and prevents deletion.
5. Enable GitHub secret scanning and push protection where the repository plan
   supports them.
6. Merge normally without force-pushing or rewriting the reviewed commits.
7. Record the merge SHA. Build and deploy that SHA, set it as
   `GIT_COMMIT_SHA`, and verify `/health/version` after deployment.

At the final repository review, GitHub reported that `main` was not protected
and secret scanning/push protection were disabled. A repository owner must do
the following before merge:

1. Open **Settings → Rules → Rulesets → New branch ruleset** and target the
   branch name `main`.
2. Enable restriction of deletions and non-fast-forward/force pushes, require a
   pull request before merging, require at least one approval, dismiss stale
   approvals when new commits are pushed, and require conversation resolution.
3. Require the status checks named `verify` (CI) and
   `Analyze JavaScript and TypeScript` (CodeQL). Do not allow a bypass for
   ordinary contributors or direct pushes.
4. Activate the ruleset and verify its status is **Active**, then confirm PR
   #12 shows both checks as required rather than merely informational.
5. Open **Settings → Code security and analysis** and enable secret scanning,
   push protection, validity checks where available, and Dependabot security
   updates. If the repository plan does not expose a control, record the plan
   limitation and use an organization ruleset or equivalent owner control.

## 2. Production environment

Store sensitive values in Hostinger's secret/environment facility. Do not put
them in a committed file, command history, ticket, or log.

| Variable | Requirement | Classification | Production guidance |
| --- | --- | --- | --- |
| `NODE_ENV` | required | non-secret | `production` |
| `DATABASE_ENVIRONMENT` | required | non-secret | `production` |
| `DEPLOYMENT_ENVIRONMENT` | required | non-secret | `production` |
| `APP_URL` | required | non-secret | Canonical public HTTPS origin, with no path or trailing slash |
| `DATABASE_URL` | required | sensitive external value | Least-privilege MySQL URL; never the backup/admin credential |
| `DATABASE_TLS` | required decision | non-secret | `required` when provider TLS is supported; otherwise document the private trusted link |
| `DATABASE_POOL_CONNECTION_LIMIT` | optional default | non-secret | Start at `10` per process |
| `DATABASE_POOL_QUEUE_LIMIT` | optional default | non-secret | Start at `500` |
| `DATABASE_CONNECT_TIMEOUT_MS` | optional default | non-secret | Start at `10000` |
| `DATABASE_IDLE_TIMEOUT_MS` | optional default | non-secret | Start at `60000` |
| `SESSION_SECRET` | required | generated secret | Random value of at least 32 characters; rotation signs out all users |
| `TEMP_PASSWORD_ENCRYPTION_KEY` | required | generated secret | Standard base64 of exactly 32 random bytes; preserve for existing encrypted temporary credentials |
| `OUTBOX_ENCRYPTION_KEY` | required | generated secret | Separate standard-base64 32-byte key; preserve while encrypted outbox payloads exist |
| `TRUSTED_PROXY_HEADERS` | required decision | non-secret | `true` only after confirming Hostinger overwrites client-supplied forwarded headers; otherwise `false` |
| `EMAIL_PROVIDER` | required | non-secret | `resend`; console delivery is rejected in production |
| `RESEND_API_KEY` | required for Resend | sensitive external value | Server-side Resend API key |
| `EMAIL_FROM_NAME` | required | non-secret | Verified display name |
| `EMAIL_FROM_ADDRESS` | required | non-secret | Address on the verified Resend domain |
| `EMAIL_REPLY_TO` | optional | non-secret/PII | Monitored reply mailbox if used |
| `INVITATION_TTL_HOURS` | optional default | non-secret | Default `48` |
| `PASSWORD_RESET_TTL_MINUTES` | optional default | non-secret | Default `30` |
| `IMPORT_WORKER_CONCURRENCY` | optional default | non-secret | Default `2` |
| `IMPORT_WORKER_LEASE_SECONDS` | optional default | non-secret | Default `120` |
| `IMPORT_WORKER_POLL_MS` | optional default | non-secret | Default `2000` |
| `EMAIL_WORKER_CONCURRENCY` | optional default | non-secret | Default `2` |
| `EMAIL_WORKER_LEASE_SECONDS` | optional default | non-secret | Default `60`; must exceed provider timeout by at least 5 seconds |
| `EMAIL_WORKER_POLL_MS` | optional default | non-secret | Default `2000` |
| `EMAIL_PROVIDER_TIMEOUT_MS` | optional default | non-secret | Default `10000` |
| `SESSION_ABSOLUTE_HOURS` | optional default | non-secret | Default `168` |
| `ADMIN_SESSION_ABSOLUTE_HOURS` | optional default | non-secret | Default `24` |
| `SESSION_IDLE_MINUTES` | optional default | non-secret | Default `720` |
| `CLEANUP_BATCH_SIZE` | optional default | non-secret | Default `500` |
| `RAW_CSV_RETENTION_DAYS` | optional default | non-secret | Default `120` |
| `FAILED_IMPORT_RETENTION_DAYS` | optional default | non-secret | Default `45` |
| `DRAFT_IMPORT_RETENTION_DAYS` | optional default | non-secret | Default `14` |
| `AUTH_TOKEN_RETENTION_DAYS` | optional default | non-secret | Default `30` |
| `SESSION_RETENTION_DAYS` | optional default | non-secret | Default `30` |
| `APP_VERSION` | required release value | non-secret | Release tag or package version |
| `GIT_COMMIT_SHA` | required release value | non-secret | Exact reviewed/merged 40-character SHA |
| `GOOGLE_TRANSFERS_APPS_SCRIPT_URL` | optional pair | sensitive external value | HTTPS Apps Script `/exec` URL; set only with its secret |
| `LEADERBOARD_API_SECRET` | optional pair | generated secret | Required when the Apps Script URL is configured |
| `GOOGLE_SHEETS_TIMEZONE` | optional default | non-secret | Default `Africa/Cairo` |

Do not configure `TEST_DATABASE_URL`, `UPGRADE_TEST_DATABASE_URL`, any
`ALLOW_*_TEST` flag, `ALLOW_DESTRUCTIVE_DEMO_SEED`, `DEMO_SEED_PASSWORD`,
`LOCAL_RESET_ADMIN_PASSWORD`, performance-fixture variables, or load-test
variables in production.

Generate each 32-byte encryption key independently:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`OUTBOX_ENCRYPTION_KEY` is durable application data protection, not an
ephemeral deployment secret. The ciphertext envelope is format-versioned but
does not support simultaneous old/new keys. Before rotation, stop enqueueing,
drain or explicitly resolve encrypted pending/retryable messages, verify the
old key is in the protected backup, update every process atomically, and
restart all processes. A lost old key makes its pending payloads unreadable.

## 3. Database cutover

1. Pause imports and stop workers so no release-sensitive write is in flight.
2. Create a full production MySQL backup and record its timestamp/checksum.
3. Restore that backup into an isolated database and run application health and
   representative row-count checks. A backup is not accepted until restore is
   proven.
4. Confirm sufficient disk/database capacity and a conservative
   `max_connections`. The default topology has a maximum configured application
   pool capacity of 30: web 10 + import worker 10 + email worker 10. Require at
   least 50 total connections to leave migration/operator/monitoring headroom.
5. Confirm exactly one active organization and record counts for profiles,
   teams, import batches, dataset versions, metrics, and audit logs.
6. Record the current migration journal/version.
7. Verify `DATABASE_URL` identifies the intended production host and database.
8. Run, in order:

   ```bash
   npm run db:migrate
   npm run db:bootstrap
   npm run db:health
   ```

9. Recheck the recorded counts, exactly one active organization, active-version
   pointers, orphan counts, audit-log counts, and migration version.

MySQL DDL is not globally transactional. If migration execution fails after a
DDL statement, stop. Preserve logs, compare the journal and live schema with
the migration SQL, and choose an explicit forward fix or restore the verified
backup. Do not repeatedly rerun unknown partial DDL and do not edit active
version pointers manually.

## 4. Process startup

The deterministic commands are:

```bash
npm run start
npm run worker:imports
npm run worker:email
npm run cleanup:retention -- --dry-run
npm run cleanup:retention -- --execute
```

On a VPS, supervise the first three as separate long-running processes using
systemd or PM2 with the same release directory/environment. Configure restart
on failure, graceful SIGTERM, distinct process names, and log capture. Workers
stop claiming work on SIGTERM/SIGINT, finish current claims, and close their DB
pools; expired leases recover after a crash.

Hostinger's managed Node.js documentation confirms one web application process,
not three independently supervised persistent processes. Its shared/cloud
guidance uses hPanel cron jobs. Before managed-plan deployment, obtain explicit
confirmation that the target plan can run Node/npm custom cron commands in the
deployed working directory with production environment variables, duration
long enough for `--once`, and overlap prevention. If confirmed, schedule:

```bash
npm run worker:imports -- --once
npm run worker:email -- --once
```

every minute without overlap, and schedule
`npm run cleanup:retention -- --execute` daily. If that cannot be guaranteed,
use a Hostinger VPS/another supervisor-capable Node host or do not release.

## 5. Email and DNS

1. Create a least-privilege Resend API key and store it only in Hostinger.
2. Verify the sending domain in Resend.
3. Publish and verify the exact SPF and DKIM records supplied by Resend.
4. Publish a DMARC policy, starting with monitored policy as appropriate for the
   company's mail administrator.
5. Start the email worker and send a controlled invitation.
6. Complete a controlled reset-email flow.
7. Induce/retry a safe operational failure and verify the audited admin retry.
8. Confirm provider IDs are stored and raw invitation/reset tokens are absent
   from logs. Provider delivery is at least once across the narrow crash-after-
   acceptance/before-acknowledgement window; the stable Resend idempotency key
   minimizes duplicates.

## 6. Health, logs, and monitoring

Verify `GET /health/live` returns 200 without a database query, `GET
/health/ready` returns 200 only with the database/schema available, and `GET
/health/version` contains the exact deployed SHA/environment without secrets.
Configure uptime checks for live and ready and alert on sustained failures.
Verify separate, retained logs for web, import worker, email worker, and cleanup;
confirm request/job/message IDs allow correlation and secrets are redacted.

If Sentry or another error tracker is selected, configure its external project,
retention, sampling, and data-handling settings. Do not send cookies, headers,
request bodies, raw CSV, email tokens, or passwords.

## 7. Production smoke test

Use controlled test accounts/data and preserve audit evidence:

1. Login and 2. logout.
3. Admin login, 4. manager login, and 5. agent login.
6. Verify role visibility, 7. manager team isolation, and 8. agent self-scope.
9. Create a user, 10. send/accept an invitation, and 11. complete password reset.
12. Generate, reveal once, and replace a temporary password.
13. Open dashboard, 14. change date filter, 15. open leaderboard, and 16. flags.
17. Upload a controlled CSV, 18. observe queued state, and 19. worker completion.
20. Review preview, 21. publish, 22. roll back, and 23. restore.
24. Verify authorized raw CSV download and cross-scope rejection.
25. Verify audit history records the actions.
26. Verify invitation/reset email delivery and operational retry visibility.
27. Submit a hostile-origin mutation and confirm rejection.
28. Revoke a session and confirm it cannot be reused.
29. Verify all health endpoints.
30. Verify the version endpoint matches the exact deployed merge SHA.

Then run `npm run cleanup:retention -- --dry-run`, inspect every category and
count, and only then enable the recurring execute command.

## 8. Rollback and incident recovery

- **Application deployment fails:** keep workers stopped, redeploy the previous
  build only if it is compatible with the migrated schema, then verify health.
- **Migration fails:** stop all writes. Do not assume reverse SQL exists. Use a
  reviewed forward fix for a known partial state or restore the verified backup
  and matching application SHA.
- **Import worker fails:** leave web traffic available, stop/restart only the
  worker, inspect safe job IDs/codes, and allow expired leases to recover. Do
  not edit job leases or active versions manually.
- **Email worker fails:** web business transactions remain durable in the
  outbox. Restore the same encryption key, restart the worker, and use the
  audited retry action for terminal operational failures. Do not delete pending
  payloads to clear the queue.
- **Import is stuck:** verify worker health and DB connectivity, then allow the
  lease to expire and be reclaimed. Permanently invalid/exhausted jobs remain
  terminal; preserve their audit evidence.
- **Severe regression:** stop workers and writes, capture logs/job IDs, restore
  the last compatible application. If schema compatibility is uncertain,
  restore the verified pre-release database backup and matching application
  SHA together. Re-run health and the complete smoke test before reopening.

## 9. Pre-release repository commands

Against disposable local databases only:

```bash
npm ci
npm run production:rehearsal -- --with-db
npm run perf:fixture
npm run perf:baseline
npm run perf:import
npm run load:rehearsal
```

The database-enabled rehearsal requires guarded, distinct runtime, integration,
and upgrade-test URLs. It must never be pointed at production.

Before opening production access, repeat the authenticated 10/25/50-user
rehearsal against an isolated Hostinger staging deployment. The reviewed local
baseline had zero errors and no pool exhaustion, but complete-response p95 rose
from 0.77 seconds at 10 users to 1.58 seconds at 25 and 2.08 seconds at 50. Do
not raise all three process pools as a first response; correlate request logs,
DB running/connected threads, and host CPU/memory, then tune only with measured
MySQL headroom.
