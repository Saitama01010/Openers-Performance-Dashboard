# Permissions

Authorization fails closed and is enforced server-side.

| Role | Private scope | Import scope |
| --- | --- | --- |
| Admin | Company | Company |
| Manager | Active assigned teams | Active assigned teams |
| Agent | Self | None |

Role grants are stored in `role_permissions`; explicit per-user allow or deny rows in `user_permission_overrides` take precedence. A missing grant is a denial.

A manager with no active team receives an empty profile scope. An assigned team with no profiles also produces an empty scope; neither condition removes the database filter. Deactivated and revoked profiles cannot use existing sessions. Route visibility is not an authorization control.
