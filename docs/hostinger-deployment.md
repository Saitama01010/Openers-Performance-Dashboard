# Hostinger Deployment

Production deployment is blocked until all permission, authentication, duplicate-import, and migration checks pass and a production email provider is configured.

1. Create a Hostinger MySQL 8 database and a least-privilege application user.
2. Configure `DATABASE_URL`, a random 32+ character `SESSION_SECRET`, public HTTPS `APP_URL`, email provider settings, Google credentials when available, and `NODE_ENV=production` in Hostinger secrets.
3. Build with `npm ci && npm run build`.
4. Run `npm run db:migrate` once during release. Do not run development seed data in production.
5. Start the Node.js Web App with `npm run start`.
6. Configure reconciliation and cleanup cron jobs after those workers are implemented.

Back up MySQL before every migration and retain point-in-time or daily backups. Rollback means restoring the application release and, for non-backward-compatible schema changes, restoring the verified pre-release database backup. Never improvise a down migration against live data.

GitHub deployment should require CI success. Google service credentials and email API keys belong only in Hostinger secrets. Verify cookies are Secure over HTTPS and test invitation, reset, session revocation, manager scope, import confirmation, and backup restoration in staging before production cutover.
