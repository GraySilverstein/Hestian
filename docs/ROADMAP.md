# Roadmap

Status reflects the repository, not intention. A milestone is only "complete" when
its behaviour is implemented, tested, documented accurately, committed and pushed
— and reviewed.

Milestones do not start automatically. Each ends with a completion report and
waits for review.

---

## 1. Delivered

### Milestone 0 — Foundation, architecture and repository setup

**Status: complete, awaiting review.**

Delivered:

- Repository, toolchain, strict TypeScript, ESLint, Vitest, CI.
- Modular-monolith structure with 11 documented bounded contexts and an enforced
  dependency graph.
- Core primitives: exact money, branded identifiers, `Result`, `DomainError`,
  redacting structured logging, fail-closed configuration.
- Minimal server-rendered shell stating the true implementation status; read-only
  `/api/health`.
- Architecture, domain, financial integrity, security, governance, workflow,
  testing and roadmap documentation, plus six ADRs.

Exit criteria met: `npm run check` and `npm run build` pass; boundary gate passes;
no financial behaviour claimed; no fixtures presented as data.

---

## 2. Proposed sequence

Ordering rationale: the accounting engine can be built and tested server-side
without exposing tenant data. Authentication and tenancy must exist before any
tenant-facing financial surface is exposed. Evidence and reconciliation depend on
the posting model. Growth, commerce and intelligence depend on financial facts
being trustworthy.

### Milestone 1 — Financial Integrity Core

**Status: not started. Requires review approval.**

Scope:

- D1 schema and forward-only migrations for tenants' chart of accounts, periods,
  financial events, journal entries and lines.
- Deterministic posting gate implementing FI-01…FI-22.
- Reversal and adjustment flow; immutability of posted entries.
- Idempotency with unique constraints and replay semantics.
- Provenance links from entry to evidence or adjustment justification.
- Integration tests against the real schema, including constraint tests,
  two-tenant isolation and duplicate-delivery concurrency.
- No UI beyond a minimal, internal-only verification surface, if any.

Explicitly excluded: bank feeds, payments execution, tax rules, invoices UI,
reporting dashboards, AI.

Exit criteria: every invariant has a failing-if-violated test; no analytical
import path exists; migrations verified on an empty and populated database;
documented decision on transaction boundaries in D1.

### Milestone 2 — Identity, tenancy and audit

**Status: not started.**

Scope: real sign-in through the platform provider, server-verified sessions,
tenants and memberships, role and resource authorization, audit persistence,
tenant context propagation, two-tenant isolation suite across existing modules.

Exit criteria: complete sign-in/callback/session/sign-out flow verified on the
preview origin; role matrix tested; cross-tenant probes return `NOT_FOUND`; audit
written transactionally with consequential actions.

### Milestone 3 — Evidence and reconciliation

Scope: provider connection records, encrypted credential envelopes, webhook intake
with signature verification and idempotent receipts, R2 document storage,
reconciliation candidates and unresolved queues.

Exit criteria: forged and replayed webhooks cannot create financial effects;
unresolved items are visible and age correctly; every match cites evidence.

### Milestone 4 — Business operations

Scope: people and contractors, projects, workflows, approvals, project costs, and
their request path into financial events.

### Milestone 5 — Hestian Growth (Talos capabilities)

Scope: campaigns, marketing budget plans, channel measurements, campaign
profitability models built on financial facts; explicit assumptions and missing
data handling.

### Milestone 6 — Commerce intelligence

Scope: store performance, product margin observations, customer value analysis,
with declared windows, currencies and sources.

### Milestone 7 — Hestian Intelligence

Scope: evidence-grounded analysis, forecasts, recommendations with citations,
strict separation from actuals; model provider integration under the data rules in
[DATA_GOVERNANCE.md](DATA_GOVERNANCE.md).

Exit criteria: no output can reach Layer B; forecasts are typed differently from
actuals; every recommendation cites retrievable evidence or is marked unsupported.

### Milestone 8 — Hardening, deployment and compliance readiness

Scope: Worker build and deployment verification, security headers and CSRF
policy, backup/restore rehearsal, rate limiting, performance measurement,
jurisdiction-specific accounting and tax validation with qualified review,
operational runbooks, incident response.

---

## 3. Deferred beyond the current roadmap

These are recognised product capabilities that require separate design, licensing
or regulatory work. They must not be stubbed, faked or implied:

- Payment execution and money movement of any kind.
- Automated tax filing and jurisdiction-specific tax engines.
- Payroll and contractor withholding.
- Live Shopify, ad platform or social publishing integrations.
- Bank API connectivity and open banking.
- Multi-currency revaluation and FX trading.
- AI-authored financial entries (never, by architecture).

## 4. Standing rules

- No milestone begins without review of the previous one.
- A capability is described as implemented only when its tests pass and the
  documentation says so.
- Every milestone updates this roadmap, the architecture document and any affected
  ADR in the same commit series.
- Roadmap dates are deliberately absent: estimates are not commitments, and an
  incorrect date is worse than none.
