# Security

Status after Milestone 1. This document separates **implemented and tested**
controls from **partial**, **planned** and **unverified** ones. It must not be
read as a claim that Hestian is production-ready: no production deployment, email
delivery, MFA or external security review exists.

---

## 1. What is actually enforced

| Control | Status | Evidence |
| --- | --- | --- |
| Password hashing (scrypt via Better Auth) | **implemented, tested** | `tests/identity/authentication.test.ts`; D1 query shows hash, no plaintext |
| Session creation, expiry, revocation | **implemented, tested** | session rows with 8h lifetime; sign-out invalidates immediately (`verify:runtime`) |
| Server-side session resolution | **implemented, tested** | `getSession` reads the verified cookie, never a client id |
| Signed-in-only routes | **implemented, tested** | `/workspace` returns 307 to `/sign-in?next=…`; runtime check |
| Tenant isolation | **implemented, tested (SQLite)** | two-tenant suite: forged ids, cross-tenant membership changes, invitation email mismatch |
| Role/permission authorization | **implemented, tested** | exhaustive matrix in `tests/security/authorization.test.ts` |
| Central permission gate | **implemented** | `authorize(context, permission)` used by every tenancy operation |
| Login abuse protection | **implemented, tested (live)** | DB-backed rate limit: 5 sign-in attempts, then 429 |
| CSRF / cross-origin protection | **implemented, tested** | Better Auth origin validation; foreign origin rejected; same-origin helper for custom routes |
| Security headers | **implemented, tested** | CSP with nonce, no `unsafe-inline` scripts, `frame-ancestors 'none'`, nosniff, HSTS over HTTPS |
| Request size limit | **implemented, tested** | 256 KiB middleware cap (413), 64 KiB JSON parser cap |
| Secret redaction in logs | **implemented, tested** | redaction at depth, bounded payloads |
| Secrets kept out of the client | **implemented, tested** | config rejects `NEXT_PUBLIC_*` secret names; no secret in any `"use client"` module |
| Audit trail | **implemented, tested** | hash chain verified; UPDATE/DELETE rejected by triggers |
| Invitation tokens hashed at rest | **implemented, tested** | SHA-256 of 256-bit token, single-use, 7-day expiry |
| Password reset | **partial** | tokens issued and consumed; email delivery unconfigured |
| Email verification | **partial** | tokens issued on sign-up; no provider, accounts stay unverified |
| MFA | **not implemented** | provider supports it; no schema or UI enabled |
| Production secrets/rotation | **planned** | local `.dev.vars` only; no remote secret set |
| Backup/restore rehearsal | **unverified** | no remote database exists |
| Penetration test / external review | **none** | not performed |

## 2. Principles

1. Deny by default: missing identity, membership, permission or state means refusal.
2. The server decides: no client-supplied tenant, role, user id or amount is trusted.
3. Least data: responses carry only what the view needs; lists do not expose emails
   to roles without `business.manage_members`.
4. Secrets stay server-side: bindings only, never in bundles, URLs, logs or errors.
5. Evidence before consequence: consequential actions are audited and, where
   privileged, require recent authentication.
6. Fail closed: configuration errors throw; ambiguous tenant resolution returns
   `NOT_FOUND`.
7. No invented cryptography: standard scrypt password hashing, standard session
   cookies, SHA-256 for integrity, Web Crypto for entropy.

## 3. Authentication

**Provider:** Better Auth 1.7.22, configured in
`src/modules/identity/auth-options.ts` and wired to Cloudflare bindings in
`src/modules/identity/auth.ts`.

- **Registration:** email + password, name. Password minimum 12 characters.
- **Hashing:** scrypt with per-password salt, stored in `identity_account.password`.
  Plaintext is never stored, logged or returned.
- **Sign-in:** generic failure message for unknown accounts and wrong passwords;
  account enumeration is not possible from the response.
- **Sessions:** opaque tokens, hashed by the provider, stored in `identity_session`;
  8-hour lifetime; refreshed (`updateAge`) every 15 minutes; cookie cache disabled
  so revocation is immediate.
- **Cookies:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when
  `HESTIAN_ENV=production`.
- **Revocation:** sign-out removes the session; "sign out everywhere" revokes all
  sessions for the user.
- **Password reset:** Better Auth issues a single-use token; the reset endpoint
  validates it and revokes sessions on success.
- **Rate limiting:** database storage (`identity_rate_limit`), 5 sign-in attempts
  per minute per key, 5 sign-ups per 5 minutes, 3 reset requests per 5 minutes.
- **Recent authentication:** privileged tenancy operations require a session
  created within the last hour (`isRecentlyAuthenticated`).

**Partial:** no email is sent. `createMailer` returns "unconfigured" unless
`RESEND_API_KEY` and `EMAIL_FROM` are bound, and the application records that
outcome instead of pretending delivery. Because verification cannot be completed,
`requireEmailVerification` is `false`; this must be revisited before production.

**Not implemented:** MFA/TOTP, passkeys, OAuth providers, device management,
password-breach checks.

## 4. Authorization and tenancy

- A user may belong to many businesses; a business has many members.
- Roles: `owner`, `accountant`, `employee`, `contractor`, `agency`.
- `hasPermission` is a pure, exhaustive matrix; roles are ceilings and unknown
  roles grant nothing.
