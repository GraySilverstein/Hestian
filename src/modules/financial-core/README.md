# financial-core

**Pillar** Core · **Layer** financial-authority · **Status** documented

The only module permitted to create authoritative financial state. If a number
appears on a balance sheet, it came from here.

## Owns

- Chart of accounts and account classification.
- Journal entries, posting rules and posting validation.
- Invoices, credit notes and receivables.
- Payments, allocations and settlement state.
- Payables and cash positions.
- Accounting periods as they apply to postings.

## Does not own

- Marketing performance or campaign spend plans (see `growth`).
- Forecasts, predictions or recommendations (see `intelligence`).
- Bank connectivity (see `integrations`) and matching (see `reconciliation`).
- Tax rule interpretation; applicable rules must be researched and validated
  before any implementation.

## May depend on

`tenancy`, `audit`. Nothing else. In particular, no analytical module may be
imported here, so an AI output cannot reach the journal.

## Invariants

- Every entry is balanced: debits equal credits, exactly, in integer minor units.
- Posted entries are immutable; correction is a new reversal plus adjustment.
- Every entry carries tenant, period, provenance and an idempotency key.
- AI never posts, amends, reconciles or releases money.

## Status

Milestone 0: responsibilities and boundaries only. No accounting engine, schema or
posting code exists yet.
