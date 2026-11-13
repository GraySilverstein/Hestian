# growth

**Pillar** Growth · **Layer** analytical · **Status** documented

Hestian Growth: Talos-derived marketing and commerce intelligence. Talos
capabilities are preserved conceptually here; the product name Talos is retired,
not the thinking behind it.

## Owns

- Campaign records and their lifecycle.
- Marketing budget plans, as plans rather than posted commitments.
- Channel and social performance measurements.
- Campaign profitability models and their stated assumptions.

## Does not own

- Authoritative journal entries or account balances.
- Store checkout or order fulfilment.
- Social publishing or ad platform execution.
- AI recommendations (see `intelligence`).

## May depend on

`tenancy`, `audit`, `financial-core` (read-only financial facts through exported
contracts). Being analytical, nothing outside the analytical layer may import it.

## Invariants

- Spend recorded here is a plan or measurement, never a journal entry.
- Every profitability figure cites the period, currency and evidence it came from.
- Missing spend data is reported as missing, not treated as zero.

## Status

Milestone 0: responsibilities and boundaries only. No Talos code has been imported.
