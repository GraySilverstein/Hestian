# Testing strategy

Status: 98 tests across 17 suites plus a 28-check runtime verification script
(Milestone 1.5). Financial invariants, real-D1 concurrency, migration/restore and
end-to-end browser tests remain planned.

---

## 1. What testing is for here

In a financial system, tests are not a coverage exercise. They exist to prove
invariants. A test that only executes code without asserting an invariant adds
maintenance cost without adding trust.

Priority order:

1. **Money cannot be wrong.** Exact arithmetic, signed directions, currency
   separation, bounded ranges.
2. **Tenancy cannot leak.** No query or command succeeds across tenants.
3. **Financial state cannot be corrupted.** Balanced entries, immutability,
   idempotency, period controls.
4. **Authority cannot be bypassed.** Analytical code has no write path;
   authorization is enforced server-side.
5. **Behaviour is reproducible.** Deterministic validators, deterministic tests.

## 2. Test categories

| Category | What it proves | Tooling | Status |
| --- | --- | --- | --- |
| Unit | pure domain rules, value objects, parsing | Vitest | **present** |
| Architecture | dependency direction, module ownership, no AI→authority edge | Vitest + source scanner | **present** |
| Security primitives | redaction, config fail-closed, error hygiene, headers, CSRF helper, limits | Vitest | **present** |
| Authentication | hashing, sign-in, session read, sign-out, verification, reset | Vitest + `node:sqlite` D1 adapter | **present** |
| MFA | enrolment, challenge, recovery single-use, disable, encrypted storage | Vitest + provider API | **present** |
| Authorization | exhaustive role matrix, denial by default, tenant resolution | Vitest + real migrations | **present** |
| Privacy | export scoping/expiry, deletion blockers, anonymisation, audit | Vitest + real migrations | **present** |
| Database | migrations, constraints, triggers, scoping | Vitest + `node:sqlite` | **present** |
| Audit | chain verification, tamper rejection, redaction, concurrency, atomicity | Vitest + real migrations | **present** |
| Runtime | Worker bundle, bindings, headers, cookies, MFA, origin checks, limits | Wrangler/workerd + `scripts/verify-runtime.mjs` | **present (manual)** |
| Invariant / property | journal balance, allocation limits, idempotency under replay | Vitest (+ property testing planned) | planned |
| Concurrency on real D1 | duplicate posting, parallel period locks | Wrangler/workerd | planned |
| Migration/restore | populated-database migration, backup restore rehearsal | Wrangler + remote D1 | planned |
| End-to-end | a complete operator journey | Playwright (only if justified) | planned |

## 3. Current suite

| File | Tests | Covers |
| --- | --- | --- |
| `tests/core/money.test.ts` | 10 | exact sums, sign handling, currency mismatch, safe range, parsing, wire round-trip, formatting |
| `tests/core/result.test.ts` | 7 | success/failure discrimination, mapping, chaining, fallback, fail-closed unwrap, error normalisation |
| `tests/core/logging.test.ts` | 6 | structured events, level filtering, redaction at depth, child isolation, bounded payloads |
| `tests/core/rate-limit.test.ts` | 4 | allowance then block, window reset, key independence, `RATE_LIMITED` |
| `tests/config/env.test.ts` | 4 | defaults, invalid values without echo, `NEXT_PUBLIC_*` rejection, memoisation |
| `tests/architecture/boundaries.test.ts` | 8 | registry, acyclic graph, layer direction, financial-core minimality, real imports |
| `tests/database/migrations.test.ts` | 6 | empty-database migration, two-factor columns, tenant columns, invalid rows, triggers, duplicate invitation |
| `tests/identity/authentication.test.ts` | 5 | sign-up, scrypt hash, wrong password, session read, sign-out |
| `tests/identity/email-verification.test.ts` | 5 | fail-closed verification, replay, expired JWT, reset single-use, session revocation, enumeration, resend throttle |
| `tests/identity/mfa.test.ts` | 4 | enrolment, password-only refusal, challenge, recovery single-use, encrypted codes, disable, other-session revocation |
| `tests/security/authorization.test.ts` | 7 | full role matrix, unknown role denial, no role leakage |
| `tests/security/tenant-isolation.test.ts` | 7 | forged ids, cross-tenant listing/mutation, invitation binding, escalation, last owner |
| `tests/security/http.test.ts` | 10 | body limits, JSON parsing, origin enforcement, safe redirects, CSP nonce |
| `tests/audit/audit-chain.test.ts` | 6 | chain links, verification, tamper detection, triggers, redaction, concurrency |
| `tests/audit/atomicity.test.ts` | 4 | batch commit, rollback on failure, concurrent audited writes, tamper detection |
| `tests/audit/export.test.ts` | 1 | tenant-scoped export with chain fields |
| `tests/privacy/privacy.test.ts` | 4 | export scoping/expiry, foreign denial, sole-owner block, deletion, audit |

