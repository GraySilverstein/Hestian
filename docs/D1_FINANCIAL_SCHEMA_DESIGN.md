# D1 financial schema design

Status: **proposed schema; not implemented.** No financial table exists. This is the
storage design for [FINANCIAL_DOMAIN_MODEL.md](FINANCIAL_DOMAIN_MODEL.md) and
[ACCOUNTING_INVARIANTS.md](ACCOUNTING_INVARIANTS.md). Every statement here must be
proven in real SQLite and workerd before any feature is called implemented.

Basis: Cloudflare D1, SQLite-compatible, single primary, no interactive transactions.
`db.batch()` is the atomic multi-statement primitive.

---

## 1. Correcting a contradictory earlier record

ADR 0008 (`0008-d1-persistence.md`, item 4) says `batch()` "does **not** roll back on
constraint failure". That is incorrect and was already superseded in practice by
`commitWithAudit` and ADR 0015. Current Cloudflare documentation states that a failing
statement in a batch rolls back the sequence; the test adapter implements
`BEGIN`/`COMMIT`/`ROLLBACK` and the failure-injection suite proves rollback.

The durable rule is:

- `batch()` is atomic and rolls back the sequence on failure.
- A zero-row `UPDATE … WHERE` is **not** a failure and does not abort the batch.
- Therefore the decisive guard must be a trigger/constraint, not a JavaScript check
  after the batch.

ADR 0008 has been amended to point here; its other decisions remain valid.

---

## 2. Design consequences

1. **Append-only journals.** No mutable balance row is part of the authoritative
   path. A posting inserts an entry and lines and finalizes it; there is no
   read-modify-write.
2. **One batch per posting.** Entry, lines, finalization and audit are known before
   the batch. No mid-transaction reads.
3. **Database-enforced invariants.** A finalization trigger checks balance, accounts,
   period and currency. Allocation/refund triggers check cumulative amounts.
4. **Composite tenant keys.** Every financial parent exposes `UNIQUE(id,business_id)`
   and every child references `(parent_id,business_id)`.
5. **Immutable posted rows.** Posted entries/lines reject update/delete. Reversal is a
   new entry linked to the original; `reversed` is derived, not an edited status.
6. **Idempotency is unique.** A duplicate source key aborts one batch; the caller
   re-reads the winner.
7. **Audit in the same batch.** `commitWithAudit` appends the audit event last and
   retries only on chain-head conflict.

---

## 3. Table catalogue

All tables carry `business_id` unless marked global. Amounts are `INTEGER` minor
units; currencies are 3-letter ISO codes; dates are UTC ISO-8601 strings, business
dates `YYYY-MM-DD`.

| Table | Owner | Purpose | Key constraints |
| --- | --- | --- | --- |
| `financial_account` | financial-core | Chart of accounts | `UNIQUE(business_id,code)`, `UNIQUE(id,business_id)`, classification/normal-balance `CHECK`, postable parent rule |
| `financial_fiscal_year` | financial-core | Fiscal calendar | `UNIQUE(business_id,start_date)`, date range check |
| `financial_period` | financial-core | Open/locked/closed periods | no overlap trigger, `start_date <= end_date`, `UNIQUE(id,business_id)` |
| `financial_event` | financial-core | Validated source fact | `UNIQUE(business_id,source_type,source_key)`, `UNIQUE(id,business_id)` |
| `financial_journal_entry` | financial-core | Entry header | `UNIQUE(business_id,idempotency_key)`, `UNIQUE(id,business_id)`, provenance check |
| `financial_journal_line` | financial-core | Debit/credit lines | `amount_minor > 0`, direction check, composite FKs, unique line number |
| `financial_entry_evidence` | financial-core | Entry↔evidence links | unique `(entry_id,evidence_id)`, composite tenant keys |
| `financial_invoice` | financial-core | Customer invoice | `UNIQUE(business_id,document_type,number)`, status check, composite party/period FKs |
| `financial_invoice_line` | financial-core | Invoice line | amount/quantity checks, revenue-source check |
| `financial_credit_note` | financial-core | Invoice reversal | original invoice FK, amount ≤ invoice total |
| `financial_bill` | financial-core | Vendor bill | number uniqueness, party/period FKs |
| `financial_bill_line` | financial-core | Bill line | amount/quantity checks |
| `financial_payment` | financial-core | Cash receipt | provider ref uniqueness, positive amount, status check |
| `financial_payment_allocation` | financial-core | Payment↔document | unique active allocation, cumulative limit trigger, immutable/reversal |
| `financial_settlement` | financial-core | Provider payout | `gross = net + fee`, provider payout unique, payment FK |
| `financial_settlement_fee` | financial-core | Itemised fee | amount ≥ 0, settlement FK |
| `financial_refund` | financial-core | Refund of payment | cumulative ≤ captured, payment FK |
| `financial_dispute` | financial-core | Dispute/chargeback | payment FK, state/deadline check |
| `financial_bank_transaction` | integrations | Evidence of bank cash | provider/bank ref unique, evidence FK |
| `source_evidence` | integrations | Immutable source record | provider-object uniqueness, content hash |
| `inbound_delivery` | integrations | Webhook receipt | `(provider,provider_event_id)` unique |
| `financial_reconciliation_item` | reconciliation | Review item | state check, evidence/authority reference |
| `financial_reconciliation_candidate` | reconciliation | Proposed match | confidence 0–100, item FK |
| `financial_reconciliation_outcome` | reconciliation | Reviewed result | actor/reason required, item FK |
| `financial_exchange_rate` | financial-core | Rate provenance | source, date, currency pair; positive rate |

