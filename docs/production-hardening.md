# Tier 1 security hardening runbook

## Deployment invariant

This application is intentionally single-company and single-tenant. Production
must contain exactly one active row in `organizations`. Startup fails closed
when `NODE_ENV`, `DATABASE_ENVIRONMENT`, and `DEPLOYMENT_ENVIRONMENT` are all
`production` and the active-organization count is not exactly one. Browser input
is never an organization authority; authenticated profile context supplies the
scope. Cross-organization fixtures remain in automated tests to prove that known
foreign UUIDs cannot read or mutate data.

## Required production environment

- `NODE_ENV=production`
- `DATABASE_ENVIRONMENT=production`
- `DEPLOYMENT_ENVIRONMENT=production`
- `DATABASE_URL` for a least-privilege MySQL 8 application user
- `SESSION_SECRET`, at least 32 random characters
- `TEMP_PASSWORD_ENCRYPTION_KEY`, a base64-encoded random 32-byte key
- `OUTBOX_ENCRYPTION_KEY`, a different base64-encoded random 32-byte key
- `APP_URL`, the exact public HTTPS origin with no path or credentials
- `TRUSTED_PROXY_HEADERS=true|false` according to the proxy contract below
- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM_NAME`, and
  `EMAIL_FROM_ADDRESS`
- `INVITATION_TTL_HOURS` and `PASSWORD_RESET_TTL_MINUTES`
- the documented Google transfer/leaderboard secrets when those integrations
  are enabled

Keep `ALLOW_DESTRUCTIVE_DEMO_SEED` unset/false and `DEMO_SEED_PASSWORD` unset.
No password, token, cookie, API key, or encryption key belongs in source,
deployment logs, or GitHub Actions output.

## Database initialization and migrations

Create the database with `utf8mb4`, use a least-privilege application account,
and enable regular verified backups. Before each release, back up MySQL, then
run:

```bash
npm ci
npm run db:migrate
npm run db:bootstrap
npm run db:health
```

`db:bootstrap` initializes required organization, role, and permission reference
data without demo users. `db:seed` creates disposable demo users and is
destructive. It refuses production or preview configuration, refuses non-local
databases except an explicit isolated test configuration, requires
`ALLOW_DESTRUCTIVE_DEMO_SEED=true`, and requires a private
`DEMO_SEED_PASSWORD`. Production deployment never runs it.

## Reverse proxy and mutation origins

`APP_URL` is the sole canonical browser origin. Cookie-authenticated mutation
APIs require a matching `Origin`; missing or hostile origins are rejected.

Use `TRUSTED_PROXY_HEADERS=false` when Node receives the public Host header
directly. In this mode the app rejects forwarded-host headers and does not use
`X-Forwarded-For` as a client identity.

Set `TRUSTED_PROXY_HEADERS=true` only when Hostinger's edge is the only route to
Node and it overwrites:

- `X-Forwarded-Host` with the public `APP_URL` host
- `X-Forwarded-Proto` with `https`
- `X-Forwarded-For` with the verified client address followed by trusted hops

The edge must strip client-supplied `Forwarded`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, and `X-Forwarded-For` before setting its own values. Do not
expose the Node listener directly to the internet. If Hostinger cannot guarantee
that contract, leave trusted proxy mode off; address-based rate limiting then
uses a non-IP fingerprint alongside account/token limits.

## Authentication controls

- Login: 5 attempts per normalized account per 15 minutes, 20 per hour, and 30
  per trusted client per 15 minutes.
- Forgot password: 3 per normalized account per hour and 10 per trusted client
  per hour, with the same response for known and unknown accounts.
- Invitation/reset consumption: 8 per token and 30 per trusted client per 15
  minutes. Token inspection also has hashed-token abuse limits.
- Limits are atomic MySQL upserts and remain effective across Node processes.
- Unknown-account login uses a constant dummy bcrypt hash. Password input is
  capped at 256 characters before bcrypt.
- Invitation and reset rows are locked transactionally; successful use is
  single-use, revokes competing links where applicable, and password changes
  revoke sessions.
- Temporary passwords are reveal-once, rate-limited, require a permanent change
  on first login, and regeneration requires an audited reason and revokes
  sessions. Prefer invitations for employees with working email.

## Security headers and caching

Next.js emits CSP, `frame-ancestors 'none'`, HSTS in production,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
same-origin opener/resource policies, and `X-Frame-Options: DENY`.
Authentication, admin, token, and API paths receive private/no-store caching.

After deployment, verify that the edge did not remove or duplicate incompatible
headers:

```bash
curl -sSI https://dashboard.example.com/login
curl -sSI https://dashboard.example.com/admin/users
curl -sSI https://dashboard.example.com/api/dashboard/export
```

Confirm HSTS appears only over production HTTPS, CSP is present, framing is
denied, and sensitive responses are `private, no-store`. Test the browser console
for CSP violations before cutover. Hostinger may add equivalent headers, but the
final response must have one coherent effective policy.

## CI and release procedure

Pull requests to `main`, pushes to `main`, and manual runs execute install, high
severity dependency audit, lint, TypeScript, migration drift, disposable MySQL
migration/health/seed checks, the full test suite, and a production build.
CodeQL runs on main, pull requests, a weekly schedule, and manual dispatch. CI
uses disposable secrets and isolated databases only.

Repository administrators must configure GitHub manually:

1. Settings > Branches (or Rulesets) > create a rule for `main`.
2. Require a pull request and at least one approving review.
3. Require the `CI / verify` and CodeQL checks, and require branches up to date.
4. Block force pushes and deletions; do not permit direct pushes to `main`.
5. Enable secret scanning and push protection under Code security.
6. Enable Dependabot alerts/security updates if repository policy permits.

Before release, from a clean checkout run:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run security:audit
```

