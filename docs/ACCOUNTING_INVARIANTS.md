# Accounting invariants

Status: **design specification. None of the accounting invariants is implemented**
except the money/currency primitives marked *partial*. Every invariant below is a
merge gate for the eventual financial core; a feature that cannot state which
invariant it relies on is not ready.

Identifiers FI-01…FI-22 are retained from
[FINANCIAL_INTEGRITY.md](FINANCIAL_INTEGRITY.md); FI-23…FI-34 are added by
Milestone 2. This document is authoritative for definitions and enforcement. The
schema proposal is in [D1_FINANCIAL_SCHEMA_DESIGN.md](D1_FINANCIAL_SCHEMA_DESIGN.md).

---

## 1. What "enforced" means here

An invariant is only *enforced* when all of the following are true:

1. The database rejects a violating write, not merely the UI or a TypeScript type.
2. The application validates the same rule at the boundary with a stable error code.
3. A test attempts the violation against real SQLite and, for concurrency-sensitive
   rules, against workerd/D1.
4. A failure aborts the entire batch and leaves neither a financial row nor an audit
   event.

A rule checked only after a D1 `batch()` is not enforcement: D1 cannot abort a batch
from JavaScript after a zero-row conditional update. The design places the decisive
check inside a trigger or constraint that fires during the batch.

Status values: **documented** (design only), **partial** (some existing primitive),
**verified** (implemented and tested). No accounting invariant is `verified` today.

---

## 2. Invariant catalogue

