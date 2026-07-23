# Authentication

Sessions use a cryptographically random bearer token in an HTTP-only, SameSite=Lax cookie. Only its SHA-256 hash is stored. Cookies are Secure in production. Sessions expire after seven days and may be revoked independently or in bulk.

Invitations and password resets use random 256-bit tokens. Only token hashes are stored; tokens expire, are single-use, and can be revoked. Resending revokes prior unused tokens. Password reset revokes all existing sessions. Forgot-password requests always show the same response and are rate-limited by hashed email and network address identifiers.

Local development uses the console email provider. It prints test links only outside production. Production must configure Resend before launch, and startup now fails clearly when required Resend settings are missing.

## Admin-managed accounts

Admins create every dashboard account from `/admin/users`. New users start with `account_status='invited'` and no password hash. The admin may send or resend an invitation, but never supplies the user's final password. Accepting a valid invitation writes the password hash, marks the invitation accepted, sets `password_changed_at`, and activates the account.

Account statuses:

- `invited`: account exists, but password setup is incomplete.
- `active`: login and unrevoked sessions may work.
- `deactivated`: login is blocked and sessions are revoked; history is preserved.
- `revoked`: login is blocked, sessions are revoked, outstanding invitations and reset tokens are revoked, and history is preserved.

The session lookup checks session revocation, expiration, `profiles.active`, and `profiles.account_status` on authenticated requests. Cookie expiration alone is not trusted.

## Email providers

Shared variables:

- `APP_URL`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_REPLY_TO` (optional)
- `INVITATION_TTL_HOURS`
- `PASSWORD_RESET_TTL_MINUTES`

`EMAIL_PROVIDER=console` is development only and prints invitation/reset links to the server terminal. It throws in production.

`EMAIL_PROVIDER=resend` requires:

- `RESEND_API_KEY`

The verified Resend domain is `updates.dialexpert.com`. The production sender is `DialExpert <no-reply@updates.dialexpert.com>`.

Invitation delivery failure does not roll back account creation. Delivery attempts are recorded in `email_delivery_attempts` with provider, message type, recipient, safe failure reason, provider message ID, and acceptance timestamp when known. Failed invitations can be resent by an admin.

Forgot-password requests avoid duplicate sends while an active reset token already exists. Admin resends remain explicit actions that create a new controlled invitation or reset attempt.

## Password recovery

Normal forgot-password requests remain generic and rate-limited. Admin force reset revokes outstanding reset tokens, creates a new single-use reset token, optionally revokes sessions immediately, marks `must_reset_password`, sends a reset email, and writes an audit log.

Resend API keys must remain server-only. Never expose `RESEND_API_KEY` through `NEXT_PUBLIC_*`, browser responses, or logs. If a key is exposed, rotate it immediately in Resend and update the Hostinger secret before restarting the app.
