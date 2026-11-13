# Architecture

Status: Milestone 1. The runtime, persistence, authentication and tenancy
foundations are implemented and verified; no financial behaviour exists. This
document records the structure later milestones must respect; anything labelled
*planned* does not exist yet.

---

## 1. Context and forces

Hestian is a financial operating system for one-operator and small-team
creator businesses. The forces that shaped this architecture:

1. **Correctness outranks features.** A wrong balance destroys trust permanently.
   Financial code must be deterministic, auditable and independent of AI.
2. **One deployable.** The team is small. Operational overhead of distributed
   systems (service discovery, cross-service transactions, distributed tracing)
   is unjustifiable at this stage.
3. **Strict boundaries without distributed infrastructure.** Financial authority
   must be separable from analytics *inside* one deployable, or the separation
   will erode.
4. **Serverless runtime.** The target host is Cloudflare Workers through Freebuff
   Sites: request-scoped execution, no filesystem, no daemons, SQLite-compatible
   D1 for storage.
5. **Regulatory caution.** Accounting and tax rules vary by jurisdiction and must
   be researched and validated before implementation. The architecture must make
   it possible to plug in validated rules later without rewriting the core.

## 2. Selected architecture: modular monolith

A single Next.js application, internally partitioned into bounded contexts.

```
                       ┌──────────────────────────────────────────┐
   browser (no         │  Next.js App Router                      │
   authority)  ───────►│  React Server Components · Route handlers│
                       │  server actions (planned)                │
                       └───────────────────┬──────────────────────┘
                                           │ module service calls
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │                         module layer                                 │
        │ platform │ financial-authority │ operations │ analytical             │
        └──────────────────────────────────┬──────────────────────────────────┘
                                           │ repositories (planned)
                                   ┌───────▼────────┐
                                   │ D1 (SQLite)     │  R2 for documents (planned)
                                   └────────────────┘
```

Why this shape fits the target:

- **One deployment unit** matches a Workers deployment and removes the need for
  network calls between contexts.
- **In-process module boundaries** are enforceable statically (import graph) and
  cheaply in tests, unlike service contracts that need schema registries.
- **Transactionality stays possible.** A single D1 database plus module-owned
  tables lets a posting operation be atomic without sagas.
- **Extraction remains possible.** Because modules communicate through exported
  contracts and never share tables, a hot module (most plausibly `intelligence`)
  can become a separate Worker later without redesigning the domain.

Explicit non-goals for now: microservices, event streaming infrastructure, CQRS
read models, multi-region writes, plugin systems.

Decision record: [decisions/0001-modular-monolith.md](decisions/0001-modular-monolith.md).

## 3. Trust layers

| Layer | Modules | What it may do | What it may never do |
| --- | --- | --- | --- |
| `platform` | identity, tenancy, audit, integrations, governance | Prove identity, scope to a tenant, record events, hold provider evidence, enforce policy | Interpret accounting, post entries, execute payments |
| `financial-authority` | financial-core, reconciliation | Create authoritative financial state | Depend on analytical modules or AI output |
| `operations` | business-operations | Run business process, request financial consequences | Write journal entries directly |
| `analytical` | growth, commerce-intelligence, intelligence | Read facts, derive models, cite evidence | Write any authoritative state; be imported by another layer |

Dependency direction is one-way and enforced. The registry in
`src/modules/manifest.ts` is the executable source of truth; the table below is
generated from it by hand and must be updated with it.

| Module | Layer | May depend on |
| --- | --- | --- |
| identity | platform | — |
| tenancy | platform | identity, audit |
| audit | platform | — |
| integrations | platform | tenancy, audit |
| governance | platform | identity, tenancy, audit |
| financial-core | financial-authority | tenancy, audit |
| reconciliation | financial-authority | tenancy, audit, financial-core |
| business-operations | operations | tenancy, audit, financial-core |
| growth | analytical | tenancy, audit, financial-core |
| commerce-intelligence | analytical | tenancy, audit, growth |
| intelligence | analytical | tenancy, audit, financial-core, reconciliation, business-operations, growth, commerce-intelligence |

### Enforcement

`tests/architecture/boundaries.test.ts` parses every import in `src/` and fails the
build when:

1. A module imports another module it did not declare.
2. Any non-analytical layer imports an analytical module.
3. `financial-core` gains a dependency outside `{tenancy, audit}`.
4. Any module imports the app shell.
5. `src/core` or `src/config` imports a module (primitives stay universal).
6. The declared graph gains a cycle.
7. A module directory exists without an ownership document, or a documented
   module loses its directory.

This is the primary mechanism preventing AI or marketing code from acquiring a
write path into accounting. It is a static gate: it cannot be bypassed by a
runtime flag, a prompt, or a feature toggle.

## 4. Runtime and deployment constraints

The target platform is Freebuff Sites: a Worker-based host with D1, R2, managed
realtime and managed sign-in. Constraints and consequences:

