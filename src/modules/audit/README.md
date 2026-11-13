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
| `verifyAuditChain(db)` | Recomputes hashes and linkage; reports the first break. |
| `listAuditEvents(db, businessId, limit)` | Tenant-scoped read for future UI. |
| `ACTIONS` | Fixed action names, so strings do not drift. |

## Invariants

- Events are append-only: database triggers reject `UPDATE` and `DELETE`.
- The chain is serialised by a unique `prev_hash`; a racing writer retries.
- Metadata is redacted before hashing; no password, token or email is stored.
- A failed audit write surfaces as an error; the caller decides whether to fail the
  operation.

## Limitations

- Tamper-evident, not tamper-proof: database-owner access could rebuild the chain.
- No external anchoring, retention policy, export or alerting.
- Audited action and audit row are not atomic on D1; a crash between them is possible.
- HTTP-level auth events may lack an actor id.

## Status

Milestone 1: implemented and tested (linking, verification, tamper detection,
triggers, redaction, concurrent appends); live workerd runs write events to D1.
