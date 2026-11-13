# Security

Status after Milestone 1.5. This document separates **implemented and tested**
controls from **partial**, **planned**, **blocked** and **unverified** ones. It must
not be read as a claim that Hestian is production-ready: there is no production
deployment, no email provider account, and no external security review.

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
| Password reset | **implemented, tested; delivery BLOCKED** | single-use token, replay rejected, sessions revoked on reset; no provider credentials |
| Email verification | **implemented, tested; delivery BLOCKED** | signed expiring token, fail-closed enforcement flag; no provider credentials |
| MFA (TOTP + recovery codes) | **implemented, tested** | `tests/identity/mfa.test.ts`; live enrolment and challenge in workerd |
| MFA disablement | **implemented, tested** | password + recent session; other sessions revoked |
| Data export | **implemented, tested** | owner-scoped D1 payload, 1-hour expiry, authenticated download |
| Account deletion | **partial (identity only)** | atomic identity deletion; ownership transfer/closure not implemented |
| Audit atomicity | **implemented for new flows; partial overall** | `commitWithAudit` batch; legacy tenancy actions still two writes |
| Dependency advisories | **resolved by tested overrides** | `npm audit` reports 0; `glob@14.0.3`, `minimatch@11.0.3`
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

**Not implemented:** passkeys, OAuth providers, trusted-device cookies,
password-breach checks, administrative MFA reset.

**MFA:** TOTP with ten encrypted single-use recovery codes, enforced at sign-in (a
password alone yields a challenge, never a session). Enrolment is two-step and
requires the password; disabling requires the password plus a recent session and
revokes other sessions. Secrets and recovery codes are encrypted with the auth
secret, not hashed — see ADR 0013 for why, and for the residual risk. Account lockout
(10 failures/15 minutes) and an IP rate limit cover brute force. No tenant policy
requires MFA yet.

**Email:** delivery is a single port with a Resend HTTP adapter. Production requires
verification unless `EMAIL_VERIFICATION_REQUIRED=false`; without provider credentials
the mailer reports `unconfigured` and new accounts cannot complete sign-in. That is
fail-closed, not a working mail flow. Resend requests are throttled per address and
return a uniform response, so the endpoint cannot enumerate accounts. See ADR 0012.

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

**Atomicity:** new consequential writes use `commitWithAudit`, which sends the
mutation and the audit insert in one D1 `batch()` transaction and retries only on a
chain-head race. Tests prove a failing mutation leaves neither row. Tenancy server
actions written in Milestone 1 still append their audit event separately; they are
**PARTIAL** until retrofitted. `batch()` cannot be aborted from JavaScript, so a
zero-row conditional update is not an error — the financial core must enforce state
with constraints/triggers (see [FINANCIAL_READINESS.md](FINANCIAL_READINESS.md)).

**Limitations:** the chain is tamper-evident, not externally anchored (no
notarisation or off-platform copy). Database-owner access could rebuild it. Retention
is undecided. A tenant-scoped audit export (`/api/audit/export`) exposes the chain
fields to roles with `audit.read`, and reports whether the chain currently verifies.

**Privacy workflows:** exports are stored in D1 for one hour and served only to the
owning session; there is no public object link. Deletion removes credentials,
sessions, second factors, memberships and pending invitations and anonymises the
profile in one batch, but blocks a sole owner. Business records and audit events are
retained; no statutory retention period is asserted (ADR 0014).

## 9. Known gaps and vulnerabilities

1. **Email delivery is blocked** on provider credentials and a verified sender
   domain. Verification/reset code paths and enforcement are tested, but no real
   message has been sent, and SPF/DKIM/DMARC are unconfigured. Production without
   those secrets fails closed (new accounts cannot sign in).
2. **Deletion is identity deletion only.** Ownership transfer, business closure,
   integration-credential revocation (none exist yet), a grace period, and fixed
   retention periods are missing.
3. **No production deployment**, so TLS, HSTS at the edge, secret binding, remote D1,
   isolation, and rebuild-from-scratch have not been exercised.
4. **No penetration test or external review.** Dependency review is `npm audit` plus
   an SBOM; it is not provenance verification.
5. **Rate limiting is per key** with a fixed window; distributed abuse across keys is
   only partly mitigated. No CAPTCHA or bot detection.
6. **Session expiry is not covered by an automated test**; it relies on Better Auth's
   enforcement and the stored `expiresAt`.
7. **No CSRF token**, no CSP violation reporting, no WAF rules. SameSite cookies plus
   origin checks are the current control.
8. **No audit retention policy or key rotation procedure.** Audit export exists; there
   is no alerting on chain verification failure.
9. **Legacy tenancy audits remain two writes** (PARTIAL); a crash can leave an action
   unaudited. New flows use the atomic helper.
10. **TOTP replay inside the same time step is accepted** (standard TOTP); there is no
    per-code replay cache.
11. **No malware scanning** for uploads because uploads do not exist yet; R2 document
    handling must include scanning before launch.
12. **SSRF surface is currently zero** (no user-supplied URLs are fetched); revisit
    with integrations.
13. **`glob` is overridden to 14.0.3 ahead of OpenNext's declared range** to clear a
    DoS advisory. Build and runtime pass, but the override must be revisited on every
    OpenNext upgrade (ADR 0016).

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
