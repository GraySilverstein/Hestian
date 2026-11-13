# integrations

**Pillar** Platform · **Layer** platform · **Status** documented

Provider connections and inbound evidence capture. Nothing here interprets
financial meaning; it authenticates, stores evidence and hands it on.

## Owns

- Provider connection records (Stripe, bank feeds, Shopify and others).
- Encrypted credential envelopes; plaintext credentials never touch storage.
- Inbound webhook receipts with provider event identifiers.
- Delivery idempotency keys proving a webhook was already processed.

## Does not own

- Accounting interpretation or journal entries.
- Provider-specific business rules.
- Payment execution or money movement.

## May depend on

`tenancy`, `audit`.

## Invariants

- Webhook delivery is idempotent: the same provider event cannot produce a second
  financial effect.
- Signature verification happens before any state change.
- Credentials are decrypted only inside the operation that needs them.

## Status

Milestone 0: responsibilities and boundaries only. No live provider connection exists.
