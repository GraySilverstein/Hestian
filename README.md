# Hestian

A business operating system for independent content creators, creator-led
businesses and small digital brands.

Hestian unifies four capabilities on one reliable foundation:

| Pillar | Scope |
| --- | --- |
| **Hestian Core** | Financial integrity, accounting foundations, revenue, expenses, invoices, receivables, payables, reconciliation and cash flow. |
| **Hestian Growth** | Talos-derived marketing and commerce intelligence: campaigns, budgets, channel performance, store intelligence and campaign profitability. |
| **Hestian Operations** | Teams, contractors, workflows, project costs, approvals and operational management. |
| **Hestian Intelligence** | Business analysis, evidence-grounded recommendations, forecasting and decision support. |

Hestian is not a chatbot with financial dashboards. It is a system of record
whose foundation must be reliable, auditable and secure.

---

## Status: Milestone 1.5 — security closure and financial readiness

The application runs as a verified Cloudflare Worker with a persistent D1 database,
real authentication (including TOTP), tenant-scoped authorization, a tamper-evident
audit trail, personal-data export and identity deletion. It still contains **no
financial records and no AI**.

**Implemented and verified**

- Cloudflare-targeted build (`@opennextjs/cloudflare` 1.20.17) and execution under
  `wrangler dev` / workerd with real D1 bindings.
- D1 schema and forward-only migrations: identity, tenancy, audit, rate limiting.
- Email/password authentication with scrypt hashing, database-backed sessions,
  revocation, password reset and database-backed rate limiting.
- TOTP two-factor authentication with encrypted secrets and ten single-use recovery
  codes; a password alone produces a challenge, never a session.
- Tenants (businesses), memberships, five roles, a central permission gate,
  invitations with hashed single-use tokens, and a last-owner invariant.
- Owner-scoped data export (one-hour expiry, session-only download) and atomic
  identity deletion, blocked for a sole business owner.
- Atomic mutation-plus-audit batches for consequential writes.
- Security headers with a nonce-based CSP, same-origin enforcement, request size
  limits, generic error responses and automatic secret redaction in logs.
- Append-only, hash-chained audit log with database triggers rejecting updates and
  deletes, tenant-scoped export, and chain verification.
- 98 tests across 17 suites plus a 28-check runtime verification script.
- Dependency advisories resolved with tested overrides and a production SBOM.

**Not implemented (deliberately)**

- Accounting engine, chart of accounts, journal, balances, invoices, payments.
- Email delivery: the Resend adapter and verification enforcement exist, but no
  provider credentials are configured, so no message is sent. Production therefore
  fails closed and new accounts cannot sign in until secrets are set.
- Ownership transfer, business closure and a deletion grace period.
- Production MFA policy (MFA is implemented; no tenant policy requires it yet).
- Bank feeds, payment execution, tax filing, payroll, Shopify, social publishing.
- AI features of any kind.
- Production deployment: no remote D1 database, Worker version or secret binding
  has been created.