| ID | Formal definition | Database enforcement | Application enforcement | Failure behaviour | Required tests |
| --- | --- | --- | --- | --- | --- |
| FI-01 | A journal entry has ≥2 lines, ≥2 distinct accounts, every line amount > 0, and Σ debits = Σ credits exactly in the functional currency. | Finalization trigger on `journal_entry` status update; line `CHECK (amount_minor > 0)`; unique `(entry_id,line_no)`. | Posting gate rejects before batch; rule version recorded. | Trigger `RAISE(ABORT)` rolls back the batch; `DomainError UNBALANCED_ENTRY`. | Balanced/unbalanced; one line; same account twice; zero line; property test for random lines. |
| FI-02 | A posted entry and its lines are immutable. No update/delete path exists. | `BEFORE UPDATE/DELETE` triggers on posted entry and any line of a posted entry. | Repository exposes only insert/finalize/reverse. | Abort; no silent correction. | Attempt update/delete via SQL; expect abort. |
| FI-03 | Corrections are a reversal entry linked to the original plus a new entry; the original remains posted and is displayed as reversed, never edited. | `reversal_of_entry_id` unique; posted rows immutable; reversal trigger requires opposite lines and same totals. | Reversal service requires reason, permission, open period. | Reject if original not posted, same entry, or already reversed. | Reverse once; double reverse; mismatched reversal; closed period. |
| FI-04 | A source event/idempotency key produces at most one financial event and one posted entry per business. | `UNIQUE (business_id, source_type, source_key)` on event; `UNIQUE (business_id, idempotency_key)` on entry; `CHECK` posted entries have a key. | Pre-read existing result; on unique conflict re-read and return it. | Duplicate insert aborts batch; caller receives existing result or `CONFLICT`. | Duplicate webhook; retry after response loss; concurrent duplicate. |
| FI-05 | Every posted entry has provenance: a validated source event, or an adjustment event with actor and reason. | `source_event_id`/`adjustment_reason` `CHECK`; FK to event; no orphan. | Posting gate refuses missing provenance. | `MISSING_PROVENANCE`; no write. | Manual entry without reason; event from another business; valid manual adjustment. |
| FI-06 | Every financial mutation and its audit event commit together. | `commitWithAudit` batch; audit insert last; `prev_hash` unique. | All financial writes use the helper. | Any failure rolls back both; chain-head race retries only. | Injected failure; audit missing; chain conflict; workerd run. |
| FI-07 | Every financial record is tenant-scoped; cross-tenant reads/writes are impossible by construction. | `business_id` in every key; composite FKs; no RLS. | Tenant context from membership; all queries carry business id. | Not found/forbidden, never cross-tenant data. | Two-tenant probes for every financial table; forged ids; concurrent probe. |
| FI-08 | An entry may post only into an open period whose dates contain the entry date. | Finalization trigger checks period status and range; period FK includes business. | Posting gate rejects locked/closed/missing. | Abort; `PERIOD_CLOSED`. | Open, locked, closed, wrong date, wrong tenant. |
| FI-09 | Allocations never exceed the payment's settled amount or the document's outstanding amount; allocations are immutable and same-currency. | Triggers on allocation insert/status change; `CHECK` amount > 0; unique active allocation; currency equal. | Allocation service validates and records reason. | Abort; `OVER_ALLOCATED`/`CURRENCY_MISMATCH`. | Partial, full, over, multi-invoice, multi-payment, reversal. |
| FI-10 | Invoice, payment, settlement and revenue remain distinct records. | Separate tables; no denormalised "sales" table; settlement references payment. | Read models explicitly label each. | Reporting rejects collapsing them. | Query tests that revenue is not derived from settlement. |
| FI-11 | Profit, cash, receivables and payables are reported separately and never presented as one number. | Distinct projections/views. | Reporting contracts require labels and periods. | Report fails closed if a component is missing. | Snapshot tests for labels and totals. |
| FI-12 | Tax reserve and tax liability are separate accounts/balances. | Distinct account classifications; no netting rule. | Configuration requires both mappings where tax is enabled. | No combined "tax" figure. | Reserve vs liability reporting; no netting. |
| FI-13 | Forecasts/estimates are never stored or rendered as actuals. | Separate analytical tables; no write grant to financial tables. | Type-level and query separation; source labels. | `FORECAST_NOT_ACTUAL` if mixed. | Attempt to insert forecast into journal via app boundary. |
| FI-14 | Monetary arithmetic uses integer minor units; binary floating point is rejected at the boundary. | `INTEGER` columns; no `REAL` money columns. | `money()`/`parseMoney()`; no `number` amounts. | `INVALID_ARGUMENT`/`AMOUNT_OUT_OF_RANGE`. | Existing money tests; boundary fuzz; no float. **Partial today.** |
| FI-15 | Unresolved reconciliation stays visibly unresolved; confidence never posts. | State `CHECK`; outcome requires evidence links; no auto-post trigger. | Review queue; confidence is advisory only. | `UNRESOLVED`, no financial effect. | Ambiguous match; low confidence; manual approve; rejected match. |
| FI-16 | Restatement is explicit: corrected comparatives carry reason and original reference. | Version/restatement columns; immutable posted entries. | Reporting labels restatements. | Missing reason rejected. | Correct prior period; comparative label. |
| FI-17 | Journal lines use positive amounts plus an explicit direction; a negative amount is not a debit. | `CHECK (amount_minor > 0)` and `direction IN ('debit','credit')`. | Line constructor rejects negatives. | Constraint abort. | Negative line; missing direction. |
| FI-18 | Currency is explicit; mixing currencies without an FX fact is rejected. | `currency` NOT NULL; allocation/settlement currency checks; account/entry currency consistency. | Money operations and posting gate reject mismatch. | `CURRENCY_MISMATCH`. | Mixed-currency entry/allocation; valid FX line. **Partial today.** |
| FI-19 | Balances are reproducible from posted entries; a cache is never authoritative. | Rebuild query; no write path to a cache used for decisions. | Reporting recomputes or verifies cache. | Cache mismatch triggers rebuild/alert, never override. | Recompute after reversal/adjustment; cache corruption. |
| FI-20 | Financial records are not deleted as a correction; removal follows retention policy and is audited. | No delete grants/triggers; audit event for any retention removal. | Retention service requires policy and approval. | Delete rejected in normal path. | Attempt delete; approved retention removal. |
| FI-21 | Missing evidence, permission, period state or balance fails closed. | Constraints/triggers plus FK/NOT NULL. | `Result`/`DomainError`; deny by default. | No partial write; stable error code. | Each missing precondition; unauthorized actor. |
| FI-22 | Postings and reconciliation outcomes record the rule/interpretation version that produced them. | `rule_version`/`interpretation_version` NOT NULL on posted records. | Rule registry passes version. | Reject missing version. | Version recorded; rule change does not rewrite history. |
| FI-23 | A journal entry cannot be finalized twice, and a reversal cannot target itself or a non-posted entry. | Finalization trigger checks `OLD.status='draft'`; reversal FK/unique; status transition trigger. | Service checks state and reason. | Abort; `INVALID_STATE`. | Double finalize; self-reversal; reversal of draft. |
| FI-24 | Periods do not overlap for one business, and every posted entry falls inside exactly one period. | `BEFORE INSERT/UPDATE` period overlap trigger; entry/period date trigger. | Period service validates before write. | Abort; `PERIOD_OVERLAP`. | Adjacent, overlapping, duplicate boundary dates. |
| FI-25 | A settlement has gross = net + fees exactly, references one payment, and clears the matching clearing amount. | `CHECK (gross_minor = net_minor + fee_minor)`; FK payment; provider reference unique per business. | Settlement service validates provider evidence. | Abort; `SETTLEMENT_MISMATCH`. | Gross/net/fee; negative fee; duplicate provider ref. |
| FI-26 | Source evidence never becomes accounting without a validated financial event. | Evidence tables have no debit/credit columns; journal FK requires event. | Ingest/parse cannot call posting; explicit validation step. | Evidence remains non-authoritative. | Ingest statement; assert no journal. |
| FI-27 | Reconciliation confidence cannot authorize a posting or match by itself. | No confidence column grant to posting; outcome requires actor/evidence. | Thresholds are review hints only. | Low confidence stays unresolved. | 99% confidence still requires review/approval. |
| FI-28 | A refund/chargeback cannot exceed the captured/remaining amount and must link to the original payment. | Trigger checks cumulative refunds/chargebacks; FK to payment; unique source event. | Service validates original state and reason. | Abort; `REFUND_EXCEEDS_PAYMENT`. | Partial refunds, full refund, duplicate chargeback. |
| FI-29 | An account cannot receive lines unless it is postable, active, belongs to the business, and its classification has not changed since posting. | Composite FK `(account_id,business_id)`; trigger checks `is_postable/status`; classification update trigger. | Account service validates. | Abort; `ACCOUNT_NOT_POSTABLE`/`TENANT_MISMATCH`. | Parent account; archived account; other business; classification change. |
| FI-30 | Functional currency and accounting basis are immutable once a posted entry exists; every amount declares a supported currency. | Business config trigger; currency `CHECK`/reference table. | Onboarding sets once; change requires a controlled new policy. | Reject change; `BOOKS_CONFIG_IMMUTABLE`. | Change currency/basis before/after posting; unsupported currency. |
| FI-31 | Invoice/credit/bill numbering is unique per business and issuance is idempotent. | Unique `(business_id, document_type, number)`; unique source key; status transition triggers. | Sequence allocator; retry returns existing document. | Duplicate abort; gap policy documented. | Concurrent issuance; replay; void/reissue. |
| FI-32 | FX postings retain rate, rate date and source; functional amounts sum exactly and realised/unrealised treatment is explicit. | Rate fields NOT NULL for foreign lines; `CHECK` positive rate; functional total trigger. | FX policy service supplies rate; no inferred rate. | Reject missing/invalid rate; `FX_RATE_REQUIRED`. | Same-currency, foreign, rounding boundary, missing rate. |
| FI-33 | Opening balances are posted entries with provenance, not mutable columns; closing figures derive from posted entries. | No opening/closing balance columns; provenance FK. | Opening service posts; closing report recomputes. | Reject direct balance write. | Opening entry; reversal; recompute close. |
| FI-34 | An entry cannot reference a period, account, event, party or document from another business. | Composite FKs carrying `business_id`; unique `(id,business_id)` on parents. | Tenant context; repository guards. | Constraint abort; not found. | Every cross-tenant reference; concurrent probe. |

