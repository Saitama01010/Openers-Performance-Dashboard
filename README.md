# Openers Performance Dashboard

Self-hosted Next.js dashboard for secure dialer imports and role-scoped opener performance reporting.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- MySQL
- Drizzle ORM
- Docker Compose for local MySQL
- Server-side session authentication
- Invitation and password-reset account setup
- Admin Users & Access and Teams administration
- Console and Resend transactional email providers
- MySQL-backed import and email workers with leases and bounded retries
- Bounded retention cleanup and live/ready/version endpoints
- Versioned GitHub Actions verification with MySQL 8

## Local Setup

```bash
npm install
copy .env.example .env
docker compose up -d mysql
npm run db:health
npm run db:migrate
npm run db:bootstrap
# Optional destructive development demo data requires explicit env opt-in.
npm run db:seed
npm run dev
# In separate terminals, or use the documented scheduled --once mode:
npm run worker:imports
npm run worker:email
```

`db:bootstrap` initializes required organization, role, and permission reference
data without demo users. `db:seed` is development/test-only, refuses
production-like or remote databases, requires
`ALLOW_DESTRUCTIVE_DEMO_SEED=true` plus a private `DEMO_SEED_PASSWORD`, and
never prints that password.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:health
npm run security:audit
npm run production:rehearsal
```

`fixtures/dialer-sample.csv` is an anonymized dialer fixture that uses the exact production CSV headers.

Architecture, permissions, authentication, import, testing, Google Apps Script
transfer and closed-deal ingestion, and Hostinger deployment notes are
maintained in `docs/`. Commissions, metric flags, role dashboards, coaching,
durable workers, and production cleanup are implemented vertical slices.

## Transactional Email

Local development may use `EMAIL_PROVIDER=console`, which records delivery
metadata but redacts token-bearing message bodies. It is rejected in production.

Production uses Resend with the verified domain `updates.dialexpert.com` and the sender:

`DialExpert <no-reply@updates.dialexpert.com>`

Required production email variables:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `EMAIL_FROM_NAME=DialExpert`
- `EMAIL_FROM_ADDRESS=no-reply@updates.dialexpert.com`
- `APP_URL`
- `INVITATION_TTL_HOURS`
- `PASSWORD_RESET_TTL_MINUTES`
- `OUTBOX_ENCRYPTION_KEY`

Optional:

- `EMAIL_REPLY_TO`

## Phase 2 Admin Workflow

Admins manage access at `/admin/users` and teams at `/admin/teams`.

1. Create or reactivate the team.
2. Create the user with full name, normalized email, role, required team, and agent dialer identity.
3. Send the invitation. The admin never enters the user's final password.
4. The user accepts the invitation and creates their password.
5. Admins can later move teams, add aliases, override permissions, force password resets, revoke sessions, deactivate accounts, or revoke access.

Never run `db:seed` in production or preview. Initialize production reference
data with `npm run db:bootstrap`; provision the first administrator through the
one-time recovery procedure in `docs/production-hardening.md`, then immediately
complete invitation/reset-based password setup.

The production security and release runbook is
[`docs/production-hardening.md`](docs/production-hardening.md).
The combined runtime, worker, retention, performance, and handover runbook is
[`docs/production-readiness.md`](docs/production-readiness.md).
