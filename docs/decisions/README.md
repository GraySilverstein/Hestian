# Architecture Decision Records

An ADR captures a decision that is expensive to reverse or that constrains future
work. ADRs are immutable once accepted: to change a decision, add a new record that
supersedes the old one and update its status.

## Index

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-modular-monolith.md) | Modular monolith with an enforced module registry | Accepted | 2026-11-13 |
| [0002](0002-runtime-and-deployment.md) | Next.js on Cloudflare Workers via Freebuff Sites | Accepted | 2026-11-13 |
| [0003](0003-integer-minor-units.md) | Money as integer minor units | Accepted | 2026-11-13 |
| [0004](0004-financial-authority-boundaries.md) | Financial authority boundaries and AI prohibitions | Accepted | 2026-11-13 |
| [0005](0005-tenant-isolation.md) | Tenant isolation without row-level security | Accepted | 2026-11-13 |
| [0006](0006-idempotency-and-provenance.md) | Idempotent financial events with explicit provenance | Accepted | 2026-11-13 |
| [0007](0007-cloudflare-runtime-verification.md) | Cloudflare runtime verification and pinned adapter | Accepted | 2026-11-13 |
| [0008](0008-d1-persistence.md) | D1 persistence, migrations and transaction boundaries | Accepted | 2026-11-13 |
| [0009](0009-authentication-and-sessions.md) | Authentication, sessions and credential handling | Accepted | 2026-11-13 |
| [0010](0010-tenant-authorization.md) | Tenant context, roles and centralized authorization | Accepted | 2026-11-13 |
| [0011](0011-audit-tamper-evidence.md) | Append-only, hash-chained audit log | Accepted | 2026-11-13 |
| [0012](0012-email-verification-and-recovery.md) | Email verification, recovery and fail-closed delivery | Accepted (delivery blocked) | 2026-11-13 |
| [0013](0013-multi-factor-authentication.md) | Multi-factor authentication with TOTP and recovery codes | Accepted | 2026-11-13 |
| [0014](0014-export-and-deletion.md) | Personal data export and account deletion | Accepted | 2026-11-13 |
| [0015](0015-audit-atomicity.md) | Audit atomicity: D1 batch commits, outbox rejected for now | Accepted | 2026-11-13 |
| [0016](0016-dependency-supply-chain.md) | Dependency pins, overrides and supply-chain review | Accepted | 2026-11-13 |
| [0017](0017-business-legal-entity-and-workspace.md) | Business, legal entity and workspace are distinct | Accepted (design) | 2026-11-14 |
| [0018](0018-immutable-double-entry-journal.md) | Immutable double-entry journal with controlled periods | Accepted (design) | 2026-11-14 |
| [0019](0019-payment-capture-settlement-separation.md) | Separate capture, payment, allocation and settlement | Accepted (design) | 2026-11-14 |
| [0020](0020-evidence-authority-and-advisory-reconciliation.md) | Evidence is not authority; reconciliation is advisory until reviewed | Accepted (design) | 2026-11-14 |
| [0021](0021-d1-financial-schema-and-trigger-enforcement.md) | D1 financial schema: batch, triggers and idempotency | Accepted (design) | 2026-11-14 |
| [0022](0022-ai-advisory-boundary.md) | AI is advisory only; provider-independent gateway | Accepted (design) | 2026-11-14 |
| [0023](0023-shared-creator-sme-capability-model.md) | One ledger with creator/SME capability profiles | Accepted (design) | 2026-11-14 |

## Status values

- **Proposed** — under discussion, not binding.
- **Accepted** — the current decision; code and documentation must match it.
- **Superseded** — replaced by a later ADR, which is linked.
- **Deprecated** — no longer relevant, kept for history.

## Template

```markdown
# NNNN — Title

- **Status:** Proposed | Accepted | Superseded by NNNN | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** roles, not names, unless attribution matters

## Context

The forces at play: constraints, requirements, and what makes this decision
necessary now. State what is unknown.

## Decision

What was decided, in the present tense, specifically enough to be testable.

## Consequences

What becomes easier, what becomes harder, what is now forbidden, and what must be
built to make the decision hold.

## Alternatives considered

Each alternative and why it was rejected. Include "do nothing" where relevant.

## Follow-ups

Decisions still open, verification still required, and the milestone that must
close them.
```