---

## 3. Enforcement layers

### 3.1 Database is the last line

The database must reject, not merely record, violations:

- `CHECK` constraints for enums, positive amounts, currency equality and
  gross/net/fee identity.
- `UNIQUE` constraints for idempotency, document numbers, provider references, and
  one active allocation per source.
- Composite foreign keys `(id, business_id)` so a line cannot reference an account
  or entry in another tenant.
- `BEFORE UPDATE/DELETE` triggers on posted journal entries and lines.
- A finalization trigger that checks balance, line count, distinct accounts, period
  status/date and account postability in one place.
- Allocation/refund triggers that sum active rows before accepting a new row.
- Period-overlap triggers.

Triggers run inside the D1 batch transaction and can see rows inserted earlier in the
same batch. If a trigger raises, the batch rolls back. This is why the decisive
checks belong there, not in JavaScript after `batch()`.

### 3.2 Application is the first line

The application still validates every rule to produce a stable, non-leaking error and
to avoid pointless writes. It must:

- derive tenant context from membership, never from a request body;
- authorize the actor for the operation and period;
- require provenance and a rule version;
- construct positive lines with explicit currency/direction;
- use `commitWithAudit` for the finalize/reverse/allocation write;
- return `Result` for expected failures and `DomainError` for invariant violations.

