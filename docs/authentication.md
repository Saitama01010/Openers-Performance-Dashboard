# Authentication

Sessions use a cryptographically random bearer token in an HTTP-only, SameSite=Lax cookie. Only its SHA-256 hash is stored. Cookies are Secure in production. Sessions expire after seven days and may be revoked independently or in bulk.

Invitations and password resets use random 256-bit tokens. Only token hashes are stored; tokens expire, are single-use, and can be revoked. Resending revokes prior unused tokens. Password reset revokes all existing sessions. Forgot-password requests always show the same response and are rate-limited by hashed email and network address identifiers.

Local development uses the console email provider. It prints test links only outside production. Production must configure a non-console provider before launch; the provider implementation is intentionally pending provider selection.
