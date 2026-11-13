# Financial integrity

Status: architectural invariants documented; **none of the accounting engine is
implemented**. Each invariant states how it will be enforced and whether that
enforcement exists.

Read this before writing any code that touches money, invoices, payments,
periods or reconciliation.

---

## 1. The authority boundary

Three layers exist, and only one of them may change financial truth.

| Layer | Who writes it | Mutability |
| --- | --- | --- |
| A. Source evidence | integrations, human uploads | append-only; supersede, never edit |
| B. Accounting authority | `financial-core`, `reconciliation` | append-only after posting; reverse and re-enter |
| C. Business intelligence | `growth`, `commerce-intelligence`, `intelligence` | recomputable, disposable, never authoritative |

Layer C may read A and B through exported read contracts. It may never obtain a
write path to either. This is enforced statically: `financial-core` may depend
only on `tenancy` and `audit`, no non-analytical layer may import an analytical
module, and `intelligence` is imported by nothing.

### Who may do what

| Actor | Create journal entry | Post | Reconcile | Execute payment | Approve payment |
| --- | --- | --- | --- | --- | --- |
| Deterministic posting engine (rules) | yes, from validated events | yes | no | no | no |
| Accountant role | yes | yes, within open period | yes, with evidence | no | no |
| Owner role | yes | yes | yes | only with explicit confirmation and step-up | yes |
| Employee / contractor / agency | no | no | no | no | no |
| Integration webhook | no — evidence only | no | no | no | no |
| AI / intelligence module | **never** | **never** | **never** | **never** | **never** |

"AI must never" is not a policy statement alone; it is an architectural
constraint: no analytical module is reachable from `financial-core`, and no
module exposes a financial write function that accepts a model-authored payload.

## 2. Invariants

Each invariant has an identifier for use in tests, reviews and incident reports.
Enforcement status values: **documented** (this milestone), **planned**
(scheduled in the roadmap), **enforced** (implemented and tested).

| ID | Invariant | Enforcement | Status |
| --- | --- | --- | --- |
| FI-01 | Every journal entry is double-entry: at least two lines, each on a different account, debits and credits equal exactly. | Domain gate + `CHECK`/constraint strategy + property tests | documented |
| FI-02 | Posted entries are immutable. No update or delete path exists in the module's surface. | API design, repository has no update, database permissions/triggers | documented |
| FI-03 | Corrections are a reversal entry plus a new entry, linked to the original. | Domain rule; reversal requires a reason; both audited | documented |
| FI-04 | Financial event processing is idempotent per tenant and idempotency key. | Unique constraint + "return existing result" semantics | documented |
| FI-05 | Every posted entry carries source provenance (evidence or explicit manual justification). | Non-null provenance reference; manual entries require an adjustment event | documented |
| FI-06 | Every financial state transition writes an audit event in the same transaction. | Transactional write; absence of audit aborts the operation | documented |
| FI-07 | Every financial record carries a tenant id, and cross-tenant access is impossible by construction. | Tenant-scoped keys, query-layer enforcement, two-tenant test suite | documented |
| FI-08 | Accounting periods are explicit; posting into a locked or closed period is rejected. | Period state check in the posting gate | documented |
| FI-09 | A payment may be allocated across several invoices, and an invoice may receive several payments, without exceeding either total. | Allocation invariant check + database constraint | documented |
| FI-10 | Invoice, payment, settlement and revenue remain distinct records. | Separate aggregates; no denormalised "sales" ledger | documented |
| FI-11 | Profit, cash and receivables are reported separately and never presented as one number. | Reporting contracts with explicit labels | documented |
| FI-12 | Tax reserves and tax liabilities are separate balances. | Distinct accounts and configuration; no netting | documented |
| FI-13 | Forecasts are never stored as actual transactions, and cannot be rendered in an actuals view. | Separate types/tables; query contracts exclude forecasts | documented |
| FI-14 | Monetary arithmetic uses integer minor units; binary floating point is rejected at the boundary. | `src/core/money.ts` (implemented) + repository type rules | partially enforced |
| FI-15 | Unresolved reconciliation stays visibly unresolved; ambiguity is never resolved by guessing. | Explicit `unresolved` state + review queue | documented |
| FI-16 | Historical restatement is never silent: corrected comparatives are labelled with the reason and the original. | Reporting version metadata + audit | documented |
| FI-17 | Posted amounts are non-negative line amounts with an explicit direction; a negative "amount" is not a debit. | Line model `{direction, amount}` | documented |
| FI-18 | Currency is explicit per amount; mixing currencies without an explicit FX fact is rejected. | `Money` operations throw `CURRENCY_MISMATCH` (implemented) | partially enforced |
| FI-19 | Sums and balances are derivable and reproducible from posted entries at any time. | Recompute tests; no cached balance treated as authoritative | documented |
| FI-20 | Deletion of financial records is not a correction. Retention rules govern removal, and removal is audited. | Soft state + retention policy; no delete permission on books | documented |
| FI-21 | An operation that cannot verify evidence, permission, period state or balance fails closed. | `Result`/`DomainError` conventions; deny-by-default authorization | documented |
| FI-22 | Reconciliation outcomes and postings record which rules version produced them. | `interpretationVersion` on events and outcomes | documented |

