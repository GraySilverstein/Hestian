# Testing strategy

Status: foundational suite in place (35 tests, 5 files). Financial, database,
security and concurrency suites are planned with their milestones.

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
| Security primitives | redaction, config fail-closed, error hygiene | Vitest | **present** |
| Invariant / property | journal balance, allocation limits, idempotency under replay | Vitest (+ property testing planned) | planned |
| Integration | repositories against real D1 schema, constraints, transactions | Vitest + Wrangler/workerd | planned |
| Isolation | two tenants, every module, reads and writes | Vitest + D1 | planned |
| Concurrency | duplicate webhook delivery, parallel posting, retry storms | Vitest + D1 | planned |
| Runtime | Worker build, bindings, headers, auth callback flow | Wrangler/workerd + browser | planned |
| End-to-end | a complete operator journey | Playwright (only if justified) | planned |

## 3. Current suite

| File | Tests | Covers |
| --- | --- | --- |
| `tests/core/money.test.ts` | 10 | exact sums, sign handling, currency mismatch, safe range, integer parsing, wire round-trip, formatting per currency exponent, error details not echoing input |
| `tests/core/result.test.ts` | 7 | success/failure discrimination, mapping, chaining, fallback, fail-closed unwrap, error normalisation without message leakage |
| `tests/core/logging.test.ts` | 6 | structured event shape, level filtering, redaction at depth, child field isolation, error projection, bounded/circular payloads |
| `tests/config/env.test.ts` | 4 | defaults, invalid values without echo, `NEXT_PUBLIC_*` secret rejection, memoisation |
| `tests/architecture/boundaries.test.ts` | 8 | module documents, no unregistered modules, acyclic graph, layer direction, financial-core minimality, intelligence as a leaf, undeclared edges, real import scanning |

Run everything with `npm run test`; the architecture gate alone with
`npm run check:boundaries`.

### Why the architecture test matters most right now

It is the only executable statement that AI and marketing code cannot reach the
journal. It scans real import statements rather than trusting declarations, so it
fails when someone adds `import { postEntry } from "@/modules/financial-core"` to
an analytical module — even before any financial code exists.

## 4. Conventions

- **Deterministic only.** No network, no real clock, no randomness. Inject clocks
  and sinks (see the logger tests).
- **No shared mutable state between tests.** Each test constructs its own inputs.
- **Failure paths are first class.** Every `Result` path and every error code that
  can occur deserves a test.
- **Fixtures are labelled.** Any financial fixture is prefixed `FIXTURE` and never
  resembles real tenant data. Milestone 0 has none.
- **Assertions name invariants.** Prefer test names like "keeps posted entries
  immutable (FI-02)" over "works".
- **No test-only branches in production code.** If behaviour is hard to test,
  redesign the seam.

## 5. Planned suites

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

### Tenancy and security

- Two tenants: every read and write returns `NOT_FOUND` for the other tenant.
- Role matrix: each role against each capability, asserting denial by default.
- Cross-tenant id substitution in every parameter position.
- Signed-out access to each private route returns `401`.
- A complete sign-in → callback → session → sign-out flow on the deployed origin.

### Integration and runtime

- Migrations apply to an empty database and to a populated one.
- Constraints reject invalid rows (unbalanced entry, duplicate idempotency key,
  missing tenant).
- Worker build serves routes and assets with correct content types.
- Foreign-origin mutation attempts are rejected.

## 6. Coverage policy

Coverage percentage is not a gate. Gates are:

- every invariant (`FI-xx`) has at least one test that would fail if violated;
- every module has a two-tenant isolation test;
- every public module function has a failure-path test;
- every error code is reachable in a test.

## 7. CI

GitHub Actions runs typecheck, lint, tests and build on every push and pull
request to `main`. CI cannot run D1/Worker integration tests yet; that gap is
documented and must be closed before the deployment milestone, not assumed away.

## 8. Known gaps

1. No database, so no integration, isolation, constraint or concurrency tests.
2. No authentication, so no session or authorization tests.
3. No Worker build, so runtime compatibility is unverified.
4. No load or performance testing; no measured performance claims may be made.
5. Property-based testing is planned but not installed.
6. End-to-end UI testing is deliberately absent; the foundation shell has no
   user-facing behaviour worth automating.
