# Domain model

Status: Milestone 1 design sketch, retained for history. **Milestone 2 canonical
documents are authoritative where they differ:**
[CANONICAL_DOMAIN_MODEL.md](CANONICAL_DOMAIN_MODEL.md),
[FINANCIAL_DOMAIN_MODEL.md](FINANCIAL_DOMAIN_MODEL.md),
[ACCOUNTING_INVARIANTS.md](ACCOUNTING_INVARIANTS.md),
[D1_FINANCIAL_SCHEMA_DESIGN.md](D1_FINANCIAL_SCHEMA_DESIGN.md). No persistence
schema for these records exists.

---

## 1. Conventions

- **Identifiers** are opaque strings, branded by type (`TenantId`, `AccountId`,
  `JournalEntryId`, …) and parsed once at a boundary. They are never sequential
  integers, so an identifier cannot be guessed by incrementing.
- **Money** is `{ currency: ISO 4217, amountMinor: bigint }`. Minor units are
  integers; the safe range is ±2^53−1 so every value round-trips through SQLite
  and JSON exactly. Serialised form uses decimal strings.
- **Time** is UTC, stored as ISO-8601 or epoch milliseconds. Business dates
  (period, invoice date) are calendar dates without time zones, stored
  separately from timestamps.
- **Every tenant-scoped aggregate** carries `tenantId`. Tenancy is not a filter
  applied at query time; it is part of identity.

## 2. Platform contexts

### Tenant (business)

The unit of ownership, entitlement and isolation. A tenant has a functional
currency, a fiscal calendar (planned), a chart of accounts and members.

Aggregate: `Tenant` — root. Invariants: functional currency is immutable once
financial records exist; archival is not deletion.

### Membership

Links a verified `UserId` to a `TenantId` with one role. Roles: `owner`,
`accountant`, `employee`, `contractor`, `agency`. Resource-level grants may
narrow a role but never widen it beyond the role's ceiling.

Invariants: at least one `owner` per tenant; removing the last owner is rejected;
a membership change is audited.

### Audit event

Append-only fact: `{ tenantId, actorUserId?, action, targetRef, outcome,
correlationId, occurredAt, metadata }`. No update or delete path.

## 3. Evidence (Layer A)

### Source evidence

An immutable record of something that arrived from outside Hestian or was
uploaded by a human: a provider transaction, an invoice PDF, a statement line, a
webhook delivery, an email receipt.

Key fields (intended): `evidenceId`, `tenantId`, `source` (provider or manual),
`providerObjectId`, `receivedAt`, `contentHash`, `payloadRef` (R2 key), `status`
(`received` → `parsed` | `unreadable`), `supersedesEvidenceId?`.

Invariants:

- An evidence record is never edited. A correction is a new record that
  supersedes the old one.
- `contentHash` makes duplicate ingestion detectable.
- Evidence is not itself accounting. It has no debit or credit.

### Inbound delivery

A webhook receipt keyed by `(provider, providerEventId)`, giving idempotency for
retries. It records the verification outcome; an unverified delivery is stored
but cannot cause a financial effect.

## 4. Accounting authority (Layer B)

### Account and chart of accounts

`Account { accountId, tenantId, code, name, type, normalBalance, parentAccountId?, isPostable }`
where type ∈ {asset, liability, equity, revenue, expense}.

Invariants: codes unique per tenant; a non-postable parent cannot receive lines;
an account's type cannot change after it has postings; deactivation instead of
deletion.

### Accounting period

`AccountingPeriod { periodId, tenantId, startDate, endDate, state }` with state
`open` → `locked` → `closed`. Locking rejects new postings; closing is final for
reporting. Reopening is an explicit, audited action with permission, never an
implicit side effect.

### Financial event

A validated business fact that is safe to translate into accounting:
`invoice.issued`, `payment.received`, `payment.refunded`, `fee.charged`,
`bill.received`, `bill.paid`, `adjustment.recorded`, `chargeback.received`.

Fields: `eventId`, `tenantId`, `type`, `occurredAt`, `amounts`, `currency`,
`evidenceRefs[]`, `idempotencyKey`, `interpretationVersion`.

Invariants: the idempotency key is unique per tenant and event type; replaying the
same event yields the existing result, never a second posting.

### Journal entry

`JournalEntry { entryId, tenantId, periodId, postedAt, description,
sourceEventId?, reversalOfEntryId?, status }` with `status` ∈ {`draft`,
`posted`}. `reversed` is derived from a posted reversal entry; posted rows are
never edited (Milestone 2).

Lines: `{ accountId, direction: debit|credit, amount: Money }` plus optional
dimensions (project, campaign, counterparty) that never affect balance.

Invariants:

- Sum of debits equals sum of credits, exactly, in the same currency.
- An entry has at least two lines and every line is non-zero.
- A posted entry is immutable; correction is `reversalOfEntryId` plus a new entry.
- A `draft` has no effect on balances.
- An entry always has provenance: a `sourceEventId`, or an explicit manual
  justification recorded as an adjustment event.

