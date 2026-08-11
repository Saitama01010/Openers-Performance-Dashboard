<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

- Openers Performance Dashboard is a self-hosted dashboard for secure dialer imports and role-scoped opener performance reporting.
- The stack is Next.js App Router, TypeScript, Tailwind CSS, MySQL 8, and Drizzle ORM.
- The deployment target is a Hostinger Node.js Web App. Do not introduce dependencies on Vercel infrastructure.

## Security and data scope

- Enforce authentication and authorization server-side at every data boundary and for every mutation. Client-side checks and route visibility are not authorization controls.
- Admins have company-wide data and import scope.
- Managers are limited to their active assigned teams. A manager with no active team, or an assigned team with no profiles, must receive an empty scope; never remove or broaden the database filter as a fallback.
- Agents may access only their own data and have no import scope.
- Deactivated or revoked profiles must not retain access through existing sessions.

## Import invariants

- Keep dialer import batches permanent, validation staged, versions immutable, and publication atomic.
- Uploading or publishing must not imply permission to roll back, restore, deactivate, or delete an import. Check each capability independently and repeat authorization server-side for every mutation.
- Managers may handle warning-free drafts only for their currently assigned teams.
- Only administrators may override warnings, activate historical versions, roll back or restore versions, deactivate imports, permanently delete imports, or access company-wide import history.
- Preserve transactionally resolved active-version behavior during rollback, restoration, deactivation, and deletion. Never leave an invalid or ambiguous active version.

## Verification

- Add regression tests for every bug fix and behavior change.
- Run the checks relevant to the change. Before handing off a complete application change, run the full verification sequence:

```bash
npm run lint
npm run db:generate
git diff --exit-code -- drizzle
npm run db:migrate
npm run db:seed
npm run db:health
NODE_ENV=test npm run db:migrate:test
npm run test
npm run build
```

- Database verification requires configured `DATABASE_URL` and `TEST_DATABASE_URL` values and an isolated test database. Never point test or destructive commands at production.

## Working rules

- Work on a branch; do not make task changes directly on the default branch.
- Do not merge, deploy, modify production configuration, or perform destructive production operations without the user's explicit approval.
- Avoid unrelated refactors, cleanup, formatting churn, and dependency upgrades.
- Inspect only files relevant to the current task to reduce usage. Before changing Next.js code, also inspect the relevant guide under `node_modules/next/dist/docs/` as required above.
