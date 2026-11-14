# 0019 — Separate capture, payment, allocation and settlement

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

Creators and SMEs receive money through platforms, gateways and banks with delayed,
partial and fee-bearing settlements. Recording the net bank deposit as revenue hides
fees and double-counts when both capture and settlement are stored.

## Decision

1. Model **payment intent/authorization**, **capture**, **payment**, **allocation**,
   **settlement**, **fee** and **bank transaction** as distinct facts.
2. Capture creates a clearing asset (funds due from provider); allocation clears a
   receivable or creates customer credit; settlement moves clearing to bank less
   itemised fees. No step creates revenue a second time.
3. Allocations are immutable, may split a payment across documents or combine
   payments on one document, and are bounded by both the payment amount and the
   document outstanding.
4. Unallocated money is customer credit (liability), never revenue. Overpayment is
   explicit.
5. Refunds, disputes and chargebacks link to the original payment and are cumulative
   limited; they never edit or delete the original.
6. Duplicate provider events use a unique idempotency key; replay returns the existing
   result.
7. Payment execution and live provider integrations are out of scope. Hestian records
   and validates facts; it does not move money.

## Consequences

**Easier:** fees visible; cash vs profit distinguishable; delayed settlement is a
clearing balance; partial/multiple allocations supported; provider replay safe.

**Harder:** more records and states; clearing must be reconciled; refund/chargeback
policy needs accounting review; FX adds rate provenance.

**Forbidden:** net-deposit-as-revenue; editing a payment amount; allocation beyond
the outstanding; deleting a settlement; treating authorization as cash.

## Alternatives considered

- **Single "transaction" row.** Rejected: cannot represent delayed fees, partial
  settlement or disputes without mutating history.
- **Revenue at settlement.** Rejected: wrong under accrual accounting and hides
  receivables.
- **Provider-specific ledger.** Rejected: duplicates the canonical model per provider.

## Follow-ups

- Provider webhook/signature design and durable intake.
- Fee/tax treatment and refund policy with accounting review.
- Add INR and other required currencies to the reviewed registry before implementing
  the ₹ examples.
