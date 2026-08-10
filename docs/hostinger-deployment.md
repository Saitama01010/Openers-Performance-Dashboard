# Hostinger Deployment

Production deployment is blocked until permission, authentication, import, and migration checks pass and a production email provider is configured.

1. Create a Hostinger MySQL 8 database and a least-privilege application user.
2. Configure required secrets: `DATABASE_URL`, `DATABASE_ENVIRONMENT=production`, `DEPLOYMENT_ENVIRONMENT=production`, a random 32+ character `SESSION_SECRET`, separate base64-encoded 32-byte `TEMP_PASSWORD_ENCRYPTION_KEY` and `OUTBOX_ENCRYPTION_KEY`, canonical public HTTPS `APP_URL`, `TRUSTED_PROXY_HEADERS`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `INVITATION_TTL_HOURS`, `PASSWORD_RESET_TTL_MINUTES`, `GOOGLE_TRANSFERS_APPS_SCRIPT_URL`, `LEADERBOARD_API_SECRET`, `GOOGLE_SHEETS_TIMEZONE`, and `NODE_ENV=production`. Configure the pool, worker, session, retention, version, and optional database TLS variables from `.env.example`.
3. Configure exactly one production email provider. Do not use `EMAIL_PROVIDER=console` in production.
4. Build with `npm ci && npm run build`.
5. Run `npm run db:migrate` and `npm run db:bootstrap` once during release. `db:seed` is technically blocked in production/preview and must never be used there.
6. Create or verify the first active admin.
7. Start the Node.js Web App with `npm run start`.
8. Confirm the target Hostinger plan's process model before cutover. Hostinger's
   managed Node.js Web App documentation confirms the web process, but does not
   confirm three independently supervised persistent Node processes. On a VPS,
   supervise `npm run start`, `npm run worker:imports`, and
   `npm run worker:email` independently with systemd or PM2. On a managed
   shared/cloud plan, first verify in hPanel or with Hostinger support that a
   custom cron command can run Node/npm in the deployed working directory, with
   the production environment and overlap prevention; only then schedule
   `npm run worker:imports -- --once` and
   `npm run worker:email -- --once` every minute. This confirmation is a release
   prerequisite, not an application assumption.
9. Schedule `npm run cleanup:retention -- --execute` daily only after reviewing a production dry run.
10. Configure liveness monitoring at `/health/live`, readiness/uptime monitoring at `/health/ready`, and confirm `/health/version` matches the deployed commit.
11. Confirm `/login`, `/dashboard`, `/admin/users`, `/admin/teams`, and invitation/reset links use the production `APP_URL`.

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
The complete process, recovery, retention, performance, and release procedure is
maintained in `production-readiness.md`; the operator checklist and exact
rollback steps are in `production-release-runbook.md`.

Hostinger references used for the process decision:

- <https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/>
- <https://www.hostinger.com/support/1583713-can-background-processes-be-executed-via-ssh-in-hostinger/>
- <https://support.hostinger.com/en/articles/1583465-how-to-set-up-a-cron-job-at-hostinger>

If a Resend API key is exposed:

1. Create a replacement key in Resend.
2. Update the Hostinger secret.
3. Restart the app so startup validation uses the new key.
4. Revoke the old key in Resend.
