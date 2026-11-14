# Financial evidence and reconciliation

Status: **design only.** Milestone 1 established three layers conceptually; this
document defines the records and rules for evidence intake and reconciliation. No
integration, upload, matching or reconciliation code exists.

---

## 1. Three layers, three different authorities

| Layer | Contents | Who may write | Mutability | May change balances? |
| --- | --- | --- | --- | --- |
| **A. Source evidence** | Bank statement, provider transaction, platform earnings statement, invoice PDF, receipt, webhook payload metadata | integrations / import / a human uploader | Append-only; corrected by a new superseding record | **No** |
| **B. Financial authority** | Validated financial events, journal entries/lines, invoices, payments, settlements, reconciliation outcomes | financial-core / reconciliation | Append-only once posted; reversal/adjustment only | **Yes**, only through validated posting |
| **C. Intelligence** | Forecasts, recommendations, anomaly explanations, analyses | intelligence | Recomputable | **Never** |

An external record is evidence, not a transaction. A bank statement saying ₹50,000
arrived does not itself create revenue, clear an invoice or prove a customer identity.
A human uploading an invoice does not make it issued in Hestian's books.

```
A. evidence ──cites──► B. validated event ──posts──► journal/documents
     │                         ▲
     └──── reconciliation ─────┘             C. intelligence reads A and B
```

Layer C may read A/B through exported read contracts. It has no write path and cannot
authorize a posting.

---

## 2. Source evidence record

`SourceEvidence { id, businessId, sourceType, provider, providerObjectId?, receivedAt,
occurredAt?, contentHash, payloadRef?, status, supersedesEvidenceId?, createdBy }`

Source types: `bank_statement_line`, `payment_provider_transaction`,
`platform_earnings_statement`, `invoice_document`, `receipt`, `webhook_delivery`,
`manual_note`.

Rules:

- **Immutable.** Corrections create a new record with `supersedesEvidenceId`; the old
  record remains visible.
- **Duplicate detection.** `UNIQUE (business_id, provider, provider_object_id)` where
  a provider id exists; otherwise `contentHash` plus source/business.
- **Content hash.** SHA-256 of the canonical payload or file bytes; detects duplicate
  imports and tampering. It is not a signature.
- **Payload reference.** R2 object key for the original document; never inline
  sensitive file bytes in D1.
- **Verification status.** `received → verified | rejected | unreadable`. A webhook
  signature failure is stored as rejected evidence but cannot produce a financial
  event.
- **No debit/credit columns.** Evidence cannot be mistaken for a journal.
- **Tenant-owned.** `business_id` is mandatory; provider ids are unique per business,
  not globally.

### 2.1 Inbound delivery

`InboundDelivery { id, businessId, provider, providerEventId, receivedAt,
signatureStatus, payloadRef, processingStatus }` with
`UNIQUE (business_id, provider, provider_event_id)`. A duplicate webhook finds the
existing delivery and returns its result. Signature verification is recorded, not
assumed.

---

## 3. From evidence to authority

The path is explicit and ordered:

1. Receive/store evidence with provider identity and hash.
2. Verify source authenticity (signature, API fetch, bank statement provenance).
3. Parse into candidate fields; unreadable/incomplete evidence stays unresolved.
4. Create or match a **financial event** with idempotency key, amounts, currency,
   occurred date, provenance links and rule version.
5. Validate the event against period, accounts, authorization and invariants.
6. Post the journal entry/update documents in one audited batch.

Steps 4–6 are the only path to Layer B. Ingestion code cannot call the posting
repository directly; the event validator is the gate. A parser bug cannot become a
ledger entry without passing the same invariants as a manual entry.

`EvidenceLink { businessId, evidenceId, eventId?, journalEntryId?, documentType?,
documentId?, relationship }` records provenance. A posted entry must have at least
one link to evidence or to an explicit adjustment event. Links are immutable once the
entry is posted.

---

## 4. Reconciliation

Reconciliation compares evidence with accounting state and produces a reviewed
outcome. It does **not** post by itself.

### 4.1 Objects

| Object | Purpose |
| --- | --- |
| `ReconciliationItem` | One evidence record or one authority record awaiting a match; state, age, owner, reason |
| `ReconciliationCandidate` | A proposed pairing with match signals and confidence |
| `ReconciliationOutcome` | Accepted/rejected match, actor, time, evidence links, reason |
| `ReconciliationDiscrepancy` | Amount/date/fee/reference difference requiring resolution |

