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

## Status: Milestone 0 — foundation only

This repository currently contains an **architectural foundation**, not a
product. Nothing financial is implemented, and nothing pretends to be.

**Implemented and verified**

- Strict TypeScript project on Next.js 16 (App Router) with a server-rendered shell.
- 11 bounded contexts declared as code with enforced dependency rules.
- Exact money primitives (integer minor units, no floating point).
- Typed error, `Result`, identifier, logging and configuration conventions.
- 35 automated tests across 5 suites, including an architecture boundary gate.
- ESLint and TypeScript configuration, GitHub Actions CI.
- Architecture, domain, integrity, security, governance, workflow, testing and
  roadmap documentation with six Architecture Decision Records.

**Not implemented (deliberately)**

- Accounting engine, chart of accounts, journal, balances, invoices, payments.
- Authentication, sessions, tenants, roles or any authorization enforcement.
- Bank feeds, payment execution, tax filing, payroll, Shopify, social publishing.
- AI features of any kind.
- Database schema, migrations or persistence.
- Any sample balance, chart or fixture that could be mistaken for real activity.

Every planned capability is marked as planned in [docs/ROADMAP.md](docs/ROADMAP.md).
The deployment target (Cloudflare Workers through Freebuff Sites) has **not** been
exercised: `next build` passes locally, but no Worker build or deployment exists yet.

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
| Runtime | Node.js 24 for development; Cloudflare Workers as deployment target | No Node server, filesystem, cron or background daemons in production. |
| Framework | Next.js 16 (App Router), React 19 | Server Components and route handlers keep authority on the server. |
| Language | TypeScript 5.9, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | |
| Validation | Zod 4 | Configuration and external input boundaries. |
| Tests | Vitest 5 | Node environment; no network access in tests. |
| Lint | ESLint 10 + typescript-eslint | `no-console` outside the logging module. |
| Package manager | npm (lockfile committed) | |
| Hosting / data | Freebuff Sites (Workers, D1, R2, Sign in) — planned | Not provisioned in this milestone. |

Operational constraints of the target runtime and their architectural
consequences are documented in
[docs/decisions/0002-runtime-and-deployment.md](docs/decisions/0002-runtime-and-deployment.md).

---

## Repository layout

```
.
├── .github/workflows/ci.yml      # typecheck, lint, test, build
├── docs/                         # architecture and governance documentation
│   └── decisions/                # Architecture Decision Records
├── src/
│   ├── app/                      # Next.js App Router: shell and route handlers
│   │   ├── api/health/route.ts   # read-only liveness and configuration check
│   │   ├── globals.css           # design tokens
│   │   ├── layout.tsx
│   │   └── page.tsx              # foundation surface, driven by the module registry
│   ├── config/env.ts             # validated server configuration, fails closed
│   ├── core/                     # environment-independent primitives
│   │   ├── errors.ts             # typed error codes and DomainError
│   │   ├── ids.ts                # branded, validated identifiers
│   │   ├── logging/              # structured JSON logs with redaction
│   │   ├── money.ts              # exact integer minor-unit arithmetic
│   │   └── result.ts             # explicit success/failure values
│   └── modules/                  # bounded contexts
│       ├── manifest.ts           # module registry and dependency rules
│       └── <module>/README.md    # ownership, exclusions, allowed dependencies
├── tests/
│   ├── architecture/             # boundary enforcement
│   ├── config/
│   └── core/
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## Commands

```bash
npm ci              # install from the lockfile
npm run dev         # development server
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run
npm run check       # typecheck + lint + test
npm run build       # production build
```

Local environment: copy `.env.example` to `.env.local`. No secrets are required
in this milestone. Never commit an environment file.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Context, layers, module rules, runtime constraints, data ownership. |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | Ubiquitous language, aggregates, state machines and relationships. |
| [docs/FINANCIAL_INTEGRITY.md](docs/FINANCIAL_INTEGRITY.md) | Numbered invariants, authority boundaries and AI prohibitions. |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, tenancy, authorization and credential handling. |
| [docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md) | Data classification, provenance, retention and AI data use. |
| [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) | Mandatory commit/push workflow, review gates and deployment. |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Test categories, current coverage and planned suites. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones, exit criteria and explicitly deferred work. |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records. |

---

## Working on this repository

`main` is canonical and every meaningful change is committed and pushed to it.
See [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) for the required
sequence (inspect → verify → review diff → commit → push → verify remote).

Do not start the Financial Integrity Core, or any other milestone, without
review: [docs/ROADMAP.md](docs/ROADMAP.md).