### Invoice

`Invoice { invoiceId, tenantId, number, counterpartyId, issueDate, dueDate,
currency, lines[], status, taxTreatment? }`.

Lines: `{ description, quantity, unitPrice: Money, taxCode?, accountId }`.
Derived: `subtotal`, `taxTotal`, `total`, `amountPaid`, `amountDue`.

Status: `draft` → `issued` → (`partially_paid` →) `paid`, with `void` reachable
from `draft`/`issued` when nothing is allocated, and `overdue` as a derived flag,
not a stored terminal state.

Invariants: numbering is unique per tenant; any gap policy is explicit and
audited (not silently "gapless" under concurrency). Issued invoices are immutable
except through credit notes; `amountPaid` never exceeds `total` without an
explicit overpayment record.

### Payment, allocation and settlement

`Payment { paymentId, tenantId, direction: inbound|outbound, amount, currency,
receivedAt, method, providerRef?, status }`.

Status (Milestone 1 sketch; superseded by the Milestone 2 lifecycle):
`initiated → authorized → captured → settled`, with `failed`, `returned`,
`refunded` and `charged_back` as related outcomes. Capture, payment, settlement
and fee are distinct facts.

`Allocation { allocationId, tenantId, paymentId, invoiceId, amount }` links a
payment to an invoice (or to a bill for outbound direction). A payment may be
allocated across several invoices; an invoice may receive several payments.
Unallocated remainder is held as a credit balance, never silently applied.

Invariant: the sum of allocations for a payment never exceeds its settled amount;
the sum of allocations for an invoice never exceeds its total.

**Separation to preserve:** invoice ≠ payment ≠ settlement ≠ revenue. Revenue is
recognised by accounting policy; cash movement is a settlement; receivables are a
balance. These must never be collapsed into one "sales" figure.

### Reconciliation item

`ReconciliationItem { itemId, tenantId, evidenceId, candidateEventIds[],
state, outcomeId? }` with state `unmatched` → `candidate` → `matched`, or
`unresolved`, and `reopened` after reversal.

Invariants: matching requires evidence references; multiple plausible candidates
produce an `unresolved` review item rather than a guess; outcomes are reversible
only by an audited reversal.

## 5. Operations (Layer operational)

`Person` (employee or contractor), `Assignment`, `Project`, `Deliverable`,
`WorkflowRun`, `Approval`, `ProjectCost`.

Invariants: an approval is explicit state (`pending` → `approved` | `rejected`),
never inferred from silence; project costs are operational inputs and become
accounting facts only through a financial event in `financial-core`.

## 6. Growth and commerce intelligence (Layer C)

`Campaign`, `MarketingBudgetPlan`, `ChannelMeasurement`, `ProfitabilityModel`,
`StorePerformanceObservation`, `ProductMarginObservation`, `CustomerValueAnalysis`.

Invariants: every measurement declares its window, currency and source; plans are
dated and versioned; missing spend is `unknown`, not zero; margin observations
carry their cost basis.

## 7. Intelligence (Layer C)

`AnalysisResult`, `Forecast`, `Recommendation`, `EvidenceCitation`.

Invariants: a forecast is a distinct type from an actual and cannot be rendered
or stored as one; recommendations cite evidence or are marked unsupported;
nothing here is a write path into Layer B.

## 8. Relationships

```
SourceEvidence ──┐
                 ├─► FinancialEvent ──► JournalEntry ──► JournalLine ──► Account
InboundDelivery ─┘            │                    │
                              │                    └─► AccountingPeriod
                              ▼
                          Invoice ──► Allocation ◄── Payment ──► Settlement
                              │
                              └─► Receivable balance

ProjectCost ──► (request) ──► FinancialEvent
CampaignMeasurement ──(read)──► ProfitabilityModel ──(read-only)──► Forecast
```

Layer C nodes are read-only consumers; the arrow into `FinancialEvent` from
operations is a request that `financial-core` validates and may reject.

## 9. Lifecycle reference

| Aggregate | States |
| --- | --- |
| Journal entry | `draft` → `posted`; `reversed` derived from a linked reversal |
| Invoice | `draft` → `issued` → `partially_paid` → `paid`; `void`; `overdue` (derived) |
| Payment | `initiated` → `authorized` → `captured` → `settled`; `failed`, `returned`; refunds/chargebacks are linked records |
| Period | `open` → `locked` → `closed` |
| Reconciliation item | `unmatched` → `candidate` → `matched` / `unresolved` → `reopened` |
| Approval | `pending` → `approved` / `rejected` / `expired` |

## 10. Deliberately undefined at this stage

- Jurisdiction-specific tax codes, rates and filing rules.
- Revenue recognition policy (IFRS 15 / ASC 606 / local equivalents).
- Inventory and cost-of-goods methods.
- FX rate sources and revaluation policy.
- Rounding policy for fractional multiplication, allocation remainders and tax.
- Payroll and contractor withholding.

These require research and validation before implementation. Do not infer them
from this document.
