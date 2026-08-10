# Authentication

Sessions use a cryptographically random bearer token in an HTTP-only, SameSite=Lax cookie. Only its SHA-256 hash is stored. Cookies are Secure in production. Sessions expire after seven days and may be revoked independently or in bulk.

Invitations and password resets use random 256-bit tokens. Only token hashes are stored; tokens expire, are single-use, and can be revoked. Consumption locks the token row transactionally, so replay and concurrent double consumption fail. Resending revokes prior unused tokens. Password reset revokes all existing sessions. Forgot-password requests always show the same response and are rate-limited by hashed email and trusted-client identifiers.

Login uses durable MySQL-backed limits (5 attempts per normalized account per 15 minutes, 20 per hour, and 30 per trusted client per 15 minutes). Invitation and reset consumption allow 8 attempts per token and 30 per trusted client per 15 minutes. Unknown accounts still execute bcrypt against a constant dummy hash, errors are generic, and passwords longer than 256 characters are rejected before bcrypt.

Local development may use the console email provider. It logs delivery metadata
but never token-bearing message bodies. Production must configure Resend before
launch, and startup fails clearly when required Resend settings are missing.

## Admin-managed accounts

Admins create every dashboard account from `/admin/users`. New accounts are active immediately with a generated temporary password. The authentication copy remains a bcrypt hash; the separately retrievable temporary value is protected with AES-256-GCM and is available exactly once through an audited, rate-limited, admin-only, no-store endpoint. A successful reveal erases the ciphertext while retaining the bcrypt hash. Temporary accounts must set a permanent password on first login. Regeneration requires an administrator reason, invalidates the former credential, revokes sessions, restores one-time reveal state, and is audited without plaintext. Prefer an invitation when the employee has working email. Accepting an invitation or completing password reset replaces the authentication hash, clears temporary state, records `password_changed_at`, revokes outstanding links, and revokes existing sessions.

`TEMP_PASSWORD_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Generate it outside source control with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Production startup fails when the key is absent or malformed. Rotate it only with a planned re-encryption process; changing it makes existing temporary passwords unrecoverable.

Account statuses:

- `invited`: account exists, but password setup is incomplete.
- `active`: login and unrevoked sessions may work.
- `deactivated`: login is blocked and sessions are revoked; history is preserved.
- `revoked`: login is blocked, sessions are revoked, outstanding invitations and reset tokens are revoked, and history is preserved.
- Permanently deleted users are removed from authentication and owned operational tables, while security audit events retain organization and actor display-name snapshots.

The session lookup checks session revocation, expiration, `profiles.active`, and `profiles.account_status` on authenticated requests. Cookie expiration alone is not trusted.

## Email providers

Shared variables:

- `APP_URL`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_REPLY_TO` (optional)
- `INVITATION_TTL_HOURS`
- `PASSWORD_RESET_TTL_MINUTES`

`EMAIL_PROVIDER=console` is development only and logs redacted delivery metadata.
It never prints invitation/reset links and throws in production. Use a controlled
Resend test recipient or automated token lifecycle tests for complete local flows.

`EMAIL_PROVIDER=resend` requires:

- `RESEND_API_KEY`

The verified Resend domain is `updates.dialexpert.com`. The production sender is `DialExpert <no-reply@updates.dialexpert.com>`.

Invitation delivery failure does not roll back account creation. Delivery attempts are recorded in `email_delivery_attempts` with provider, message type, recipient, safe failure reason, provider message ID, and acceptance timestamp when known. Failed invitations can be resent by an admin.

Forgot-password requests avoid duplicate sends while an active reset token already exists. Admin resends remain explicit actions that create a new controlled invitation or reset attempt.

## Password recovery

Normal forgot-password requests remain generic and rate-limited. Admin force reset revokes outstanding reset tokens, creates a new single-use reset token, optionally revokes sessions immediately, marks `must_reset_password`, sends a reset email, and writes an audit log.

Resend API keys must remain server-only. Never expose `RESEND_API_KEY` through `NEXT_PUBLIC_*`, browser responses, or logs. If a key is exposed, rotate it immediately in Resend and update the Hostinger secret before restarting the app.
