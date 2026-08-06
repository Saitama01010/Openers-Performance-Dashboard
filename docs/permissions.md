# Permissions

Authorization fails closed and is enforced server-side.

| Role | Private scope | Import scope |
| --- | --- | --- |
| Admin | Company | Company |
| Manager | Active assigned teams | Active assigned teams |
| Agent | Self | None |

Role grants are stored in `role_permissions`. Explicit per-user allow or deny rows may override only Team Management (`teams.*`) and Imports (`imports.*`) permissions. A missing grant is a denial. User, Metrics, Coaching, Flags, and Other permissions always use role defaults; the provisioning migration removes legacy overrides in those namespaces and runtime evaluation ignores them defensively.

A manager with no active team receives an empty profile scope. An assigned team with no profiles also produces an empty scope; neither condition removes the database filter. Deactivated and revoked profiles cannot use existing sessions. Route visibility is not an authorization control.

## Permission catalog

The Phase 2 catalog is seeded from `src/admin/policy.ts`:

- User management: `users.view`, `users.create`, `users.update`, `users.activate`, `users.deactivate`, `users.revoke`, `users.assign_role`, `users.assign_team`, `users.manage_permissions`, `users.revoke_sessions`
- Team management: `teams.view`, `teams.create`, `teams.update`, `teams.deactivate`, `teams.assign_manager`, `teams.assign_agents`
- Imports: `imports.preview`, `imports.confirm`, `imports.view_history`,
  `imports.view_errors`, administrator-only `imports.deactivate`,
  `imports.delete`, and `imports.restore`, plus compatibility grants
  `imports.company` and `imports.team`
- Metrics: `metrics.view_own`, `metrics.view_team`, `metrics.view_company`, plus compatibility grants `metrics.self`, `metrics.team`, and `metrics.company`
- Coaching: `coaching.view_team`, `coaching.create_team`,
  `coaching.view_company`, `coaching.create_company`
- Flags: `flags.view_own`, `flags.view_team`, `flags.view_company`
- Other: `leaderboard.view`, `leaderboards.view`, `audit.view`, `audit.view_company`, `integrations.manage`, `commissions.manage`, `flags.manage`

Role-dashboard grants are non-overridable role defaults:

- Agent: `dashboard.view_own`
- Manager: `dashboard.view_team`, `dashboard.export_team`, `coaching.submit_rubric_team`, `coaching.publish_team`, `shadowing.manage_team`, `flags.raise_team_case`, `flags.update_team_case`, `users.create_team_agent`, `users.deactivate_team_agent`, `users.terminate_team_agent`
- Admin: `dashboard.view_company`, `dashboard.export_company`, `targets.manage`, `rubrics.manage`

Agents cannot export dashboards. Managers cannot request or perform employee team moves, create managers/admins, assign permission overrides through team-agent creation, or permanently delete users. Every manager mutation rechecks current active-team membership; a historical team snapshot is not sufficient authorization. Administrators directly assign and move agents between teams through the admin team/user-management workflow. The move is transactional, preserves membership history, and writes an audit record.

Operational sales transfers remain a performance metric sourced from the sales data pipeline. They are unrelated to employee team assignment and do not grant employee-movement authority.

Admins receive all defaults. Managers receive team-scoped import/metric grants and leaderboard view. Agents receive own-metric and leaderboard grants.

## Coaching Sessions and Flags

Coaching and flag permissions are role defaults and are not eligible for
per-user overrides. This prevents an individual override from silently
broadening a manager or agent to organization scope. Missing grants deny
access, and every page, data function, and coaching mutation re-reads or
re-validates the authenticated actor.

| Role | Coaching | Coaching creation | Manager coverage leaderboard | Flags |
| --- | --- | --- | --- | --- |
| Admin | Organization | Organization; administrator or active same-organization manager may be credited | Organization | Organization |
| Manager | Assigned active teams; empty when no active teams | Assigned active teams; coach is forced to self | Denied | Assigned active teams; empty when no active teams |
| Agent | Denied | Denied | Denied | Self only |

Administrators use `coaching.view_company`, `coaching.create_company`, and
`flags.view_company`. Managers use `coaching.view_team`,
`coaching.create_team`, and `flags.view_team`. Agents use only
`flags.view_own`. The existing `flags.manage` permission remains a feature-flag
administration capability and does not grant access to operational agent flag
results.

For agent flag requests, profile scope is fixed to the authenticated profile
before browser-controlled filters are considered. Team and manager filters are
discarded, another profile ID is rejected without an existence signal, and
company or team summaries are omitted from the response.

Managers may upload, review, reject, and publish warning-free drafts containing
only their currently assigned teams. Only administrators can override import
warnings, roll back an active import, restore a historical version, or access
company-wide import history. Deactivation, permanent deletion, and historical
activation use separate `imports.deactivate`, `imports.delete`, and
`imports.restore` permissions. Uploading or publishing does not imply any of
these destructive permissions. Every mutation repeats authorization server-side.

User-specific overrides support `allow`, `deny`, or inherited role default. The override mutation rejects every key outside the explicit Team Management and Imports allowlist. User provisioning, password reveal/regeneration, invitation delivery, and permanent deletion remain hard-coded administrator capabilities.

Admin-only permissions include:

- `users.manage_permissions`
- `users.assign_role`
- `integrations.manage`
- `audit.view`
- `audit.view_company`
- `metrics.view_company`
- `metrics.company`
- `coaching.view_company`
- `coaching.create_company`
- `flags.view_company`
- `imports.delete`
- `imports.deactivate`
- `imports.restore`

## Protected routes and actions

`/admin`, `/admin/users`, `/admin/users/*`, `/admin/teams`, `/admin/permissions`, and `/admin/audit` redirect non-admin authenticated users to `/dashboard`. Server actions independently re-read the current session and reject non-admin callers.

Final-admin protections lock active admin rows in transactions and block deactivation, revocation, or demotion of the last active admin.