Every planned capability is marked as planned in [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Verification performed

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, 98 tests) | pass |
| `npm run build` (Next.js production build) | pass |
| `npm run build:worker` (OpenNext → Worker bundle) | pass |
| `wrangler dev` + `npm run verify:runtime` (28 checks) | pass |
| Live sign-up → TOTP enrolment → challenge → sign-out in workerd | pass |
| `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities |
| Foreign-origin authentication request | rejected (4xx) |
| Login rate limit after 5 attempts | 429 |
| Password stored as scrypt hash, plaintext absent | confirmed via D1 query |

Not verified: production deployment, real email delivery, remote D1, backup/restore,
load/performance, and automated browser end-to-end flows. See
[docs/FINANCIAL_READINESS.md](docs/FINANCIAL_READINESS.md) before starting the
financial core.

---

## Architecture at a glance

A **modular monolith** with four trust layers:

```
platform            identity · tenancy · audit · integrations · governance
financial-authority financial-core · reconciliation        ← only writers of the books
operations          business-operations                    ← requests financial consequences
analytical          growth · commerce-intelligence · intelligence
```

Rules enforced by `tests/architecture/boundaries.test.ts`:

- No module may import a module it has not declared in `src/modules/manifest.ts`.
- Non-analytical layers may never depend on an analytical module, so a forecast
  cannot reach the journal through an import.
- `financial-core` may depend only on `tenancy` and `audit`.
- `intelligence` is a leaf: no module imports it.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the structure.

---

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Cloudflare Workers (workerd) | No filesystem, daemons or long CPU work. |
| Framework | Next.js 16.4.6 (App Router), React 19.3.1 | Server Components and route handlers keep authority server-side. |
| Adapter | `@opennextjs/cloudflare` 1.20.17, Wrangler 4.161.0 | Pinned; `middleware.ts` is retained because `proxy.ts` is unsupported. |
| Database | Cloudflare D1 (SQLite) | No row-level security, no interactive transactions. |
| Authentication | Better Auth 1.7.22 | Email/password, scrypt, DB sessions, DB rate limiting. |
| Validation | Zod 4 | Boundaries and configuration. |
| Tests | Vitest 5.1 + `node:sqlite` test adapter | Real SQL, constraints and triggers in tests. |
| Lint / types | ESLint 10, TypeScript 5.9 strict | |
| Hosting | Freebuff Sites — planned, not provisioned | Deployment path documented, not executed. |

Constraints and consequences:
[docs/decisions/0002-runtime-and-deployment.md](docs/decisions/0002-runtime-and-deployment.md)
and [0008-d1-persistence.md](docs/decisions/0008-d1-persistence.md).

---

## Repository layout

```
.
├── .github/workflows/ci.yml       # typecheck, lint, test, build, Worker build
├── docs/                          # architecture, security, governance, ADRs
├── migrations/                    # forward-only D1 migrations
├── public/_headers                # static asset caching
├── scripts/
│   ├── generate-auth-schema.ts    # Better Auth schema → migration SQL
│   └── verify-runtime.mjs         # HTTP checks against a running Worker
├── src/
│   ├── app/                       # App Router: shell, auth pages, workspace
│   ├── config/                    # env validation and binding types
│   ├── core/                      # money, ids, result, errors, logging, http,
│   │                              # crypto, rate limit, security headers
│   ├── middleware.ts              # CSP nonce + security headers + body limit
│   └── modules/
│       ├── manifest.ts            # module registry and dependency rules
│       ├── audit/                 # hash-chained append-only log + atomic commits
│       ├── governance/            # data export and account deletion
│       ├── identity/              # Better Auth, sessions, TOTP, email port
│       └── tenancy/               # businesses, memberships, roles, invitations
├── tests/                         # unit, security, database, architecture
├── open-next.config.ts
├── wrangler.jsonc
└── package.json
```

---

## Commands

```bash
npm ci                    # install from the lockfile
npm run dev               # Next.js dev server with local bindings
npm run check             # typecheck + lint + tests

npm run build:worker      # OpenNext build → .open-next/worker.js
npm run db:migrate:local  # apply migrations to local D1
npm run start:worker      # wrangler dev on 127.0.0.1:8787
npm run verify:runtime    # 28 live checks against that Worker
npm run sbom              # regenerate docs/sbom.production.cdx.json

npm run auth:schema       # regenerate identity schema after auth changes
npm run db:migrate:remote # apply migrations to the deployed D1 (requires auth)
npm run deploy:worker     # build and deploy (requires explicit authorization)
```

Local setup:

```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars   # replace BETTER_AUTH_SECRET with 32+ random chars
npm run db:migrate:local
npm run start:worker
```

No secret is committed. `.dev.vars` is git-ignored and ignored by ESLint's
environment, and production values are platform secret bindings.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, module rules, runtime constraints, request lifecycle. |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | Ubiquitous language, aggregates, state machines. |
| [docs/FINANCIAL_INTEGRITY.md](docs/FINANCIAL_INTEGRITY.md) | Numbered invariants and authority boundaries. |
| [docs/SECURITY.md](docs/SECURITY.md) | Implemented controls, threat model, limitations. |
| [docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md) | Classification, retention, export/deletion, AI data rules. |
| [docs/FINANCIAL_READINESS.md](docs/FINANCIAL_READINESS.md) | What the infrastructure can and cannot guarantee for the financial core. |
| [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) | Commit/push workflow, migrations, deployment. |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Suites, runtime verification, gaps. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and explicitly deferred work. |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records 0001–0016. |

Working on this repository: `main` is canonical; every meaningful change is
committed and pushed with verification. See
[docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md).

Do not begin the Financial Integrity Core without review.
