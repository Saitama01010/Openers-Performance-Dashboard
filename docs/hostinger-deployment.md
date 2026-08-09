# Hostinger Deployment

Production deployment is blocked until permission, authentication, import, and migration checks pass and a production email provider is configured.

1. Create a Hostinger MySQL 8 database and a least-privilege application user.
2. Configure required secrets: `DATABASE_URL`, `DATABASE_ENVIRONMENT=production`, `DEPLOYMENT_ENVIRONMENT=production`, a random 32+ character `SESSION_SECRET`, a base64-encoded 32-byte `TEMP_PASSWORD_ENCRYPTION_KEY`, canonical public HTTPS `APP_URL`, `TRUSTED_PROXY_HEADERS`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `INVITATION_TTL_HOURS`, `PASSWORD_RESET_TTL_MINUTES`, `GOOGLE_TRANSFERS_APPS_SCRIPT_URL`, `LEADERBOARD_API_SECRET`, `GOOGLE_SHEETS_TIMEZONE`, and `NODE_ENV=production`.
3. Configure exactly one production email provider. Do not use `EMAIL_PROVIDER=console` in production.
4. Build with `npm ci && npm run build`.
5. Run `npm run db:migrate` and `npm run db:bootstrap` once during release. `db:seed` is technically blocked in production/preview and must never be used there.
6. Create or verify the first active admin.
7. Start the Node.js Web App with `npm run start`.
8. Confirm `/login`, `/dashboard`, `/admin/users`, `/admin/teams`, and invitation/reset links use the production `APP_URL`.

Resend production settings:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `EMAIL_FROM_NAME=DialExpert`
- `EMAIL_FROM_ADDRESS=no-reply@updates.dialexpert.com`
- `EMAIL_REPLY_TO` (optional)

Before the first production send, verify the Resend domain `updates.dialexpert.com` and confirm the sender appears as `DialExpert <no-reply@updates.dialexpert.com>`.

Back up MySQL before every migration and retain point-in-time or daily backups. Rollback means restoring the application release and, for non-backward-compatible schema changes, restoring the verified pre-release database backup.

Recovering from admin lockout should be done with a one-time database maintenance script that creates or reactivates a known admin, then immediately forces password reset. Do not disable final-admin protections in source code.

GitHub deployment should require CI success. The Google Apps Script URL,
LeaderBoard shared secret, and email API keys belong only in Hostinger secrets.
Verify cookies are Secure over HTTPS and test invitation, reset, session
revocation, manager scope, automatic LeaderBoard transfer loading, import
confirmation, nested Closed parsing, manual/automatic LeaderBoard refresh,
stale-source behavior, and backup restoration in staging before production
cutover.

The canonical single-tenant, trusted-proxy, security-header, release, and smoke
test requirements are maintained in `production-hardening.md`.

If a Resend API key is exposed:

1. Create a replacement key in Resend.
2. Update the Hostinger secret.
3. Restart the app so startup validation uses the new key.
4. Revoke the old key in Resend.
