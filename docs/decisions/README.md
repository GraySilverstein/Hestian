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
