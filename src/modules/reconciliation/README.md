# reconciliation

**Pillar** Core · **Layer** financial-authority · **Status** documented

Matches source evidence to accounting state using verified evidence, and keeps
everything it cannot explain visibly unresolved.

## Owns

- Match candidates between evidence and financial events.
- Reconciliation outcomes with their evidence references.
- Unresolved item queues and ageing.
- Links from reconciliation outcomes to journal entries.

## Does not own

- Capturing source evidence (see `integrations`).
- Deciding what a transaction means accounting-wise (see `financial-core`).
- Producing forecasts from gaps (see `intelligence`).

## May depend on

`tenancy`, `audit`, `financial-core`.

## Invariants

- Reconciliation requires evidence. A suggestion alone never marks an item reconciled.
- Ambiguity is surfaced, never guessed: multiple plausible matches become a review item.
- A reconciled item can be reopened by explicit, audited reversal of the outcome.

## Status

Milestone 0: responsibilities and boundaries only.