## 3. Money

- Amounts are integer minor units held as `bigint`; no floating point anywhere in
  the financial path, including aggregates, allocations and tax.
- The representable range is ±(2^53−1) so values survive SQLite `INTEGER` and JSON
  number boundaries unchanged. Values outside it are rejected, not rounded.
- JSON contracts carry amounts as decimal strings (`"amountMinor": "125000"`).
  A JavaScript number is never the wire format for an amount.
- Fractional multiplication, percentage splits, pro-rata allocation and currency
  conversion require an explicit rounding policy. Until that decision exists,
  such operations are unavailable (see ADR 0003).
- Formatting for display is a presentation concern and must not change the
  underlying value.

## 4. Posting rules and validation gates

A posting operation must pass, in order:

1. **Authentication** — a verified subject exists.
2. **Authorization** — the subject holds a role permitted to post for this tenant.
3. **Tenant scope** — every referenced record belongs to that tenant.
4. **Period state** — the target period is open.
5. **Provenance** — evidence or a recorded manual justification is attached.
6. **Interpretation** — a deterministic rule maps the event to accounts and
   amounts; no model output participates.
7. **Balance** — debits equal credits exactly, per currency.
8. **Non-zero lines** — no zero-amount or single-line entries.
9. **Idempotency** — the event key has not been processed before.
10. **Audit** — the event is recorded in the same transaction.

Any failed step aborts; nothing is written partially.

## 5. Reconciliation

- Reconciliation consumes evidence (Layer A) and accounting state (Layer B); it
  produces outcomes, never new postings by itself. A posting that a match implies
  is made through the normal posting gate.
- A match requires verifiable evidence references. Confidence scores are advisory
  metadata, not authorization.
- One evidence record and one financial event can each participate in only one
  active match per direction; attempts to double-match are rejected.
- Items that cannot be matched remain `unresolved` with an age, owner and reason.
  Dashboards must show them; they may not be hidden behind a status filter.
- Reopening a match is an audited reversal, not an edit.

## 6. Periods, corrections and restatement

- Periods move `open` → `locked` → `closed`. Locking blocks new postings;
  closing freezes reporting. Reopening requires a privileged, audited action.
- Corrections to a locked or closed period are posted in the current open period
  as adjusting entries unless a formally approved reopen exists.
- A comparative figure that changes is presented with its restatement reason and
  a link to the superseding entry. Silent restatement is a defect (FI-16).

## 7. Tax

- Tax reserved from revenue and tax owed to an authority are different balances
  (FI-12).
- No jurisdiction, rate, threshold or filing rule is encoded in this repository.
  Tax behaviour must be researched against primary sources, validated with a
  qualified professional, and introduced behind an explicit, versioned rule set.
- "Do not invent accounting standards" applies here literally: unclear treatment
  produces an unresolved item for review, not an assumption.

## 8. Future event types to design for

Not implemented, but the model must not preclude them:

- **Refund** — reverses a settlement, may or may not reverse revenue.
- **Chargeback / dispute** — conditional liability with fees and deadlines.
- **Failed payment** — no cash movement; may remove an allocation.
- **Overpayment** — customer credit balance, not revenue.
- **Credit note** — reverses all or part of an issued invoice.
- **Settlement fee** — expense and net-cash difference, recorded separately.
- **Foreign exchange** — requires rate source, rate date, and realised/unrealised
  treatment decisions.
- **Write-off** — bad debt treatment, requires approval and evidence.

Each needs its own invariant set and tests before implementation.

## 9. What is not claimed

This document does not assert compliance with any accounting standard, tax
regime or audit framework. It defines internal integrity properties. Compliance
claims require separate, jurisdiction-specific validation.
