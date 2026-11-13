# identity

**Pillar** Platform · **Layer** platform · **Status** implemented and tested
(email delivery partial)

Proves who is acting. Identity answers one question: is this a verified subject, and
what is the server-issued proof of that?

## Owns

- Users, accounts (password hashes), sessions, verification tokens and auth rate
  limits, through the Better Auth schema in `migrations/0001_identity_authentication.sql`.
- Session lifecycle, expiry and revocation.
- The mailer port used for verification and reset messages.

## Does not own

- Roles, permissions or business membership (see `tenancy`).
- Any business or financial data.

## May depend on

`audit` (for consequential auth events) and `~core`. Not `tenancy`.

## Public surface

| Export | Purpose |
| --- | --- |
| `createAuth(bindings)` / `getAuth()` | Better Auth instance bound to D1 and secrets. |
| `getSessionFromHeaders(headers)` | Server-side subject resolution; `null` when absent, expired or revoked. |
| `revokeAllSessions(userId)` | Sign out everywhere. |
| `isRecentlyAuthenticated(session)` | Step-up gate for privileged operations. |
| `createMailer(bindings)` | Returns a mailer that reports `unconfigured` when no provider is bound. |
| `auth` route handler | `/api/auth/*`, auditing a fixed list of consequential paths. |

## Invariants

- A subject is never inferred from a client-supplied header or identifier.
- Passwords are stored only as scrypt hashes; plaintext never touches storage or logs.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production; no token is
  ever placed in `localStorage`.
- Missing, expired or revoked identity fails closed with `UNAUTHENTICATED`.
- Rate limits are enforced with database counters, not memory.

## Limitations

- Email verification and password-reset messages are not delivered: no provider is
  configured, so accounts remain unverified. The mailer returns `delivered: false`
  rather than pretending success.
- MFA is not implemented.
- Session expiry relies on the provider's check of `expiresAt`; it is configured but
  not covered by an automated test.

## Status

Milestone 1: implemented, tested in SQLite and verified in workerd (sign-up, session,
sign-out, cookie flags, rate limiting, foreign-origin rejection).