The first migration should create only what the first feature needs. Do not ship
unused tables merely to complete this catalogue.

---

## 4. Representative DDL

### 4.1 Account

```sql
CREATE TABLE financial_account (
  id                  TEXT PRIMARY KEY,
  business_id         TEXT NOT NULL REFERENCES tenancy_business(id),
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  classification      TEXT NOT NULL CHECK (classification IN
                        ('asset','liability','equity','revenue','expense')),
  normal_balance      TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_id           TEXT,
  is_postable         INTEGER NOT NULL DEFAULT 1 CHECK (is_postable IN (0,1)),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive')),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (business_id, code),
  UNIQUE (id, business_id),
  FOREIGN KEY (parent_id, business_id)
    REFERENCES financial_account (id, business_id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (
    (classification IN ('asset','expense') AND normal_balance = 'debit') OR
    (classification IN ('liability','equity','revenue') AND normal_balance = 'credit')
  )
);
```

An update trigger must reject a classification change once a posted line references
the account, and reject `is_postable = 0` when posted lines exist only if the
reporting policy confirms (deactivation is safer).

### 4.2 Period

```sql
CREATE TABLE financial_period (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES tenancy_business(id),
  fiscal_year_id  TEXT NOT NULL,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','locked','closed')),
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  UNIQUE (id, business_id),
  FOREIGN KEY (fiscal_year_id, business_id)
    REFERENCES financial_fiscal_year (id, business_id),
  CHECK (start_date <= end_date)
);

CREATE TRIGGER financial_period_no_overlap_insert
BEFORE INSERT ON financial_period
WHEN EXISTS (
  SELECT 1 FROM financial_period p
   WHERE p.business_id = NEW.business_id
     AND p.start_date <= NEW.end_date
     AND p.end_date >= NEW.start_date
)
BEGIN
  SELECT RAISE(ABORT, 'accounting periods must not overlap');
END;
```

Add the equivalent `BEFORE UPDATE` trigger. `financial_fiscal_year` must exist first
with `UNIQUE(id,business_id)`.

### 4.3 Financial event

```sql
CREATE TABLE financial_event (
  id               TEXT PRIMARY KEY,
  business_id      TEXT NOT NULL REFERENCES tenancy_business(id),
  event_type       TEXT NOT NULL,
  occurred_at      TEXT NOT NULL,
  source_type      TEXT NOT NULL,
  source_key       TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  rule_version     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'validated'
                     CHECK (status IN ('validated','posted','rejected')),
  created_at       TEXT NOT NULL,
  UNIQUE (business_id, source_type, source_key),
  UNIQUE (business_id, idempotency_key),
  UNIQUE (id, business_id)
);
```

An event is inserted before its entry in the same batch. A rejected event may be
retained for audit but cannot be referenced by a posted entry; enforce that with a
trigger or by only exposing validated events to the posting path.

### 4.4 Journal entry and line

