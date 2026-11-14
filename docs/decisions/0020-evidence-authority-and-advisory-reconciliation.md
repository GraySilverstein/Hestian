# 0020 — Evidence is not authority; reconciliation is advisory until reviewed

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

Bank statements, platform reports, receipts and webhooks are external assertions.
They can be wrong, duplicated, incomplete or malicious. Automatically turning them
into accounting records would make external errors authoritative and let a matching
score bypass controls.

## Decision

1. Preserve three layers: **source evidence** (append-only, no debit/credit),
   **financial authority** (validated events, journal, documents) and **intelligence**
   (derived, never authoritative).
2. Evidence is immutable; corrections supersede it. Provider ids and content hashes
   detect duplicates. Signature/verification status is recorded.
3. A financial event is the only bridge from evidence/operations to posting. It
   carries idempotency, provenance and rule version and passes the full posting gate.
4. Reconciliation proposes candidates and records reviewed outcomes. States are
   explicit: `unmatched → candidate → matched` or `unresolved`; reopening is an
   audited reversal.
5. Confidence is advisory metadata (0–100) for ordering. It never authorizes a match
   or a posting; ambiguous matches stay unresolved.
6. Reconciliation may request an adjustment; it may not write the journal directly.
7. Unresolved/discrepant items remain visible and aged; no silent suspense plug.

## Consequences

**Easier:** external errors cannot post directly; provenance is queryable; duplicate
imports are detectable; reviewers see why a candidate matched.

**Harder:** more review work; ingestion needs verification and parsing; unresolved
queues are a product surface; evidence retention and R2 access must be designed.

**Forbidden:** evidence rows with debit/credit; auto-posting on confidence; deleting
unresolved items; netting discrepancies into revenue; AI-authorized matches.

## Alternatives considered

- **Auto-post exact matches.** Rejected: exact references can still be duplicated or
  fraudulent, and the accounting policy for fees/timing may differ.
- **Treat provider net deposits as revenue.** Rejected: hides fees and gross revenue.
- **Store evidence inside the journal.** Rejected: confuses proof with authority.

## Follow-ups

- Provider verification/parsers and signature schemes.
- Reconciliation queue UX and aging/alerting.
- Retention/legal hold for evidence.
- Workerd tests for duplicate delivery and review audit.
