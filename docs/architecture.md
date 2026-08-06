# Architecture

Role-specific dashboard composition, scope boundaries, request cost, caching, pagination, and operational history are documented in [Role dashboard operations](./role-dashboard-operations.md).

The application is a self-hosted Next.js App Router service backed by MySQL 8 and Drizzle ORM. Server Components read scoped data, Server Actions handle authenticated mutations, and authorization is repeated at every data boundary. Client components receive only data already authorized for the current user.

Current vertical slices:

- Hashed, revocable database sessions with HTTP-only cookies.
- Invitation and password-reset token services with expiring, single-use hashed tokens.
- Permanent dialer CSV batches with staged validation, immutable versions,
  atomic publication, administrator rollback/restore/deactivation,
  transactionally resolved active deletion, and permission-gated cleanup.
- Role-scoped operational totals with fail-closed manager scope.
- Server-only Google Apps Script ingestion of the backward-compatible Xfers
  envelope and nested Closed envelope, exact American Name matching, isolated
  per-source errors, and Closed-row LeaderBoard rankings.

Planned slices remain commissions and metric flags.

The deployment target is a Hostinger Node.js Web App. The code does not depend on Vercel infrastructure.