```sql
CREATE TABLE financial_journal_entry (
  id                   TEXT PRIMARY KEY,
  business_id          TEXT NOT NULL REFERENCES tenancy_business(id),
  period_id            TEXT NOT NULL,
  entry_date           TEXT NOT NULL,
  description          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','posted')),
  source_event_id      TEXT,
  adjustment_reason    TEXT,
  reversal_of_entry_id TEXT,
  idempotency_key      TEXT NOT NULL,
  rule_version         TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  posted_by            TEXT,
  posted_at            TEXT,
  UNIQUE (business_id, idempotency_key),
  UNIQUE (id, business_id),
  UNIQUE (business_id, reversal_of_entry_id),
  FOREIGN KEY (period_id, business_id)
    REFERENCES financial_period (id, business_id),
  FOREIGN KEY (source_event_id, business_id)
    REFERENCES financial_event (id, business_id),
  FOREIGN KEY (reversal_of_entry_id, business_id)
    REFERENCES financial_journal_entry (id, business_id),
  CHECK (status <> 'posted' OR (posted_at IS NOT NULL AND posted_by IS NOT NULL)),
  CHECK (status <> 'posted' OR source_event_id IS NOT NULL OR adjustment_reason IS NOT NULL)
);

CREATE TABLE financial_journal_line (
  id                       TEXT PRIMARY KEY,
  business_id              TEXT NOT NULL,
  entry_id                 TEXT NOT NULL,
  line_no                  INTEGER NOT NULL,
  account_id               TEXT NOT NULL,
  direction                TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor             INTEGER NOT NULL
                             CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency                 TEXT NOT NULL CHECK (length(currency) = 3),
  transaction_currency     TEXT,
  transaction_amount_minor INTEGER,
  fx_rate                  TEXT,
  fx_rate_date             TEXT,
  fx_rate_source           TEXT,
  UNIQUE (entry_id, line_no),
  UNIQUE (id, business_id),
  FOREIGN KEY (entry_id, business_id)
    REFERENCES financial_journal_entry (id, business_id),
  FOREIGN KEY (account_id, business_id)
    REFERENCES financial_account (id, business_id),
  CHECK (
    (transaction_currency IS NULL AND transaction_amount_minor IS NULL AND
     fx_rate IS NULL AND fx_rate_date IS NULL AND fx_rate_source IS NULL)
    OR
    (transaction_currency IS NOT NULL AND transaction_amount_minor IS NOT NULL AND
     fx_rate IS NOT NULL AND fx_rate_date IS NOT NULL AND fx_rate_source IS NOT NULL)
  )
);
```

### 4.5 Finalization trigger

```sql
CREATE TRIGGER financial_entry_finalize_checks
BEFORE UPDATE OF status ON financial_journal_entry
WHEN NEW.status = 'posted' AND OLD.status = 'draft'
BEGIN
  SELECT RAISE(ABORT, 'journal entry needs at least two lines')
  WHERE (SELECT COUNT(*) FROM financial_journal_line
          WHERE entry_id = NEW.id AND business_id = NEW.business_id) < 2;

  SELECT RAISE(ABORT, 'journal entry needs at least two accounts')
  WHERE (SELECT COUNT(DISTINCT account_id) FROM financial_journal_line
          WHERE entry_id = NEW.id AND business_id = NEW.business_id) < 2;

  SELECT RAISE(ABORT, 'journal entry is unbalanced')
  WHERE
    (SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END), 0)
       FROM financial_journal_line
      WHERE entry_id = NEW.id AND business_id = NEW.business_id)
    <>
    (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END), 0)
       FROM financial_journal_line
      WHERE entry_id = NEW.id AND business_id = NEW.business_id);

  SELECT RAISE(ABORT, 'journal entry currency must equal the functional currency')
  WHERE (SELECT COUNT(DISTINCT currency) FROM financial_journal_line
          WHERE entry_id = NEW.id AND business_id = NEW.business_id) <> 1
     OR (SELECT currency FROM financial_journal_line
          WHERE entry_id = NEW.id AND business_id = NEW.business_id LIMIT 1)
        <> (SELECT functional_currency FROM tenancy_business WHERE id = NEW.business_id);

  SELECT RAISE(ABORT, 'account is not postable or not in this business')
  WHERE EXISTS (
    SELECT 1
      FROM financial_journal_line l
      JOIN financial_account a
        ON a.id = l.account_id AND a.business_id = l.business_id
     WHERE l.entry_id = NEW.id
       AND l.business_id = NEW.business_id
       AND (a.is_postable = 0 OR a.status <> 'active')
  );

  SELECT RAISE(ABORT, 'period is not open or does not contain the entry date')
  WHERE NOT EXISTS (
    SELECT 1 FROM financial_period p
     WHERE p.id = NEW.period_id
       AND p.business_id = NEW.business_id
       AND p.status = 'open'
       AND NEW.entry_date BETWEEN p.start_date AND p.end_date
  );
END;
```

### 4.6 Immutability triggers