Run everything with `npm run test`; the architecture gate alone with
`npm run check:boundaries`.

### How the database tests are real

`tests/helpers/sqlite.ts` implements the D1 binding surface (`prepare`, `bind`,
`first`, `run`, `all`, `batch`, `exec`) over Node's built-in `node:sqlite`, and
applies the actual files in `migrations/`. Tests therefore exercise real SQL,
foreign keys, `CHECK` constraints, unique indexes and audit triggers. `batch()` uses
`BEGIN`/`COMMIT`/`ROLLBACK`, matching D1's documented transaction guarantee. The
adapter is test-only; production uses D1.

Tests that need a session obtain a real cookie by calling the provider's sign-in API
and carrying the `Set-Cookie` header forward, rather than fabricating a session.
MFA tests generate TOTP codes from the enrolled secret with the same RFC 6238
algorithm an authenticator uses.

### Why the architecture test matters most right now

It is the only executable statement that AI and marketing code cannot reach the
journal. It scans real import statements rather than trusting declarations, so it
fails when someone adds `import { postEntry } from "@/modules/financial-core"` to an
analytical module — even before any financial code exists.

## 4. Runtime verification

`npm run verify:runtime` (after `npm run build:worker` and
`npm run start:worker`) checks a live workerd instance (28 checks):

1. health endpoint and D1 binding;
2. authentication configured;
3. unauthenticated `/workspace` and `/settings/security` redirects;
4. export download and audit export require a session;
5. sign-up, `HttpOnly` and `SameSite=Lax` cookie;
6. CSP nonce, no inline scripts, `frame-ancestors 'none'`, nosniff;
7. session resolves and `/workspace` renders;
8. TOTP enrolment returns a URI and ten recovery codes;
9. TOTP confirmation succeeds and the session survives rotation;
10. sign-out invalidates immediately;
11. password-only sign-in is challenged instead of creating a session;
12. TOTP challenge completes sign-in;
13. foreign-origin authentication is rejected;
14. oversized requests return 413.

Last run: 28/28 against `http://127.0.0.1:8787`. This is the check a unit test cannot
replace: it proves the adapter, workerd, D1, cookies and provider plugins agree.

## 5. Conventions

- **Deterministic only.** No network, no real clock, no randomness except the
  provider's own token generation, which tests consume rather than predict.
- **Isolated databases.** Every database test opens its own SQLite database, applies
  migrations and closes it; nothing is shared.
- **No mocked authorization.** Tests call the real gate and repository; sessions come
  from the real auth API.
- **Failure paths are first class.** Every `Result` path that can occur deserves a test.
- **Fixtures are labelled.** No financial fixtures exist.
- **Assertions name invariants.** Prefer "rolls back the business write when the audit
  append cannot commit" over "works".
- **No test-only branches in production code.** The mail capture adapter is injected
  through the existing port; no production path checks `NODE_ENV`.

## 6. Planned suites

### Financial core

- Journal balance property test, rejected unless debits equal credits per currency.
- Trigger/constraint proof that an unbalanced line set cannot commit.
- Immutability: posted entries have no update/delete path; reversals link.
- Idempotency: duplicate event key yields one entry and the same result.
- Period control: posting into a locked period fails with a code.
- Concurrency on workerd: parallel postings, balance invariants, no lost update.
- Money range and D1 binding probe at ±(2^53−1).

### Remaining security and tenancy

- Session expiry with a stored session past `expiresAt`.
- Password reset and verification over a real provider in a staging environment.
- Owner/accountant MFA policy enforcement once introduced.
- Automated browser flow for server-action forms (HTTP paths are automated).
- Cross-tenant concurrency probes, not only sequential.

### Operations

- Populated-database migrations and a restore rehearsal.
- Audit chain verification alerting.
- Load/latency measurement before any performance claim.

## 7. Coverage policy

Coverage percentage is not a gate. Gates are:

- every invariant (`FI-xx`) has at least one test that would fail if violated;
- every module has a two-tenant isolation test;
- every public module function has a failure-path test;
- every error code is reachable in a test.

## 8. CI

GitHub Actions runs typecheck, lint, tests, `next build` and `build:worker` on every
push and pull request to `main`. CI cannot run `wrangler dev` or the runtime script;
that gap is documented and must be closed before the deployment milestone, not
assumed away.

## 9. Known gaps

1. Session expiry and the provider's lockout window are configured but not automated.
2. Server-action form flows are not automated; the HTTP and module paths are.
3. No real-D1 concurrency or load test; the SQLite adapter matches documented batch
   semantics but is not D1.
4. Migration atomicity, backup and restore are untested because no remote database
   exists.
5. Email delivery, sender authentication and bounce handling cannot be tested without
   a provider account.
6. TOTP replay within a time step is not preventable with this provider version.
7. Property-based testing is planned but not installed.
8. No penetration test or third-party review.
