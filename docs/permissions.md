# Permissions

Authorization fails closed and is enforced server-side.

| Role | Private scope | Import scope |
| --- | --- | --- |
| Admin | Company | Company |
| Manager | Active assigned teams | Active assigned teams |
| Agent | Self | None |

Role grants are stored in `role_permissions`. Explicit per-user allow or deny rows may override only Team Management (`teams.*`) and Imports (`imports.*`) permissions. A missing grant is a denial. User, Metrics, and Other permissions always use role defaults; the provisioning migration removes legacy overrides in those namespaces and runtime evaluation ignores them defensively.

A manager with no active team receives an empty profile scope. An assigned team with no profiles also produces an empty scope; neither condition removes the database filter. Deactivated and revoked profiles cannot use existing sessions. Route visibility is not an authorization control.

## Permission catalog

The Phase 2 catalog is seeded from `src/admin/policy.ts`:

- User management: `users.view`, `users.create`, `users.update`, `users.activate`, `users.deactivate`, `users.revoke`, `users.assign_role`, `users.assign_team`, `users.manage_permissions`, `users.revoke_sessions`
- Team management: `teams.view`, `teams.create`, `teams.update`, `teams.deactivate`, `teams.assign_manager`, `teams.assign_agents`
- Imports: `imports.preview`, `imports.confirm`, `imports.view_history`, `imports.view_errors`, plus compatibility grants `imports.company` and `imports.team`
- Metrics: `metrics.view_own`, `metrics.view_team`, `metrics.view_company`, plus compatibility grants `metrics.self`, `metrics.team`, and `metrics.company`
- Other: `leaderboard.view`, `leaderboards.view`, `audit.view`, `audit.view_company`, `integrations.manage`, `commissions.manage`, `flags.manage`

Admins receive all defaults. Managers receive team-scoped import/metric grants and leaderboard view. Agents receive own-metric and leaderboard grants.

User-specific overrides support `allow`, `deny`, or inherited role default. The override mutation rejects every key outside the explicit Team Management and Imports allowlist. User provisioning, password reveal/regeneration, invitation delivery, and permanent deletion remain hard-coded administrator capabilities.

Admin-only permissions include:

- `users.manage_permissions`
- `users.assign_role`
- `integrations.manage`
- `audit.view`
- `audit.view_company`
- `metrics.view_company`
- `metrics.company`

## Protected routes and actions

`/admin`, `/admin/users`, `/admin/users/*`, `/admin/teams`, `/admin/permissions`, and `/admin/audit` redirect non-admin authenticated users to `/dashboard`. Server actions independently re-read the current session and reject non-admin callers.

Final-admin protections lock active admin rows in transactions and block deactivation, revocation, or demotion of the last active admin.
