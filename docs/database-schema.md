# Database Schema

Drizzle schema lives in `src/db/schema.ts`; versioned SQL migrations live in `drizzle/`.

Foundational tables currently cover profiles, teams, historical team memberships, roles, permissions, user permission overrides, hashed sessions, invitation tokens, reset tokens, rate-limit counters, source mappings, dialer preview/import batches, hourly dialer metrics, import errors, and audit logs.

Important invariants:

- External dialer identities are unique by source plus normalized name.
- Hourly metrics are unique by source, agent, date, and hour.
- Duration metrics are integer seconds.
- Imported metrics store team ID and name snapshots.
- Account and reset tokens store SHA-256 hashes, never raw values.
- Historical memberships use `started_at` and nullable `ended_at`; active membership queries require `ended_at IS NULL`.

Future source, commission, and flag tables will be introduced only through additive migrations. Applied migrations must not be edited after release.
