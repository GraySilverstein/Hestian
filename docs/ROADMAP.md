# Roadmap

Status reflects the repository, not intention. A milestone is only "complete" when
its behaviour is implemented, tested, documented accurately, committed and pushed
— and reviewed.

Milestones do not start automatically. Each ends with a completion report and
waits for review.

---

## 1. Delivered

### Milestone 0 — Foundation, architecture and repository setup

**Status: complete, reviewed.**

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

### Milestone 1 — Runtime validation, security foundation and tenancy

**Status: complete, awaiting review.**

Delivered:

- Cloudflare-targeted build via `@opennextjs/cloudflare` 1.20.17 and Wrangler
  4.161.0, running on workerd with real D1 bindings. Limitations recorded in
  [decisions/0007-cloudflare-runtime-verification.md](decisions/0007-cloudflare-runtime-verification.md).
- Forward-only D1 migrations for identity, tenancy, audit and rate limiting;
  conventions and transaction limits in
  [decisions/0008-d1-persistence.md](decisions/0008-d1-persistence.md).
- Email/password authentication with scrypt hashing, database sessions,
  revocation, password-reset plumbing, rate limiting and a documented
  provider-dependent email gap
  ([decisions/0009-authentication-and-sessions.md](decisions/0009-authentication-and-sessions.md)).
- Businesses, memberships, five roles, a central permission gate, invitations with
  hashed tokens and a last-owner invariant
  ([decisions/0010-tenant-authorization.md](decisions/0010-tenant-authorization.md)).
- Nonce-based CSP, security headers, same-origin enforcement, request size limits,
  generic errors, and a 17-check runtime verification script.
- Append-only hash-chained audit log
  ([decisions/0011-audit-tamper-evidence.md](decisions/0011-audit-tamper-evidence.md)).
- 79 tests across 12 suites, including real two-tenant isolation and a full
  permission matrix.

Explicitly not delivered: email delivery, MFA, production deployment, remote D1,
R2, any financial behaviour.

### Milestone 1.5 — Security closure and financial readiness

**Status: complete, awaiting review.**

Delivered:

- TOTP two-factor authentication with encrypted secrets, single-use recovery codes,
  a fail-closed sign-in challenge, password-gated disablement, session revocation and
  audit events (ADR 0013).
- Provider-independent email port with a Resend adapter, fail-closed production
  verification, single-use/expiring tokens, resend throttling, enumeration-safe
  responses, and session revocation on password reset (ADR 0012). Delivery itself is
  **blocked** until provider credentials exist.
- Owner-scoped personal data export (one-hour, session-only download) and atomic
  identity deletion with sole-owner blocking and anonymisation (ADR 0014).
- `commitWithAudit`: mutation plus audit event in one D1 batch, failure-injection and
  concurrency tests, and a written determination of D1 batch semantics (ADR 0015).
- Dependency advisories traced, safely overridden and verified (`npm audit`: 0), with
  a production SBOM and supply-chain procedure (ADR 0016).
- 115 tests across 19 suites; 29/29 live workerd checks plus 31 dev-preview checks;
  financial readiness assessment
  ([FINANCIAL_READINESS.md](FINANCIAL_READINESS.md)).

Explicitly not delivered: real email delivery, ownership transfer/business closure,
production deployment, remote D1, R2, any financial behaviour.

### Milestone 2 — Canonical business and financial domain model

**Status: design complete, awaiting review. No runtime code or financial table was
added.**

Delivered:

- [CANONICAL_DOMAIN_MODEL.md](CANONICAL_DOMAIN_MODEL.md): business, legal entity,
  workspace, membership, parties, capabilities and operational entities, with
  ownership/classification matrices.
- [FINANCIAL_DOMAIN_MODEL.md](FINANCIAL_DOMAIN_MODEL.md): chart of accounts,
  journal, periods, invoices, bills, payments, settlements, revenue sources and
  creator/SME mappings.
- [ACCOUNTING_INVARIANTS.md](ACCOUNTING_INVARIANTS.md): FI-01…FI-34 with enforcement
  locations, failure behaviour and required tests.
- [PAYMENT_AND_SETTLEMENT_LIFECYCLE.md](PAYMENT_AND_SETTLEMENT_LIFECYCLE.md) and
  [FINANCIAL_EVIDENCE_AND_RECONCILIATION.md](FINANCIAL_EVIDENCE_AND_RECONCILIATION.md):
  capture/settlement separation and evidence/authority/reconciliation rules.
- [D1_FINANCIAL_SCHEMA_DESIGN.md](D1_FINANCIAL_SCHEMA_DESIGN.md): proposed tables,
  triggers, idempotency, concurrency and migration constraints.
- [CREATOR_AND_SME_WORKSPACE_MODEL.md](CREATOR_AND_SME_WORKSPACE_MODEL.md) and ADRs
  0017–0023.

No financial behaviour, provider integration or AI gateway was delivered. Browser
authentication acceptance was attempted; its result and limitations are recorded in
the Milestone 2 completion report.

---

## 2. Proposed sequence

Ordering rationale: the accounting engine can be built and tested server-side
without exposing tenant data. Authentication and tenancy now exist, so financial
authority can be built next behind real boundaries. Evidence and reconciliation
depend on the posting model. Growth, commerce and intelligence depend on financial
facts being trustworthy.

### Milestone 2 implementation — Financial Integrity Core

**Status: not started. Requires review approval of the Milestone 2 design.**

Scope:

- D1 schema and forward-only migrations for chart of accounts, fiscal periods,
  financial events, journal entries and lines.
- Deterministic posting gate implementing FI-01…FI-34.
- Reversal and adjustment flow; immutability of posted entries.
- Idempotency with unique constraints and replay semantics.
- Provenance links from entry to evidence or adjustment justification.
- Implementation of the designed batch/trigger schema for multi-write invariants
  on D1.
- Integration tests against the real schema: constraints, two-tenant isolation,
  duplicate delivery, and invariant violations.

Explicitly excluded: bank feeds, payment execution, tax rules, invoice UI,
reporting dashboards, AI.

Exit criteria: every invariant has a failing-if-violated test; no analytical import
path exists; migrations verified on an empty and populated database; multi-write
consistency strategy documented and tested.

### Milestone 3 — Evidence and reconciliation

Scope: provider connection records, encrypted credential envelopes, webhook intake
with signature verification and idempotent receipts, R2 document storage with
malware scanning before processing, reconciliation candidates and unresolved
queues.

Exit criteria: forged and replayed webhooks cannot create financial effects;
unresolved items are visible and age correctly; every match cites evidence;
uploads are type/size validated and scanned.

### Milestone 4 — Business operations

Scope: people and contractors, projects, workflows, approvals, project costs, and
their request path into financial events, reusing the Milestone 1 tenant context.

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

### Milestone 8 — Production hardening and launch readiness

Scope: authorized production deployment, remote D1 provisioning and restore
rehearsal, managed secrets and rotation, email provider and verification
enforcement, MFA, monitoring/alerting on audit anomalies, load and soak tests,
incident response, backup drills, and jurisdiction-specific accounting validation
with qualified review.

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
