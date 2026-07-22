# Openers Performance Dashboard

Local-first Next.js dashboard for importing dialer CSV performance data and reviewing opener metrics by role scope.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- MySQL
- Drizzle ORM
- Docker Compose for local MySQL
- Server-side session authentication

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
