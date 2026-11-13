# intelligence

**Pillar** Intelligence · **Layer** analytical · **Status** documented

Evidence-grounded analysis and decision support. Advisory by construction: this
module reads, reasons and cites, and cannot move money or mutate the books.

## Owns

- Analysis results and their inputs.
- Forecasts, always labelled as forecasts and never stored as actuals.
- Recommendations with evidence citations and confidence notes.
- Interpretation of performance for humans.

## Does not own

- Journal entries, reconciliation outcomes, payment execution.
- Permission decisions or identity.
- Any write path into `financial-core`.

## May depend on

`tenancy`, `audit`, and read-only exports of `financial-core`, `reconciliation`,
`business-operations`, `growth` and `commerce-intelligence`.

## Invariants

- Every claim cites retrievable evidence or is marked as unsupported.
- A forecast never appears in an actuals view, balance, or reconciliation.
- Absent or contradictory evidence produces an explicit gap, not a plausible guess.
- Recommendations are proposals; acting on them requires a human-authorized operation
  in the owning module.

## Status

Milestone 0: responsibilities and boundaries only. No model integration exists.