`db:generate` must produce no unexplained migration changes. Review and back up
the production database, deploy the reviewed revision, run migrations and
bootstrap once, then start the web process and both workers as documented in
`production-readiness.md`.

## Admin recovery

Retain at least two active administrator accounts. If all administrators are
locked out, use a one-time, access-controlled database maintenance procedure to
create or reactivate one known administrator in the sole active organization,
mark `must_reset_password`, issue a reset/invitation through the application
service, and remove the maintenance artifact. Never disable final-admin
protection or insert a shared plaintext/demo credential.

## Production smoke test

1. Confirm startup accepts exactly one active organization and `/login` loads
   over HTTPS without a public cache.
2. Confirm valid login, generic invalid/unknown login, logout, and revoked
   session behavior.
3. Exercise invitation success/replay rejection and password-reset
   success/expiry/replay rejection with session invalidation.
4. Create a temporary account, reveal once, deny a second reveal, require the
   permanent-password flow, regenerate with a reason, and confirm the former
   credential/session fails.
5. Verify admin user/email/role/team/session operations and final-admin safety.
6. Verify manager team-only and agent self-only behavior; known foreign
   organization/team/profile UUIDs must be rejected.
7. Preview/publish a valid CSV; reject malformed/oversized content; verify stale
   draft, concurrent publication, rollback/restore/deactivate/delete; confirm raw
   downloads require authorization and return `text/csv` with `nosniff`.
8. Send hostile/missing `Origin`, hostile `Host`, and forged forwarded headers to
   a mutation and confirm rejection.
9. Verify audit history survives target deletion and contains no plaintext
   temporary password, reset/invitation token, cookie, or API key.
10. Inspect structured error logs for request ID, safe actor/entity IDs, category,
    and redaction; verify backups can be restored.
11. Queue an import and verify the HTTP response returns before parsing, the
    worker completes it, and `/health/ready` stays healthy.
12. Queue an invitation/reset email, verify worker delivery, then run retention
    cleanup in dry-run mode and inspect its bounded counts.

## Known non-enterprise limitations

This is a maintainable single-company Node/MySQL deployment, not a public SaaS
or high-availability platform. It does not include SSO, a WAF, Redis, distributed
tracing, multi-region failover, tenant provisioning, or automated Hostinger
control-plane validation. CSP permits inline styles/scripts required by the
current Next.js runtime; tighten only after nonce-based browser verification.
Availability, edge TLS/proxy correctness, MySQL backup retention, GitHub rules,
and production secret rotation remain operator responsibilities.