```sql
CREATE TRIGGER financial_entry_immutable
BEFORE UPDATE ON financial_journal_entry
WHEN OLD.status = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'posted journal entries are immutable');
END;

CREATE TRIGGER financial_entry_no_delete
BEFORE DELETE ON financial_journal_entry
BEGIN
  SELECT RAISE(ABORT, 'journal entries are never deleted');
END;

CREATE TRIGGER financial_line_no_change_after_post
BEFORE INSERT ON financial_journal_line
WHEN (SELECT status FROM financial_journal_entry
       WHERE id = NEW.entry_id AND business_id = NEW.business_id) = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'posted journal lines are immutable');
END;
```

Add the equivalent `BEFORE UPDATE`/`BEFORE DELETE` line triggers. The line insert
trigger fires while the entry is still `draft`, which is the required insertion order.
A trigger must also reject changes to `id`, `business_id`, `period_id`,
`source_event_id`, `reversal_of_entry_id`, `idempotency_key` or `entry_date` after
insert; only `status`, `posted_at` and `posted_by` may change on finalization.

A reversal is a **new** entry with `reversal_of_entry_id` set and opposite lines. The
finalization trigger must additionally reject a reversal when the original is not
posted, when the reversal total does not equal the original total, or when a posted
reversal already exists:

```sql
SELECT RAISE(ABORT, 'reversal requires a posted original')
WHERE NEW.reversal_of_entry_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM financial_journal_entry o
                   WHERE o.id = NEW.reversal_of_entry_id
                     AND o.business_id = NEW.business_id
                     AND o.status = 'posted');

SELECT RAISE(ABORT, 'reversal total does not match original')
WHERE NEW.reversal_of_entry_id IS NOT NULL
  AND (SELECT COALESCE(SUM(amount_minor), 0) FROM financial_journal_line
        WHERE entry_id = NEW.id AND business_id = NEW.business_id)
   <> (SELECT COALESCE(SUM(amount_minor), 0) FROM financial_journal_line
        WHERE entry_id = NEW.reversal_of_entry_id AND business_id = NEW.business_id);
```

`UNIQUE(business_id, reversal_of_entry_id)` prevents a second posted reversal. The
original remains `posted`; reports derive `reversed` from the link. Do not update the
original row.

### 4.7 Allocation trigger sketch

```sql
CREATE TRIGGER financial_allocation_limits
BEFORE INSERT ON financial_payment_allocation
WHEN NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'allocation exceeds payment')
  WHERE NEW.amount_minor +
        (SELECT COALESCE(SUM(amount_minor), 0)
           FROM financial_payment_allocation
          WHERE payment_id = NEW.payment_id AND status = 'active') >
        (SELECT amount_minor FROM financial_payment
          WHERE id = NEW.payment_id AND business_id = NEW.business_id
            AND status IN ('captured','settled'));

  SELECT RAISE(ABORT, 'allocation exceeds document outstanding')
  WHERE NEW.amount_minor +
        (SELECT COALESCE(SUM(amount_minor), 0)
           FROM financial_payment_allocation
          WHERE document_id = NEW.document_id AND status = 'active') >
        (SELECT total_minor FROM financial_invoice
          WHERE id = NEW.document_id AND business_id = NEW.business_id
            AND status <> 'void');
END;
```

The actual trigger must branch on document type (invoice vs bill), require matching
currency, and reject updates/deletes after posting; reversal is a new allocation row.
Compute the outstanding from the document + credit notes, not a mutable `amount_paid`.

---

## 5. Posting sequence

```
request
  → authenticate + authorize (financial-core, period permission)
  → resolve/validate FinancialEvent (idempotency key, provenance, rule version)
  → read existing event/entry by key; if present, return its result
  → build entry id, period, lines (functional amounts, explicit currency)
  → one commitWithAudit batch:
        INSERT entry (draft)
        INSERT lines
        UPDATE entry SET status='posted', posted_at, posted_by   ← trigger validates
        INSERT audit_event                                        ← chain head
  → if unique idempotency conflict: re-read existing result
  → if trigger abort: DomainError, no partial rows
```

The finalize update is by primary key and has no `status='draft'` predicate as the
only guard. The trigger rejects a second finalization (`OLD.status='posted'`), so a
zero-row update is not silently accepted as success. There is no balance row to
update; balances are derived.

---

## 6. Concurrency behaviour

