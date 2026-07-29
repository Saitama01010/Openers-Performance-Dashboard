# Architecture

The application is a self-hosted Next.js App Router service backed by MySQL 8 and Drizzle ORM. Server Components read scoped data, Server Actions handle authenticated mutations, and authorization is repeated at every data boundary. Client components receive only data already authorized for the current user.

Current vertical slices:

- Hashed, revocable database sessions with HTTP-only cookies.
- Invitation and password-reset token services with expiring, single-use hashed tokens.
- Permanent dialer CSV batches with staged validation, immutable versions,
  atomic publication, administrator rollback/restore/deactivation,
  transactionally resolved active deletion, and permission-gated cleanup.
- Role-scoped operational totals with fail-closed manager scope.
- Server-only Google Apps Script transfer ingestion with validated Xfers rows,
  exact American Name matching, and fresh LeaderBoard rankings.

Planned slices remain closed-deal analytics, commissions, and metric flags.
Those integrations are not represented as verified until their real sources
and attribution rules are available.

The deployment target is a Hostinger Node.js Web App. The code does not depend on Vercel infrastructure.
