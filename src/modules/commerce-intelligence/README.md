# commerce-intelligence

**Pillar** Growth · **Layer** analytical · **Status** documented

Commercial signals from the store side: what sells, at what margin, and which
customers are worth serving again.

## Owns

- Store performance analysis by product and period.
- Product margin observations with stated cost basis.
- Customer value analysis.

## Does not own

- Commerce platform credentials (see `integrations`).
- Order fulfilment or inventory operations.
- Journal entries or revenue recognition.

## May depend on

`tenancy`, `audit`, `growth`.

## Invariants

- Observations declare their window, currency and source; no mixed-currency totals.
- Derived metrics are reproducible from stored inputs.
- Conclusions never overwrite source measurements.

## Status

Milestone 0: responsibilities and boundaries only. No Shopify integration exists.
