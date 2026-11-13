# 0009 — Authentication, sessions and credential handling

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Hestian needs real registration, login, logout, session expiry and revocation on a
Worker runtime with D1. Custom password hashing or token protocols were excluded:
both are easy to get subtly wrong and hard to audit. Email delivery is not
configured, so any design must represent that gap honestly.

## Decision

1. **Use Better Auth 1.7.22** with its built-in D1/Kysely dialect (`database: env.DB`).
   No custom password storage, no hand-rolled session tokens.
2. **Password hashing:** the provider's scrypt implementation with per-password
   salt. Minimum length 12 characters. Plaintext is never stored, logged or
   returned; the D1 row contains the provider's encoded hash only.
3. **Sessions:** opaque tokens in `identity_session`, 8-hour lifetime, refresh
   every 15 minutes (`updateAge`), cookie cache disabled so revocation is immediate.
   Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
4. **Registration, login, logout, password reset** are handled by the provider's
   endpoints under `/api/auth/*`, wrapped by a Hestian route handler that audits a
   fixed list of consequential paths.
5. **Rate limiting:** database-backed (`identity_rate_limit`), applied by the
   provider: 5 sign-ins/minute, 5 sign-ups/5 minutes, 3 reset requests/5 minutes.
   Hestian's own helpers add fixed-window limits for custom operations.
6. **Password reset:** the provider issues a single-use, expiring token and revokes
   sessions after a successful reset. No enumeration: the response is identical for
   unknown addresses.
7. **Email verification:** tokens are generated on sign-up, but delivery requires
   `RESEND_API_KEY` and `EMAIL_FROM`. Until they exist the mailer reports
   `delivered: false`, the outcome is logged (without the address) and accounts
   remain unverified. `requireEmailVerification` is therefore `false`, and this must
   be revisited before production.
8. **MFA is not implemented.** The provider supports TOTP and passkeys; Hestian
   enables neither, has no enrolment UI and makes no MFA claim.
9. **Recent authentication** is derived from session `createdAt` (within one hour)
   and required by privileged tenancy operations, so a stolen long-lived session
   cannot silently change roles.
10. **Server-side session resolution only.** `getSession` reads the signed cookie
    and the database; no user or tenant id is ever accepted from the client.

## Evidence

- `tests/identity/authentication.test.ts` proves hash-not-plaintext, correct-password
  acceptance, wrong-password rejection, session retrieval and sign-out revocation.
- `npm run verify:runtime` proves the flow in workerd, including cookie flags,
  rejection of a foreign origin, 429 after five failed sign-ins, and immediate
  invalidation after sign-out.
- Direct D1 query: `password` is a 161-character encoded hash and no column contains
  the submitted password.

## Consequences

**Easier:** standard, auditable authentication; sessions revocable server-side; one
schema for identity; the same code path in tests and workerd.

**Harder:** verification and reset UX depend on an email provider; provider upgrades
must be tested against the generated schema; session semantics are the provider's,
so changes require reading its release notes.

**Forbidden:** storing tokens in `localStorage`; inventing a token format; claiming
email verification or MFA before it works; disabling rate limits for convenience.

## Alternatives considered

- **Auth.js/NextAuth.** Credentials provider encourages custom password handling and
  its session model is less direct on D1.
- **Hosted identity provider.** Fewer responsibilities, but adds an external
  dependency and cost before the product exists; revisit if MFA/SSO become
  requirements.
- **Custom auth.** Rejected outright: custom cryptography and session protocols are
  a liability.

## Follow-ups

1. Choose an email provider, configure a sender domain and turn on verification.
2. Implement MFA enrolment and step-up authentication for financial approvals.
3. Add automated session-expiry and reset-flow tests.
4. Define account deletion and email-change flows (see DATA_GOVERNANCE).
