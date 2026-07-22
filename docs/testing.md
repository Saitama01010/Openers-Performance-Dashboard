# Testing

Local verification:

```bash
npm run lint
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:health
```

CI runs the same commands against an isolated MySQL 8.4 service and fails if `db:generate` changes version-controlled migrations.

Current unit coverage includes CSV header normalization, duplicate and corrected rows, aggregate reconciliation, duration formatting, mapping/scope outcomes, authentication security policy, token lifecycle policy, and fail-closed authorization. Database-backed end-to-end tests for invitation/reset consumption and admin account management remain required before production.
