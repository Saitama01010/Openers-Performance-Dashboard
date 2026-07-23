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

## Phase 2 migration

`drizzle/0003_amazing_mongu.sql` adds:

- `profiles.password_changed_at`
- `teams.deactivated_at`
- `team_memberships.active` and `team_memberships.created_by_id`
- source mapping approval, primary, deactivation, and nullable unique active/primary mapping keys
- `account_invitation_tokens.invitation_delivery_status`
- `password_reset_tokens.created_by_id`
- `email_delivery_attempts`
- search/filter indexes for users, teams, memberships, mappings, and email attempts

Dialer mappings now use app-maintained keys:

- `active_mapping_key = source + ':' + normalized_agent_name` only while active
- `primary_mapping_key = source + ':' + profile_id` only for the primary active mapping

MySQL unique constraints on nullable keys allow historical inactive aliases while preventing two active mappings for the same normalized dialer identity and preventing multiple primary active aliases for one user/source.

Team membership changes end the previous active row and insert a new row instead of overwriting history. Imported metric rows keep `team_id_snapshot` and `team_name_snapshot`.

Audit metadata must remain safe: never store passwords, password hashes, raw invitation/reset/session tokens, API keys, SMTP passwords, or other secrets.