| Constraint | Consequence for Hestian |
| --- | --- |
| Request-scoped Workers; no long-running processes | No cron jobs, queue workers or in-process schedulers. Recurring work must be request-triggered (on-demand revalidation, explicit import runs) or a platform-supported schedule, and must be idempotent. |
| No filesystem | Documents (invoices, receipts, statements) go to R2, never to disk. Imports stream through request bodies. |
| Partial Node compatibility (`nodejs_compat`) | Avoid `fs`, `net`, `child_process`, native addons and long CPU work. Prefer Web APIs (`fetch`, `crypto`, `Request`/`Response`). |
| CPU and memory limits per request | Heavy reconciliation, backfills and report generation must be chunked and resumable, not one long call. |
| No in-memory state across requests | No caches used for correctness. Any cache is disposable and keyed by tenant. |
| D1 is SQLite-compatible with a single primary | Treat writes as serialized. No `SELECT … FOR UPDATE`, no advisory locks, no row-level security. Correctness must come from unique constraints, idempotency keys and conditional updates. |
| Bounded environment variables | Configuration surface must stay small and names reused; secrets live in platform secrets, never in `NEXT_PUBLIC_*`. |
| Build is a prebuilt Worker + assets | Next.js goes through the pinned OpenNext adapter; `middleware.ts` is used instead of `proxy.ts` because the adapter does not support the latter. |
| Browser is untrusted | Every read and write is authorized on the server. The UI may hide controls, but hiding is not enforcement. |

**Verified in Milestone 1** (see [SECURITY.md](SECURITY.md) and
[decisions/0007-cloudflare-runtime-verification.md](decisions/0007-cloudflare-runtime-verification.md)):

- `@opennextjs/cloudflare` 1.20.17 bundles Next.js 16.4.6 into
  `.open-next/worker.js`; Wrangler 4.161.0 runs it on workerd with D1.
- Real D1 bindings resolve inside the Worker: sign-up writes users, accounts and
  sessions; sessions are read back and revoked.
- Nonce-based CSP works because every page is dynamic; the nonce appears on the
  emitted scripts.
- Middleware enforces the body-size limit and injects headers on HTML and API
  responses.
- Static assets are served by the Worker through the `ASSETS` binding.

Still unverified: production deployment, remote D1, CPU/latency under load,
R2, scheduled jobs, and behaviour at D1 size limits. No performance claim is made.

Decision record: [decisions/0002-runtime-and-deployment.md](decisions/0002-runtime-and-deployment.md).

## 5. Request lifecycle

The intended path for every consequential operation:

```
request
  → middleware: CSP nonce, security headers, body-size cap
  → route handler / server action
  → authenticated subject                        (identity — implemented)
  → tenant resolution + permission check         (tenancy — implemented)
  → input validation at the boundary (Zod)       (implemented)
  → module service (business rules, Result)      (tenancy — implemented)
  → invariant gate (deterministic validators)    (tenancy invariants — implemented)
  → constrained D1 write                         (implemented, no multi-statement
                                                  atomicity except batch())
  → audit event                                  (implemented)
  → response (no secrets, no cross-tenant data)
```

Rules:

- Handlers do not contain business rules; they authenticate, authorize, validate
  and delegate.
- Modules do not read `request`; they receive explicit, typed inputs.
- Nothing downstream of authorization re-derives the tenant from client input.
- Failure is explicit: expected failures return `Result`; invariant violations
  throw `DomainError` and abort the operation.

## 6. Data ownership

Implemented persistence model (Milestone 1):

- One D1 database (`DB` binding); tables are owned by one module and prefixed:
  `identity_*`, `tenancy_*`, `audit_event`, `platform_rate_limit`.
- No module reads another module's tables directly. Cross-module reads go through
  the owning module's exported functions, which apply tenant scoping.
- Every tenant-owned table carries `business_id`; membership and invitation
  uniqueness includes it. Resource mutation statements include it in the WHERE
  clause, so a guessed row id in another tenant matches nothing.
- D1 has no row-level security, no interactive transactions and no `SELECT … FOR
  UPDATE`. Correctness comes from foreign keys, `CHECK` constraints, unique
  indexes and conditional updates. `db.batch()` is atomic but does not roll back
  on constraint failure, so it is used only for independent writes.
- Identity tables are owned by Better Auth's generated schema
  (`scripts/generate-auth-schema.ts`); Hestian does not edit them by hand.
- Foreign keys and `CHECK` constraints are enabled by migration and exercised by
  `tests/database/migrations.test.ts` against real SQLite.
- Two-tenant isolation is tested at the repository level; the tests use the real
  migrations, not mocks.

## 7. Three data layers

| Layer | Contents | Mutability |
| --- | --- | --- |
| **A. Source evidence** | Imported provider records, invoice documents, webhook payload metadata, statement lines, provider references | Append-only; corrected by superseding evidence |
| **B. Accounting authority** | Validated financial events, accounting interpretations, journal entries, balances, reconciliation outcomes | Append-only once posted; corrections are reversals and adjustments |
| **C. Business intelligence** | Forecasts, analyses, scores, recommendations | Recomputable; never authoritative |