States: `unmatched → candidate → matched` or `unresolved`; `reopened` after reversal.
A rejected candidate returns the item to `unmatched`/`unresolved` with a reason.

### 4.2 Matching signals

| Signal | Strength | Rule |
| --- | --- | --- |
| Exact provider/reference id | Strong | Can auto-suggest, never auto-post |
| Exact amount + currency + date + counterparty | Strong | Suggest |
| Amount + currency within date window | Medium | Candidate; review |
| Partial amount | Weak | Candidate; may represent a partial settlement |
| Same amount, multiple candidates | Ambiguous | `unresolved`; no guess |
| Currency mismatch | Reject unless explicit FX evidence | No silent conversion |
| Date outside window | Weak/reject | Configurable window, recorded |

Matching is deterministic and explainable: every candidate records which signals
fired. A model may later rank candidates, but its score is advisory and cannot
authorize a match or a posting.

### 4.3 Confidence

`confidence` is an integer 0–100 stored on a candidate for ordering and review. It is
not authorization. A 100% score still requires the configured actor/approval if the
outcome changes financial state. Confidence must not be copied into a journal rule
version or used as a substitute for evidence.

### 4.4 Manual review

An unresolved item exposes: evidence, candidate(s), amount/currency/date deltas,
reason, age, assigned reviewer, and permitted actions (`accept candidate`, `reject`,
`create adjustment`, `leave unresolved`). The reviewer must have accountant/owner
permission. Every outcome is audited with actor, correlation id and reason.

### 4.5 Reopening

A matched outcome is not edited. Reopening creates an audited reversal of the outcome
and returns the item to review. Any journal correction is a separate reversal/
adjustment entry through the posting gate.

---

## 5. What reconciliation may and may not do

**May:**

- propose candidates and rank them;
- record a reviewed match between evidence and an existing event/entry;
- flag discrepancies and missing evidence;
- trigger a *request* to financial-core to create a validated event (for example a
  bank fee or FX difference), which still passes all invariants.

**May not:**

- post a journal entry directly;
- change an invoice/payment status without a financial event;
- treat a confidence score as approval;
- net a discrepancy into revenue or a suspense account without an explicit,
  documented account and approval;
- delete or hide unresolved items.

---

## 6. Example: platform earnings statement

```
Evidence: YouTube statement, gross 80,000 INR, fee 16,000, net 64,000
  → parse fields; provider id + content hash stored
  → financial event platform.earnings (idempotency: provider statement id)
  → post: Dr clearing 64,000, Dr platform fee 16,000, Cr platform revenue 80,000
  → bank deposit 64,000 arrives as separate evidence
  → reconciliation matches deposit to clearing/settlement
```

If the statement shows only a net 64,000 deposit and no gross/fee breakdown, the
system may record a settlement/matching candidate but must not invent a 20% fee. The
revenue/fee split remains unresolved until evidence or a documented policy exists.

---

## 7. Example: bank line with no invoice

A bank statement shows an incoming 50,000 with reference `INV-1042`.

1. Evidence is stored and hash-deduplicated.
2. Candidate matching finds invoice INV-1042 for 50,000, same currency, date window.
3. A reviewer accepts the candidate.
4. The payment/capture event is validated and posted; the allocation clears the
   invoice receivable.
5. Settlement/bank evidence links are recorded.

A bank line with no matching invoice stays unresolved; it is not posted as revenue
merely because cash arrived.

---

## 8. Privacy, retention and audit

- Evidence documents are **restricted** data: R2 private objects, tenant-scoped
  access, no public URLs.
- Logs contain provider ids and hashes, never full payloads, account numbers or
  customer PII.
- Export includes evidence metadata and links, with document downloads separately
  authorized.
- Retention: evidence must support the books and disputes; no retention period is
  invented here. Deletion of identity does not delete financial evidence while a
  legal/business retention obligation applies.
- Every intake, match, rejection, reopen and discrepancy resolution is audited with
  actor, tenant, evidence id, rule version and outcome.
- Provider privacy terms and consent gate transmission of evidence to AI providers;
  no evidence is sent to a model without explicit consent and minimization.

---

## 9. Deferred

- Provider-specific parsers and signature schemes.
- Bank feed APIs and statement formats.
- Matching window/threshold defaults.
- Suspense/clearing account policy for unmatched items.
- Handling of duplicate documents with different hashes.
- Legal retention and legal hold.
- Whether the first matching pass is synchronous or a resumable import job.
