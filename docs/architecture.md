# Architecture

The application is a self-hosted Next.js App Router service backed by MySQL 8 and Drizzle ORM. Server Components read scoped data, Server Actions handle authenticated mutations, and authorization is repeated at every data boundary. Client components receive only data already authorized for the current user.

Current vertical slices:

- Hashed, revocable database sessions with HTTP-only cookies.
- Invitation and password-reset token services with expiring, single-use hashed tokens.
- Dialer CSV preview batches stored server-side and confirmed transactionally.
- Role-scoped operational totals with fail-closed manager scope.

Planned slices remain Google Sheets ingestion, transfer and closed-deal analytics, leaderboards, commissions, and metric flags. Those integrations are not represented as verified until real source Sheets are available.

The deployment target is a Hostinger Node.js Web App. The code does not depend on Vercel infrastructure.
