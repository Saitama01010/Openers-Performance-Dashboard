# Dialer CSV Import Versioning

The dialer importer accepts the production agent-hours/performance format in
`fixtures/dialer-sample.csv`. Header aliases, UTF-8 BOM handling, case-insensitive
agent matching, whitespace normalization, manager team scope, and the existing
duration/call calculations remain supported.

## Lifecycle

Every upload creates a permanent `dialer_import_batches` record before parsing.
The original UTF-8 CSV is stored privately in MySQL `LONGTEXT`, with its byte
size, SHA-256 checksum, original name, database storage location, uploader,
scope, validation report, publication data, and rollback data. The application
has no object-storage integration and is self-hosted on Hostinger, so private
database storage avoids adding a paid dependency. Original files are available
only through an authenticated, no-store download route.

Batch lifecycle values are:

- `uploaded`
- `processing`
- `draft`
- `validation_failed`
- `ready_to_publish`
- `active`
- `superseded`
- `rolled_back`
- `failed`
- `rejected`

An upload never becomes dashboard-visible during parsing or review.

## Snapshot and scope model

Dialer rows are absolute hourly snapshots, not additive deltas. A file is a
cumulative daily export and can contain several dates, teams, agents, and hours.
The importer therefore creates one immutable `dialer_dataset_versions` row for
each:

```text
source + import type + reporting date + team + optional dialer
```

`dialer_dataset_scopes` contains the single authoritative active-version pointer
for each scope. The pointer row is locked during publish, rollback, and restore.
Metric rows are immutable and reference both their permanent upload and dataset
version. Dashboard queries join through the active pointer, so draft,
superseded, rejected, and rolled-back metrics are excluded automatically.

Publication locks every affected scope in a stable order, verifies that the
reviewed previous version is still active, supersedes it, activates the draft,
and advances the pointers in one transaction. A stale or concurrent publisher
must refresh and review again. The database primary key on the scope and the
single `active_version_id` column enforce one active pointer per scope.

Rollback changes pointers; it never subtracts metrics, rewrites historical
values, or deletes files. “Undo latest import” reactivates each version's direct
predecessor. “Restore historical version” selects the historical import's exact
scope versions. Other dates, teams, sources, and import types are untouched.

## Validation

Every parsed row is stored in `dialer_import_rows` with its original row number
and values, normalized name, matched profile, metric values, team snapshot,
matching state, validation state, and messages. `import_errors` remains populated
for compatibility with the existing unmatched-name workflow.

Blocking validation includes:

- malformed CSV content
- missing or duplicate required headers
- no data rows or more than 50,000 rows
- duplicate agent/date/hour rows
- ambiguous agent mappings
- invalid mapped dates, hours, calls, or durations
- negative, malformed, NaN, or infinite metric values
- no valid mapped metric rows

Overrideable warnings include:

- exact duplicate checksum for the same source, import type, and parsed scope
  set (an identical upload still being parsed is treated conservatively)
- unmatched or out-of-scope agents
- selected reporting date mismatch
- talk time greater than login time
- unusually high login time
- missing agents from the current active version
- large decreases in agents, login time, or calls
- large increases in login time or calls

Informational notices include ignored empty rows and new matched agents.

Thresholds are centralized in `src/import/config.ts`:

| Threshold | Default | Rationale |
| --- | ---: | --- |
| Agent-count decrease | 20% | Flags likely partial team exports |
| Total login decrease | 30% | Flags truncated or incomplete hours |
| Total calls decrease | 30% | Flags incomplete performance exports |
| Total metric increase | 200% | Flags wrong periods or duplicate aggregation |
| Unmatched agents | 10% | Flags a likely wrong team/mapping set |
| Login per row | 24 hours | Warns on values outside a valid reporting interval |
| Login per agent/day | 24 hours | Warns on logically impossible daily totals |

Warnings require an administrator and a reason of at least five characters.
Managers retain the product's existing permission to upload and publish clean
assigned-team drafts, but they cannot override warnings. Agents cannot upload,
publish, reject, restore, or roll back imports.

## Comparison

Review compares staged metrics only with active metrics for the same exact
scope. It includes current/uploaded/matched/unmatched agent counts; new, missing,
and duplicate agents; before/after totals and absolute/percentage differences
for calls, login, talk, and wrap; and per-agent differences.

