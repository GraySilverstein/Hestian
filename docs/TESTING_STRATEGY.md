# Testing strategy

Status: 79 tests across 12 suites plus a 17-check runtime verification script
(Milestone 1). Financial invariants, concurrency and end-to-end suites remain
planned with their milestones.

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
| Authentication | hashing, sign-in, session read, sign-out, wrong password | Vitest + `node:sqlite` D1 adapter | **present** |
| Authorization | exhaustive role matrix, denial by default, tenant resolution | Vitest + real migrations | **present** |
| Database | migrations, constraints, triggers, scoping | Vitest + `node:sqlite` | **present** |
| Audit | chain verification, tamper rejection, redaction, concurrency | Vitest + `node:sqlite` | **present** |
| Runtime | Worker bundle, bindings, headers, cookies, origin checks, rate limits | Wrangler/workerd + `scripts/verify-runtime.mjs` | **present (manual)** |
| Invariant / property | journal balance, allocation limits, idempotency under replay | Vitest (+ property testing planned) | planned |
| Concurrency on real D1 | duplicate webhook delivery, parallel posting | Wrangler/workerd | planned |
| End-to-end | a complete operator journey | Playwright (only if justified) | planned |

## 3. Current suite

| File | Tests | Covers |
| --- | --- | --- |
| `tests/core/money.test.ts` | 10 | exact sums, sign handling, currency mismatch, safe range, integer parsing, wire round-trip, formatting per currency exponent, error details not echoing input |
| `tests/core/result.test.ts` | 7 | success/failure discrimination, mapping, chaining, fallback, fail-closed unwrap, error normalisation without message leakage |
| `tests/core/logging.test.ts` | 6 | structured event shape, level filtering, redaction at depth, child field isolation, error projection, bounded/circular payloads |
| `tests/core/rate-limit.test.ts` | 4 | allowance then block, window reset, key independence, `RATE_LIMITED` mapping |
| `tests/config/env.test.ts` | 4 | defaults, invalid values without echo, `NEXT_PUBLIC_*` secret rejection, memoisation |
| `tests/architecture/boundaries.test.ts` | 8 | module documents, no unregistered modules, acyclic graph, layer direction, financial-core minimality, intelligence as a leaf, undeclared edges, real import scanning |
| `tests/database/migrations.test.ts` | 5 | empty-database migration, tenant columns, invalid role/outcome/orphan rows, audit triggers, duplicate invitation |
| `tests/identity/authentication.test.ts` | 5 | sign-up, scrypt hash and salt, wrong-password rejection, session read, sign-out revocation |
| `tests/security/authorization.test.ts` | 7 | full role matrix, unknown role denial, permission mapping, no role leakage in errors |
| `tests/security/tenant-isolation.test.ts` | 7 | forged tenant ids, cross-tenant member listing, invitation email binding, hashed tokens, privilege escalation, last-owner invariant, scoped membership updates |
| `tests/security/http.test.ts` | 10 | body limits, JSON parsing, origin enforcement, safe redirects, header composition, nonce CSP |
| `tests/audit/audit-chain.test.ts` | 6 | chain links, verification, tamper detection, append-only triggers, metadata redaction, concurrent appends |

Run everything with `npm run test`; the architecture gate alone with
`npm run check:boundaries`.

### How the database tests are real

`tests/helpers/sqlite.ts` implements the D1 binding surface (`prepare`, `bind`,
`first`, `run`, `all`, `batch`, `exec`) over Node's built-in `node:sqlite`, and
applies the actual files in `migrations/`. Tests therefore exercise real SQL,
foreign keys, `CHECK` constraints, unique indexes and audit triggers — not in-memory
fakes of the repository. The adapter is test-only; production uses D1.

### Why the architecture test matters most right now

It is the only executable statement that AI and marketing code cannot reach the
journal. It scans real import statements rather than trusting declarations, so it
fails when someone adds `import { postEntry } from "@/modules/financial-core"` to
an analytical module — even before any financial code exists.

## 4. Runtime verification

`npm run verify:runtime` (after `npm run build:worker` and
`npm run start:worker`) checks a live workerd instance:

1. health endpoint and D1 binding;
2. authentication configured;
3. unauthenticated `/workspace` redirect;
4. sign-up, `HttpOnly` and `SameSite=Lax` cookie;
5. CSP nonce present and no inline scripts; `frame-ancestors 'none'`; nosniff;
6. session resolves and `/workspace` renders;
7. foreign-origin authentication rejected;
8. oversized request rejected with 413;
9. sign-out succeeds and the old session is immediately invalid.

Last run: 17/17. This is the check that a unit test cannot replace: it proves the
adapter, workerd, D1 and cookie handling agree.

## 5. Conventions

- **Deterministic only.** No network, no real clock, no randomness. Inject clocks
  and sinks (see the logger tests).
- **Isolated databases.** Every database test opens its own SQLite database,
  applies migrations and closes it; nothing is shared.
- **No mocked authorization.** Tests call the real gate and the real repository;
  where a session is needed it is created through Better Auth.
- **Failure paths are first class.** Every `Result` path and every error code that
  can occur deserves a test.
- **Fixtures are labelled.** Any financial fixture is prefixed `FIXTURE` and never
  resembles real tenant data. No financial fixtures exist.
- **Assertions name invariants.** Prefer "keeps posted entries immutable (FI-02)"
  over "works".
- **No test-only branches in production code.** If behaviour is hard to test,
  redesign the seam.

## 6. Planned suites

### Financial core (next milestone)

- Journal balance property test: for generated line sets, post succeeds only when
  debits equal credits, and a posted entry's lines sum to zero per currency.
- Immutability: no update/delete path is reachable; reversal creates a linked
  entry and leaves the original untouched.
- Idempotency: the same event key posted twice yields one entry and the same
  result; concurrent duplicates yield one entry.
- Period control: posting into a locked or closed period is rejected with a code.
- Provenance: an entry without evidence or explicit adjustment is rejected.
- Money range: values at ±(2^53−1) round-trip; ±(2^53) rejected.

### Security and tenancy follow-ups

- Session expiry: a session past `expiresAt` is rejected.
- Password reset end-to-end once a mail transport exists.
- Rate-limit behaviour across processes and windows.
- MFA enrolment and challenge once enabled.
- Automated browser flow for the server-action forms (currently only the HTTP API
  path is automated).

### Integration and runtime

- Migrations apply to a populated database, not only an empty one.
- Constraints reject invalid rows (unbalanced entry, duplicate idempotency key,
  missing tenant).
- Worker serves routes and assets with correct content types.
- R2 upload validation and scanning, once uploads exist.

## 7. Coverage policy

Coverage percentage is not a gate. Gates are:

- every invariant (`FI-xx`) has at least one test that would fail if violated;
- every module has a two-tenant isolation test;
- every public module function has a failure-path test;
- every error code is reachable in a test.

## 8. CI

GitHub Actions runs typecheck, lint, tests, `next build` and `build:worker` on
every push and pull request to `main`. CI cannot run `wrangler dev` or the runtime
script; that gap is documented and must be closed before the production
deployment milestone, not assumed away.

## 9. Known gaps

1. Session expiry is configured but not covered by an automated test.
2. Server-action form flows are not automated; the HTTP auth path is.
3. No concurrency tests against real D1 (only concurrent appends against SQLite).
4. No load or performance testing; no measured performance claims may be made.
5. Property-based testing is planned but not installed.
6. Production deployment, email delivery and MFA are untested because they do not
   exist yet.
