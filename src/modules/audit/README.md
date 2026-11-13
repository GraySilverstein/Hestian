# audit

**Pillar** Platform · **Layer** platform · **Status** implemented and tested

Append-only record of consequential actions, so a security event or later financial
state change can be explained without trusting application logs.

## Owns

- `audit_event`: actor, business, action, outcome, target, correlation id, metadata,
  timestamp, `prev_hash`, `hash`.
- Chain verification and metadata redaction.
- Actor attribution for server-side operations.

## Does not own

- Financial state or its corrections.
- Authorization decisions (it records them, it does not make them).
- Log shipping, alerting or external anchoring.

## May depend on

`~core` only. It accepts primitive and branded identifiers so every module can emit
events without a cycle.

## Public surface

| Export | Purpose |
| --- | --- |
| `recordAuditEvent(db, input)` | Appends one event, retrying on chain contention. |
| `commitWithAudit(db, statements, input)` | Commits a business mutation and its audit event in one D1 batch. |
| `verifyAuditChain(db)` | Recomputes hashes and linkage; reports the first break. |
| `exportBusinessAuditEvents(db, businessId)` | Tenant-scoped export including chain fields. |
| `listBusinessAuditEvents(db, businessId, limit)` | Most recent events for one business. |
| `ACTIONS` | Fixed action names, so strings do not drift. |

## Invariants

- Events are append-only: database triggers reject `UPDATE` and `DELETE`.
- The chain is serialised by a unique `prev_hash`; a racing writer retries.
- Metadata is redacted before hashing; no password, token or email is stored.
- A failed audit write surfaces as an error; the caller decides whether to fail the
  operation.

## Limitations

- Tamper-evident, not tamper-proof: database-owner access could rebuild the chain.
- No external anchoring, retention policy or alerting.
- `commitWithAudit` is atomic, but legacy tenancy server actions still append their
  audit event separately (PARTIAL). Financial writes must use the atomic helper.
- A batch cannot be aborted after a zero-row conditional update; financial state must
  be enforced by constraints/triggers (see FINANCIAL_READINESS.md).
- HTTP-level auth events may lack an actor id.

## Status

Milestone 1.5: implemented and tested (linking, verification, tamper detection,
triggers, redaction, concurrent appends, batch atomicity, tenant-scoped export); live
workerd runs write events to D1 through the same path.