## Audit events

Structured audit events are written for upload, parse/revalidation, validation
failure, processing failure, draft rejection, publication, warning override,
duplicate override, rollback, historical restore, active deactivation, and
permanent deletion.
Metadata records IDs, scope keys, state changes, counts, and reasons. Raw CSV
rows are never copied into audit text. The deletion event uses the deleted
import ID as plain metadata rather than a foreign key, so it remains durable.

## Active deactivation

Administrators with `imports.deactivate` can remove an active batch from live
calculations while preserving its versions, parsed rows, and raw CSV. The
administrator must provide a reason and explicitly confirm one of three
outcomes: activate the most recent valid historical versions, select a complete
same-scope historical batch, or leave the exact scopes without active pointers.
Activating a fallback additionally requires `imports.restore`.

The server locks the batch, owned versions, and scope-pointer rows before
re-reading active state. It validates every fallback against the complete
source/import-type/date/team/dialer scope, updates version states and pointers,
and writes the durable audit event in one transaction. A no-active scope is
represented by a null pointer; dashboard queries never select the latest upload
or a superseded/deactivated version implicitly.

## Permanent deletion

Administrators with `imports.delete` can permanently delete inactive batches in
`draft`, `validation_failed`, `failed`, `rejected`, `deactivated`,
`ready_to_publish`, `superseded`, or `rolled_back` state. Active deletion
automatically selects the highest valid lower `version_number` for each exact
scope; if none exists, that scope's active pointer is cleared. Inactive deletion
requires `DELETE IMPORT`; active deletion requires `DELETE ACTIVE IMPORT`.

The server locks the batch, its versions, and exact scope pointers before
rechecking eligibility. Draft, rejected, failed, validation-failed, processing,
or later versions are never eligible as automatic fallbacks. Deleting a
non-active import never changes the active pointer.

`dialer_agent_hourly_metrics.version_id` is the authoritative snapshot
relationship. Legacy `batch_id` values are provenance and may point at a batch
different from the version owner. During deletion, retained rows are re-homed
to the surviving version's import batch (or left with nullable provenance),
while rows whose deleted version was their final reference are removed. Shared
legacy ownership therefore no longer blocks deletion.

Database-backed CSV content is part of the batch row, so the raw file and
metadata commit or roll back with the dependent metric, staging, validation,
and version-row deletion. A missing database-stored file is treated as already
clean. No external provider currently exists; an unknown provider records
cleanup-pending metadata without rolling back the database deletion. Shared
source mappings, users,
teams, audit events, and unrelated dashboard records are never removed.

Retention defaults live in `src/import/config.ts`:

- Preserve failed imports for 30 days and rejected imports for 30 days as
  application-level cleanup guidance.
- Never delete any audit event.
- Do not automatically delete superseded imports.
- Keep raw CSVs for the same period as their parsed import rows.

There is intentionally no automatic or bulk cleanup in this release. The
repository has no reliable scheduled-job mechanism, and bounded single-import
transactions are easier to audit and recover.

## Cache behavior

Dashboard and import pages are force-dynamic and there is no SWR, React Query,
Redis, Vercel, or database-result cache. Server Actions still call targeted
`revalidatePath` for `/dashboard`, `/import`, and `/admin/imports`. If path
revalidation fails after the database transaction commits, the database remains
authoritative and the next force-dynamic request reads the new pointers.
Successful deactivation and deletion revalidate `/dashboard`,
`/admin/imports`, and the affected detail path; the UI does not change rows
optimistically.

## Migration

`drizzle/0009_needy_lenny_balinger.sql` is additive except for widening the raw
file column, expanding the import status enum, and replacing the old mutable-row
unique key with a version-aware key.

The migration:

1. Preserves every existing import and metric ID.
2. Maps old preview/confirmed statuses to the new lifecycle.
3. Creates one legacy active version per existing source/date/team union.
4. Assigns every existing metric to its legacy version.
5. Creates active scope pointers.
6. Leaves old batch references on metric rows intact.

No database reset or fabricated metric data is required.

`drizzle/0010_import_deletion_permission.sql` adds the `imports.delete`
permission and grants it only to the administrator role.