- `resolveTenantContext(userId, candidateBusinessId)` derives membership from the
  database. The candidate id is never proof of ownership.
- Failure to resolve returns `NOT_FOUND`, not `FORBIDDEN`, to avoid confirming that
  another tenant's business exists.
- Invitations bind to an email address; acceptance requires the signed-in user's
  email to match, otherwise `NOT_FOUND`.
- A business must retain at least one active owner; demoting or removing the last
  owner is rejected with `INVARIANT_VIOLATION`.
- Resource-level scoping: membership mutations include `business_id` in the WHERE
  clause, so a guessed membership id in another tenant matches nothing.
- Privileged operations also require recent authentication and are rate limited.

**Not yet:** per-resource grants that narrow a role, approval policies, separation
of duties for payments (no payments exist), and background-job authorization
(there are no background jobs).

## 5. CSRF and request integrity

- Better Auth validates the request origin for its endpoints; a foreign origin is
  rejected (verified live).
- Hestian's own helper `isSameOrigin` fails closed when `Origin` is missing and is
  used by custom route handlers.
- Server Actions rely on Next.js's built-in same-origin enforcement in addition to
  session cookies being `SameSite=Lax`.
- All JSON bodies are content-type checked, size limited and schema validated.
- There is no double-submit CSRF token. This is acceptable only while all
  mutations require same-origin requests and `SameSite` cookies; a token should be
  added before any cross-site embedding or form POST integration.

## 6. Security headers

`src/core/security-headers.ts`, applied by `src/middleware.ts`:

- CSP: `default-src 'self'`; scripts require a per-request nonce with
  `strict-dynamic`; no `unsafe-inline` for scripts; `object-src 'none'`;
  `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Permissions-Policy` disabling camera/microphone/geolocation/payment/usb,
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.
- HSTS only when the request arrived over HTTPS.

Verified: the rendered HTML carries the request nonce, and the header is present on
HTML and API responses. `style-src` still permits `unsafe-inline` because React
emits inline style attributes; scripts are the sensitive surface.

## 7. Secrets

- Local: `.dev.vars` (git-ignored) with a random 32+ character
  `BETTER_AUTH_SECRET`; `.dev.vars.example` documents names only.
- Production: platform secret bindings (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `BETTER_AUTH_URL`). Nothing is committed.
- `getAuth()` fails closed when the secret is shorter than 32 characters or the
  base URL is missing/invalid.
- Logs redact keys matching secret/token/password/authorization patterns; audit
  metadata is redacted before hashing.
- No key rotation, envelope encryption or KMS integration exists yet: integration
  credentials are not stored in this milestone.

## 8. Audit

- Append-only `audit_event` table with `prev_hash` and `hash` (SHA-256 over
  canonical content plus the previous hash).
- `prev_hash` is unique, which serialises concurrent appends: a racing writer
  loses the constraint and retries against the new head.
- Database triggers reject UPDATE and DELETE.
- Recorded actions include sign-up, sign-in success/failure, sign-out, session
  revocation, password reset request/completion, business creation, invitation
  creation/acceptance, role changes and member removal.
- Audit metadata is redacted before hashing; no emails, tokens or passwords.
- Direct calls to `/api/auth/*` are audited by the route handler; server actions
  audit their own operations. Actor attribution for HTTP-level auth events is not
  available (the response does not carry the user id).

**Limitations:** the chain is tamper-evident, not externally anchored (no
notarisation or off-platform copy). Audit and the audited change are not written in
one D1 transaction, so a crash between them can leave a change without its event;
this is documented rather than hidden. Retention is undecided.

## 9. Known gaps and vulnerabilities

1. **Email verification cannot complete** without a provider; accounts are
   unverified. A production launch must either configure delivery and enable
   verification, or explicitly accept unverified accounts.
2. **No MFA**, despite privileged financial roles being planned.
3. **No production deployment**, so TLS, HSTS at the edge, secret binding,
   remote D1 isolation, and rebuild-from-scratch have not been exercised.
4. **No penetration test**, threat-model review with an external party, or
   dependency review beyond `npm audit`.
5. **Rate limiting is per key** with a fixed window; distributed abuse across keys
   is only partly mitigated. No CAPTCHA or bot detection.
6. **Session expiry is not covered by an automated test**; it relies on Better
   Auth's enforcement and the stored `expiresAt`.
7. **No CSRF token**, no CSP violation reporting, no WAF rules.
8. **No audit retention/export or key rotation procedure.**
9. **No malware scanning** for uploads because uploads do not exist yet; the
   architecture for R2 documents must include scanning before launch.
10. **SSRF surface is currently zero** (no user-supplied URLs are fetched); this
    must be revisited with integrations.

## 10. Review checklist

- [ ] Identity and tenant derived server-side.
- [ ] Every new table has `business_id` when tenant-scoped.
- [ ] Every protected route checks session, membership, permission and resource scope.
- [ ] New inputs validated with Zod; bodies size limited.
- [ ] No secret, token or raw provider payload logged, returned or put in a URL.
- [ ] Consequential actions audited with redacted metadata.
- [ ] Cross-tenant cases return `NOT_FOUND`.
- [ ] Two-tenant tests and the permission matrix updated.
- [ ] No analytical module gained an import edge into financial authority.
- [ ] Security headers unchanged or deliberately amended.
