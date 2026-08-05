# Database Schema

Drizzle schema lives in `src/db/schema.ts`; versioned SQL migrations live in `drizzle/`.

The `profiles.shift` field is a nullable `varchar(80)`. It is optional for
existing and newly created users and is updated through the same
administrator-only inline profile API as email, American Name, and team.

Foundational tables currently cover organizations, profiles, teams, historical team
memberships, roles, permissions, user permission overrides, hashed sessions,
invitation tokens, reset tokens, rate-limit counters, source mappings,
permanent dialer import batches, staged import rows, immutable dataset versions,
active dataset scope pointers, hourly dialer metrics, import errors, and audit
logs.

User provisioning adds encrypted temporary-password state to `profiles` and server-owned `user_import_batches`. The CSV batch stores the original upload for confirmation-time revalidation, is bound to the uploading administrator, expires after 30 minutes, and uses a `processing` state to reject duplicate confirmation races.

Important invariants:

- External dialer identities are unique by source plus normalized name.
- Hourly metrics are unique by dataset version, agent, date, and hour.
- `dialer_dataset_scopes.active_version_id` is the only dashboard-visible
  version for a source/import-type/date/team/dialer scope.
- Publication and rollback lock scope rows and update pointers transactionally.
- Deactivation and active deletion lock the exact scope pointers, activate a
  confirmed same-scope fallback or clear the pointer, and only then change or
  remove the selected import.
- Every new hourly metric references its permanent import batch and version.
- `dialer_agent_hourly_metrics.version_id` owns snapshot lifetime;
  nullable `batch_id` records import provenance and uses `ON DELETE SET NULL`
  for legacy rows retained by another version.
- Existing metrics are assigned to additive legacy active versions by migration.
- Duration metrics are integer seconds.
- Imported metrics store team ID and name snapshots.
- Original dialer CSVs are private `LONGTEXT` records and are never publicly
  addressed.
- Import deletion explicitly removes owned metric, staging, error, version, and
  batch rows in one transaction. Audit rows intentionally have no import foreign
  key, so the metadata-only deletion event survives.
- Legacy metrics whose batch and version owners differ are treated as shared
  history and cannot be deleted through import cleanup.
- Account and reset tokens store SHA-256 hashes, never raw values.
- Historical memberships use `started_at` and nullable `ended_at`; active membership queries require `ended_at IS NULL`.
- Profiles and teams carry a required `organization_id`. Team names are unique
  inside an organization, and production-visible team queries require the
  authenticated organization, `active = true`, and null `archived_at` and
  `deleted_at` values.

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

Permanent deletion physically removes the profile row (the local authentication
account), sessions, invitations, reset tokens, permissions, memberships,
mappings, imported agent rows, performance metrics, transfer fixtures, delivery
records, and user-linked audit rows in one transaction. Shared import batches
are retained, operator references are cleared or reassigned to the deleting
administrator, and affected import/version aggregates are recalculated before
commit. Deactivation and revocation remain separate non-destructive operations.

## Team contamination cleanup

`npm run teams:cleanup` is a manual, one-time utility and is never invoked by a
deployment hook. It requires an organization plus explicit team IDs and defaults
to a read-only dry run:

```powershell
npm.cmd run teams:cleanup -- --organization-id <organization-id> --team-id <team-id> --team-id <team-id>
```

The summary prints every selected ID and dependent users, managers, imports,
metrics, import rows, and reports. Destructive execution requires an active
administrator ID, `--execute`, and the exact confirmation string printed by the
dry run. Execution transactionally archives the selected teams and ends their
active memberships; it does not delete historical import or metric rows and
never selects teams by name.