`drizzle/0011_tense_cammi.sql` adds the `deactivated` lifecycle states plus
administrator-only `imports.deactivate` and `imports.restore` permissions.

`drizzle/0012_cloudy_baron_zemo.sql` makes metric `batch_id` nullable with
`ON DELETE SET NULL`, preserving authoritative `version_id` snapshot references
when legacy import provenance is removed.

## Deployment

1. Put imports into a short maintenance window.
2. Take a verified MySQL backup.
3. Stage the new application build without sending it live yet.
4. Run `npm run db:migrate` while the previous build is still serving reads and
   import writes remain paused.
5. Switch traffic to the new build immediately after migration succeeds. If the
   platform runs migrations as a release command, keep traffic drained until
   both the migration and application rollout complete.
6. Run `npm run db:health`.
7. Verify that every existing metric has a non-null `version_id` and every
   legacy scope has one active pointer.
8. Open `/dashboard`, `/import`, and `/admin/imports`.
9. Resume imports.

No new environment variable is required. Next.js Server Action body size is set
to 11 MB so the existing 10 MB CSV limit plus multipart overhead is supported.

### Code-deployment rollback

The prior application does not understand the new import-status enum and must
not be redeployed directly after this migration. Use one of these safe paths:

1. Preferred: deploy a revert/compatibility build that keeps the new schema and
   active-pointer reads.
2. Full rollback: stop writes, restore the pre-migration MySQL backup, then
   redeploy the previous application build.

Do not manually delete versions or copy metric values back into old rows.

## Manual QA checklist

- [ ] Upload the first valid CSV for a date and confirm the dashboard is unchanged.
- [ ] Review file metadata, SHA-256, reporting scope, validation, and comparison.
- [ ] Publish the first version and confirm the dashboard changes.
- [ ] Upload a second CSV for the same date/team.
- [ ] Review company totals and per-agent differences.
- [ ] Publish the second version and confirm the first is superseded.
- [ ] Undo the second import with a required reason.
- [ ] Confirm the dashboard exactly returns to the first version.
- [ ] Restore the second historical version and confirm later history remains.
- [ ] Upload the exact same bytes again and confirm duplicate status/date appear.
- [ ] Confirm publication is blocked without an administrator override reason.
- [ ] Upload malformed CSV and confirm active data remains unchanged.
- [ ] Select the wrong reporting date and confirm an overrideable warning.
- [ ] Upload a file missing active agents and review the missing list.
- [ ] Upload unmatched agents and review the unmatched row report.
- [ ] Upload duplicate agent/date/hour rows and confirm blocking validation.
- [ ] Sign in as an agent and confirm import/history routes and actions are denied.
- [ ] Sign in as a manager and confirm only assigned-team rows are staged.
- [ ] Confirm a manager cannot override warnings or perform rollback/restore.
- [ ] Sign in as an administrator and exercise upload, publish, reject, rollback,
      restore, history, audit, and download.
- [ ] Send two publish requests for competing drafts and confirm exactly one wins.
- [ ] Confirm another date, team, dialer, and import type remain unchanged.
- [ ] Confirm authenticated downloads set `Cache-Control: private, no-store`.
- [ ] Deactivate an active import with the previous fallback and confirm the
      dashboard switches immediately while the deactivated import remains in
      history.
- [ ] Deactivate an active import with no fallback and confirm the dashboard
      displays the explicit no-approved-import state instead of zero totals.
- [ ] Select a fallback from another team/date/dialer and confirm the server
      rejects it without changing any pointer.
- [ ] Permanently delete an active import only after typing
      `DELETE ACTIVE IMPORT`; confirm the immediately preceding valid version
      becomes active automatically.
- [ ] Open a failed or rejected import and verify the Delete dialog lists its
      file, scope, stored-file state, and estimated owned records.
- [ ] Confirm the final Delete button remains disabled until a reason is entered
      and `DELETE IMPORT` is typed exactly.
- [ ] Delete an eligible import and confirm its details return 404 while its
      deletion event remains in the audit log.
- [ ] Confirm shared legacy metrics remain available through their surviving
      version after the originating batch is deleted.
- [ ] Confirm an agent and manager cannot invoke permanent deletion.
