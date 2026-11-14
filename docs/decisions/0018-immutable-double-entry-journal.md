# 0018 — Immutable double-entry journal with controlled periods

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

The financial core needs a representation that remains correct under D1's lack of
interactive transactions and cannot be silently edited. Mutable balances and
read-modify-write posting are the main corruption risks.

## Decision

1. **Double-entry only.** Every posted journal entry has at least two lines, at least
   two distinct accounts, positive line amounts with an explicit debit/credit
   direction, and debits equal credits exactly in the functional currency.
2. **Append-only authority.** Posted entries and lines reject update/delete. A
   correction is a new reversal entry linked to the original plus a new entry; the
   original is never edited. `reversed` is derived from the posted reversal link.
3. **Draft is non-authoritative.** A draft entry has no effect. Finalization is a
   status update that fires a database trigger checking balance, accounts, currency,
   provenance and period state.
4. **Balances are derived.** No authoritative mutable balance row is required.
   Reporting may cache a projection only if it is rebuildable and verified against
   the journal.
5. **Explicit periods.** Every entry belongs to an open period containing its date.
   Periods may not overlap; locking/closing/reopening is privileged and audited.
6. **Provenance and rule version.** Every posted entry has a source event or an
   explicit adjustment reason, plus the rule version that produced it.
7. **One batch.** Entry, lines, finalization and audit are submitted in one
   `commitWithAudit` batch.

## Consequences

**Easier:** corrections are traceable; no lost balance updates; balances reproducible;
period control is explicit.

**Harder:** every correction is two entries; reporting must aggregate lines; a
malformed draft can remain but cannot affect balances; the finalization trigger is
complex and must be tested in workerd.

**Forbidden:** editing/deleting posted rows; negative line amounts; single-line
entries; posting into a closed period; computing an authoritative balance in
JavaScript and writing it back.

## Alternatives considered

- **Mutable account balances with version checks.** Rejected as the initial design:
  D1 cannot abort a zero-row conditional update from JavaScript, and a lost update is
  a silent accounting error.
- **Event sourcing without a journal.** Rejected: accounting needs auditable
  double-entry facts, not only domain events.
- **Reversal by editing the original.** Rejected: destroys auditability.

## Follow-ups

- Implement the schema and failing invariant tests before the posting service.
- Verify trigger behaviour in workerd/D1.
- Decide the retained-earnings/close-entry policy with accounting review.