| Race | Protection | Expected result |
| --- | --- | --- |
| Two postings with same idempotency key | `UNIQUE(business_id,idempotency_key)` | One commits; the other aborts and re-reads the winner |
| Two different postings | Append-only inserts; D1 serializes the batch | Both commit; no lost update because no balance row |
| Period lock concurrent with posting | Finalization trigger checks current period status inside the batch | Depending on serialization, entry posts before lock or aborts after lock |
| Two allocations on one invoice | Trigger sums active rows inside the batch | One may abort if it exceeds outstanding |
| Audit chain contention | Unique `prev_hash`; retry only this conflict | Whole batch rolls back and retries |
| Duplicate webhook | Unique event/delivery key | One event; duplicate returns existing result |
| Cross-tenant reference | Composite FK | Constraint abort |

This is a design argument, not proof. A workerd/D1 harness must attempt each race,
including parallel batches, before any claim of concurrency safety. The audit chain
is a serialization point and a likely throughput ceiling; measure it before choosing
a Durable Object per business (deferred).

---

## 7. Money and D1 binding

- Persist minor units as `INTEGER` within ±(2^53−1). The domain already rejects
  larger values.
- **Unverified:** whether the D1 binding accepts a JavaScript `bigint` parameter and
  returns 64-bit integers without precision loss. Until a probe proves it, bind
  minor units as numbers within the safe range or as decimal strings converted by
  the repository; never pass an unsafe `number`.
- Serialize wire amounts as decimal strings. No `REAL` columns, no floating point in
  SQL arithmetic for money.
- FX rates are not amounts; store them as canonical decimal text plus source/date and
  validate in the application. Do not use SQLite floating point for authoritative
  conversion.

---

## 8. Migration and recovery

- Additive `CREATE TABLE`/`CREATE TRIGGER` migrations first. Destructive changes use
  SQLite's table-rebuild pattern only with a tested rollback and a populated-database
  migration test.
- Each migration is forward-only and reviewed. Do not edit an applied migration.
- Test on a database containing representative rows, not only empty.
- Rehearse backup/restore and point-in-time recovery before real tenant data. No RPO
  or RTO is claimed today.
- D1 row/database limits and query-duration behaviour must be read from current
  official documentation at implementation time.
- Migration atomicity (whether Wrangler wraps the file) remains unverified.

---

## 9. Audit integration

- Every financial mutation uses `commitWithAudit`; the audit insert is last in the
  batch. A failed trigger rolls back the mutation and the audit.
- Audit metadata includes entry id, event id, period, rule version and correlation id
  (no amounts if they are sensitive? Amounts may be included in audit metadata only
  if the tenant's classification allows; otherwise status + ids).
- The audit chain is global today. It serializes consequential writes and can become a
  bottleneck. Per-tenant chains or a Durable Object are deferred until measured.
- `verifyAuditChain` is an operator diagnostic; it does not make the chain
  tamper-proof against a database owner.

---

## 10. Feasibility findings

| Question | Finding | Status |
| --- | --- | --- |
| Atomic entry + lines + audit? | Yes, one `batch()` with finalize trigger and audit last | Design; test required |
| Trigger-enforced balance? | Yes; finalization trigger sees lines in the same batch | Design; test required |
| Idempotency? | Yes, unique keys; caller re-reads winner | Design; test required |
| Conditional state transitions? | Yes if guarded by trigger, not only `WHERE` | Design; zero-row caveat documented |
| Concurrent posting? | Append-only, serialized by D1; needs harness | **Unverified** |
| Allocation limits? | Trigger sums active rows | Design; concurrency test required |
| Tenant isolation? | Composite FKs + app scope; no RLS | Design; two-tenant tests required |
| BigInt binding? | Unknown | **Blocked until probed** |
| Migration on populated DB? | Not yet tested | **Unverified** |
| Backup/restore? | No remote DB; no RPO/RTO | **Unverified** |
| Per-business serialization? | Not needed if batch+trigger holds; measure | Deferred |

---

## 11. Open questions

- Exact trigger behaviour and error surfacing in workerd/D1 (message mapping).
- Whether SQLite trigger subqueries see all rows of a multi-row insert in D1; the
  design inserts lines individually, so this must be proven.
- Whether the finalization update and line inserts can be reordered by the adapter;
  the batch order is guaranteed, but test it.
- Whether an orphan draft entry can be created by a crash after commit; cleanup
  policy and audit.
- Fiscal year close entries and retained earnings policy.
- FX rate precision and rounding boundary.
- Audit chain throughput under realistic posting concurrency.
- Retention/legal hold for financial records.
- Whether a balance projection is needed for reporting, and how it is verified against
  the journal.

No claim is made that D1 concurrency has been proven. The next step is a failing
schema/concurrency harness, not a posting service.
