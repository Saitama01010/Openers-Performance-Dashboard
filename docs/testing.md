# Testing

Local verification:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:health
npm run security:audit
```

Database-backed tests fail before test discovery unless the database is
explicitly isolated: set `NODE_ENV=test`, `DATABASE_ENVIRONMENT=test`, use a
local/CI host, and use a database name containing a standalone `test` marker
(for example `openers_dashboard_test`). This prevents unit, integration, and CI
test processes from connecting to a production database.

Runtime startup also requires `DATABASE_ENVIRONMENT` to match
`DEPLOYMENT_ENVIRONMENT` (or `NODE_ENV` when the explicit deployment value is
absent). Configure preview and production deployments with separate databases
and explicit `preview` and `production` values respectively.

CI runs the same commands against an isolated MySQL 8.4 service and fails if `db:generate` changes version-controlled migrations.

Current coverage includes CSV normalization and reconciliation, authorization,
authentication policy, invitation/reset consumption and replay, concurrent token
consumption, durable rate-limit races, admin account management,
cross-organization rejection, session revocation, email delivery, and import
lifecycle behavior.

Versioned import integration coverage includes permanent draft creation, invalid
headers, active-data isolation, first publish, superseding, latest rollback,
historical restore, team/date isolation, checksum override, manager/admin/agent
authorization, blocking errors, warning reasons, concurrent publication,
active-only dashboard queries, malformed input, and draft rejection.

Active-import lifecycle coverage includes previous and explicitly selected
fallbacks, no-active mode, exact-scope isolation, administrator-only
authorization, durable history, explicit dashboard empty state, and audit
metadata.

Permanent-import deletion coverage includes failed, rejected, deactivated,
superseded, rolled-back, and transactionally resolved active imports;
processing protection; administrator-only
authorization; owned metric/staging/validation removal; user/team/unrelated
import preservation; automatic previous-version activation; invalid fallback
status exclusion; shared legacy metric retention and provenance re-homing;
zero-reference metric removal; stored-file success, missing-file, and
cleanup-pending behavior; durable audits; concurrent deletion; concurrent
activation; database transaction rollback; and targeted history revalidation.

Provisioning coverage also includes temporary-password encryption and tamper detection, one-time reveal, required first-login password change, strict user-CSV header mapping and validation, formula-injection blocking, plain-English audit formatting and secret removal, regeneration invalidation, no automatic invitation, and transactional physical deletion while retaining security audit evidence.

Phase 2 adds unit coverage for:

- final active admin protection
- admin-only permission grant validation
- invalid and duplicate permission overrides
- role-specific team and dialer requirements
- exact dialer identity normalization and mapping key generation

Manual acceptance flow:

1. Log in as `admin@example.com`.
2. Create Team Alpha.
3. Create a manager and an agent assigned to Team Alpha.
4. Add the agent's dialer name and send the invitation.
5. Open the invitation delivered to a controlled test inbox and let the agent set their password.
6. Confirm the agent is redirected away from admin routes and sees only self-scoped data.
7. Confirm the manager cannot access `/admin/users` and sees only Team Alpha data.
8. Upload a CSV containing the agent's dialer name.
9. Confirm mapping, team snapshot, and import preview behavior.
10. Deactivate and reactivate the agent.
11. Revoke sessions and confirm old sessions fail.
12. Move the agent to another team and confirm membership history and audit entries.

Manual Resend verification:

1. Set `EMAIL_PROVIDER=resend`.
2. Set `RESEND_API_KEY` to a real server-side key outside the repository.
3. Set `EMAIL_FROM_NAME=DialExpert` and `EMAIL_FROM_ADDRESS=no-reply@updates.dialexpert.com`.
4. Optionally set `EMAIL_REPLY_TO`.
5. Start the app and confirm startup succeeds only when the required Resend settings are present.
6. Send a real invitation and confirm the sender appears as `DialExpert <no-reply@updates.dialexpert.com>`.
7. Confirm the invitation opens `/accept-invitation?token=...` and account setup completes.
8. Trigger forgot-password and confirm the reset email opens `/reset-password?token=...`.
9. Trigger a repeated forgot-password submission before the token expires and confirm it does not send a duplicate email.

The complete verification target remains:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:health
npm run security:audit
```

On Windows PowerShell, use `npm.cmd run ...` when script execution policy blocks `npm.ps1`.

## Integration Test Database

Integration tests must run against a database that is separate from the local
development database.

Required environment variables:

```txt
DATABASE_URL=mysql://user:password@127.0.0.1:3306/openers_dashboard
TEST_DATABASE_URL=mysql://user:password@127.0.0.1:3306/openers_dashboard_test
ALLOW_INTEGRATION_TEST_DATABASE=true
NODE_ENV=test
```

The integration guard in `src/test/integration-env.ts` refuses to run when:

- `TEST_DATABASE_URL` is missing
- `TEST_DATABASE_URL` resolves to the same database as `DATABASE_URL`
- `ALLOW_INTEGRATION_TEST_DATABASE` is not `true`
- `NODE_ENV` is not `test`
- the target host is not local
- the target database name does not include `test`
- the target looks production-like

Create and migrate the local test database before running integration tests:

```powershell
$env:NODE_ENV = "test"
$env:ALLOW_INTEGRATION_TEST_DATABASE = "true"
$env:TEST_DATABASE_URL = "mysql://user:password@127.0.0.1:3306/openers_dashboard_test"
npm run db:migrate:test
npm run test:integration
```

Do not commit real database URLs or local `.env*` files.
