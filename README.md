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
