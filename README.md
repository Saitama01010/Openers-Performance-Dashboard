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
- Versioned GitHub Actions verification with MySQL 8

## Local Setup

```bash
npm install
copy .env.example .env
docker compose up -d mysql
npm run db:health
npm run db:migrate
npm run db:seed
npm run dev
```

Seeded users all use `Password123!`.

- `admin@example.com`
- `morgan.manager@example.com`
- `casey.manager@example.com`
- `ava.agent@example.com`
- `noah.agent@example.com`
- `mia.agent@example.com`

## Checks

```bash
npm run lint
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
```

`fixtures/dialer-sample.csv` is an anonymized dialer fixture that uses the exact production CSV headers.

Architecture, permissions, authentication, import, testing, and Hostinger deployment notes are maintained in `docs/`. Google Sheets, leaderboards, commissions, and metric flags are planned phases and are not yet production-ready.

## Transactional Email

Local development uses `EMAIL_PROVIDER=console`, which prints invitation and reset links in the server terminal and is rejected in production.

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

Optional:

- `EMAIL_REPLY_TO`

## Phase 2 Admin Workflow

Admins manage access at `/admin/users` and teams at `/admin/teams`.

1. Create or reactivate the team.
2. Create the user with full name, normalized email, role, required team, and agent dialer identity.
3. Send the invitation. The admin never enters the user's final password.
4. The user accepts the invitation and creates their password.
5. Admins can later move teams, add aliases, override permissions, force password resets, revoke sessions, deactivate accounts, or revoke access.

Seeded local admin: `admin@example.com` / `Password123!`. For production, create the first admin by running a one-time seed or insert script against `profiles` with role `admin`, `account_status='active'`, and a hashed password, then immediately rotate to an invitation/reset based password.