Application checks are not accepted as proof. A missing database check is a defect
even if the service currently validates it.

### 3.3 Tests are the proof

Minimum suite before any financial feature is called implemented:

1. Constraint tests against real SQLite for every `CHECK`, unique and trigger.
2. Failure-injection tests proving the batch leaves no entry, line or audit row.
3. Two-tenant probes for every relationship, including forged parent ids.
4. Property tests for balance, allocation and rounding (generated amounts).
5. Workerd/D1 tests for trigger behaviour and duplicate delivery, not only the
   Node SQLite adapter.
6. A migration test on a populated database.
7. Restore rehearsal before real tenant data exists.

---

## 4. The zero-row limitation, stated precisely

D1 `batch()` is atomic: a failing statement rolls the sequence back. It does **not**
fail when an `UPDATE … WHERE` matches zero rows. Therefore:

- Never use a conditional update as the only guard for a financial state transition.
- Finalization updates by primary key and relies on the trigger to reject an already
  posted/reversed entry; a missing row is impossible for a row inserted earlier in
  the same batch.
- Allocation/refund checks use triggers that compute sums and `RAISE(ABORT)`.
- After a batch, `meta.changes` may be inspected for diagnostics, but not as the
  mechanism that protects correctness.

A draft entry left by an interrupted client is non-authoritative. It must never be
read as a balance and should be cleaned up by an audited maintenance path.

---

## 5. Invariant-to-feature gate

| Feature | Must satisfy |
| --- | --- |
| Chart of accounts | FI-07, FI-29, FI-30, FI-34 |
| Journal posting | FI-01…FI-08, FI-17, FI-19, FI-22, FI-23, FI-24, FI-34 |
| Invoice/credit note | FI-04, FI-05, FI-09, FI-25, FI-31, FI-34 |
| Payment/allocation/refund | FI-04, FI-09, FI-25, FI-28, FI-34 |
| Settlement | FI-10, FI-25, FI-32, FI-34 |
| Evidence/reconciliation | FI-15, FI-26, FI-27 |
| Period close/reopen | FI-08, FI-16, FI-24 |
| Reporting | FI-11, FI-12, FI-13, FI-19 |
| AI/analytics | FI-13, FI-19, FI-27; never FI-01…FI-08 writes |

No feature may be declared complete while an applicable invariant is only
"documented" in this table.

---

## 6. Status and next proof

This milestone does not implement any invariant. The next implementation step must
start with the schema, triggers and failing tests (red), then the repository and
posting gate (green), then workerd verification. Do not write a posting service first
and add constraints later; that order is how unbalanced rows become possible.