Layer C may read A and B. It may not write either. Layer B may read A as
provenance. Layer A never depends on B or C. See
[FINANCIAL_INTEGRITY.md](FINANCIAL_INTEGRITY.md) for the invariant list.

## 8. Cross-cutting conventions

| Concern | Convention | Location |
| --- | --- | --- |
| Money | `{ currency, amountMinor: bigint }`; integer minor units; safe range 2^53−1; JSON carries decimal strings | `src/core/money.ts` |
| Identifiers | Branded types parsed once at the boundary; never bare strings across modules | `src/core/ids.ts` |
| Expected failure | `Result<T, E>`; callers cannot forget the error path | `src/core/result.ts` |
| Invariant failure | `DomainError` with a stable `code`; unknown errors normalise to `INTERNAL` without leaking messages | `src/core/errors.ts` |
| Logs | One JSON object per line, stable `event` names, sensitive keys redacted, bounded payloads | `src/core/logging/` |
| Configuration | Zod-validated on the server; fails closed; rejects `NEXT_PUBLIC_*` secret names | `src/config/env.ts` |
| Module boundaries | Declared graph, tested against real imports | `src/modules/manifest.ts`, `tests/architecture/` |
| HTTP | Route handlers return codes from `httpStatusFor(code)`, never ad-hoc statuses | `src/core/errors.ts` |
| Security headers | Nonce-based CSP and standard headers applied per request | `src/core/security-headers.ts`, `src/middleware.ts` |
| Origin checks | Same-origin required for mutations; missing `Origin` fails closed | `src/core/http.ts` |
| Rate limits | Fixed-window counters in D1, keyed by action and subject | `src/core/rate-limit.ts` |
| Secrets | Server-only bindings; 32+ character auth secret required; redacted from logs | `src/config/bindings.ts`, `src/core/logging/` |
| Auth | Better Auth over D1; opaque DB sessions; immediate revocation | `src/modules/identity/` |
| Tenant context | Derived from membership rows, never from client input | `src/modules/tenancy/repository.ts` |
| Audit | Hash-chained append-only events with redacted metadata | `src/modules/audit/` |

## 9. Observability

- Structured logs with stable event names (`<module>.<action>`, for example
  `financial-core.entry.posted`), correlation id per request, tenant id where
  applicable, and no secrets.
- Audit events (planned) are the durable record of consequential actions; logs
  are operational and may be sampled or dropped.
- Errors carry a domain code. Stack traces are logged, never returned.
- Metrics/tracing: deferred. Platform analytics must not become a source of
  tenant data.

## 10. Testing and CI

`npm run check` runs typecheck, lint and tests; CI additionally builds. In this
milestone the architecture test is the most important guarantee, because it is
what keeps future financial code isolated. See
[TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## 11. Implementation status

| Area | Status |
| --- | --- |
| Application shell, health endpoint | Implemented, tested |
| Core primitives (money, ids, result, errors, logging, config) | Implemented, tested |
| HTTP security helpers, CSP, rate limiting | Implemented, tested |
| Module registry + boundary gate | Implemented, tested |
| Authentication and sessions | Implemented, tested (email delivery partial) |
| Tenancy, roles, invitations, tenant isolation | Implemented, tested |
| Audit trail (hash chain, append-only triggers) | Implemented, tested |
| Database schema and migrations | Implemented, tested locally |
| Cloudflare Worker build and local workerd run | Implemented, verified |
| Production deployment, remote D1, secrets bindings | Deferred, not authorized |
| Accounting engine | Planned |
| Reconciliation | Planned |
| Growth / commerce / intelligence | Planned |

## 12. Open architectural questions

1. **Transaction strategy on D1.** Milestone 1 established the constraint (no
   interactive transactions; `batch()` is atomic but does not roll back on
   constraint failure) and avoided multi-write invariants. The financial core
   must decide how posting, balances and audit stay consistent; see
   [decisions/0008-d1-persistence.md](decisions/0008-d1-persistence.md).
2. **Document storage.** R2 object keys, encryption, and retention for invoice
   evidence. Not started.
3. **Period control granularity.** Calendar month only, or tenant-defined
   fiscal periods.
4. **Multi-currency.** Whether the first financial milestone stores a functional
   currency per tenant with explicit FX rate provenance, and which rate source.
5. **Reconciliation intake.** Which provider formats are supported first and how
   ambiguous matches are surfaced.
6. **Intelligence data boundary.** What tenant data may leave the platform for
   model inference, and under which contractual terms.
7. **Audit retention and export.** Format, retention period and tenant-facing
   access. The chain exists; retention and anchoring do not.
8. **Email provider and verification.** Delivery is unconfigured, so accounts
   remain unverified; enabling `requireEmailVerification` depends on choosing a
   provider and a sender domain.

These are tracked as decisions to be made, not decisions already made.
