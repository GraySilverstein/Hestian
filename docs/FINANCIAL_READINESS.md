# Financial readiness assessment

Status: assessment only. **No financial engine, chart of accounts, journal, posting
or balance code exists.** This document judges whether the infrastructure proven in
Milestones 1 and 1.5 can support the Financial Integrity Core without compromising
accounting correctness. It does not redesign the database, and it does not
recommend replacing D1 without evidence.

Date: 2026-11-13. Basis: Cloudflare D1, Workers, the `commitWithAudit` path, the
test adapter and 96 passing tests.

---

## 1. Summary

| Question | Answer |
| --- | --- |
| Can D1 persist financial records durably? | **Yes**, with the constraints measured here. |
| Can a business mutation and its audit event commit atomically? | **Yes**, via `db.batch()` (documented and tested), not yet applied to every legacy flow. |
| Can a balanced journal entry be written atomically? | **Yes**, if the whole entry is known before the batch and balance is enforced by SQL constraints/triggers that abort the batch. |
| Can a posting decide from mid-transaction reads? | **No.** D1 has no interactive transactions. This is the central design constraint. |
| Can concurrent postings corrupt balances? | **Not if** balances move through conditional single-statement updates or triggers; verification is UNVERIFIED under real concurrency until a workerd test exists. |
| Is tenant isolation safe under concurrency? | **Application-enforced**; no RLS. Schema composite keys help, but isolation depends on every query carrying `business_id`. |
| Does anything block starting the financial core? | **No blocker to design/build.** Three items block *production ledger use* until proven: posting concurrency, migration/restore safety, and audit coverage of every financial write. |
| Should Hestian switch to PostgreSQL now? | **No.** The constraints are workable; a migration would add cost and a network dependency without evidence that D1 cannot meet the invariants. Revisit only if the posting prototype fails. |

---

## 2. Evaluated capabilities

### 2.1 D1 consistency and transactions

**What is proven.** D1 is SQLite on a single primary. Cloudflare documents `batch()`
as a single SQL transaction; a failing statement rolls back the sequence. There is
no `BEGIN`/`COMMIT` spanning requests and no `SELECT … FOR UPDATE`. Foreign keys and
`CHECK` constraints are enforced (tests insert orphans and invalid roles and are
rejected). Unique indexes serialise conflicting writes.

**Evidence.** `tests/database/migrations.test.ts`, `tests/audit/atomicity.test.ts`,
official D1 Worker API documentation (see ADR 0015).

**Implication.** Every multi-row financial invariant must be expressible as a set of
statements that either all succeed or all fail *without reading intermediate state*.
That is achievable for an append-only journal with precomputed lines, not for
algorithms that compute a running balance in JavaScript and write it back.

### 2.2 Batch semantics and the "cannot abort" problem

A batch is atomic, but JavaScript cannot inspect statement results and then abort.
If statement 2 updates a balance `WHERE version = ?` and matches zero rows, the batch
still commits statement 1. **A zero-row conditional update is not an error.**

**Solution required for the ledger:** make the invariant unrepresentable rather than
merely checked in code:
- a trigger on journal line insert that aborts when the sibling sum is non-zero;
- a `CHECK`/trigger that rejects a balance update whose version does not match;
- a unique constraint on the idempotency key so a duplicate aborts the batch;
- or serialize postings per business through a Durable Object.

Without one of these, posting is not safe. This is a design task for Milestone 2, not
an infrastructure defect.

### 2.3 Idempotency

**Feasible.** A `UNIQUE (business_id, idempotency_key)` row inserted in the same batch
as the entry means a replay either aborts the batch (and the caller recognises the
duplicate) or, better, the caller first reads the existing result and returns it.
The uniqueness guarantee is already used by `prev_hash` and invitation tokens.

**Gap.** No retry/idempotency helper exists for financial writes yet; only the audit
chain retries internally. Milestone 2 must define replay semantics and test duplicate
delivery.

### 2.4 Concurrency

- Within one batch, statements execute sequentially and non-concurrently.
- Across batches, D1's single primary serialises writes, but the isolation level that
  concurrent batches observe is **not documented in a form this project can rely on**.
  Treat read-then-write as unsafe.
- No lost-update protection exists without a version column, conditional update and a
  constraint that fails the batch.
- The audit chain is deliberately serialised on one head, so audit appends are a
  throughput ceiling under heavy concurrent posting.

**Financial impact:** a lost balance update is a silent, reconcilable-only error —
the worst class of defect. The posting design must not depend on read-modify-write.

### 2.5 Audit consistency

**Improved.** `commitWithAudit` writes mutation + audit in one batch, retries only on
a chain-head race and rethrows genuine failures. Tests prove rollback of the business
write when the batch fails, and six concurrent audited writes produce a linear chain.

**Remaining.** Tenancy server actions still write then audit separately (documented
PARTIAL). Financial posting must use `commitWithAudit` from the first commit; no
financial write may exist outside it. The readiness criteria below make this a gate.

### 2.6 Durable event processing and recovery

There are no queues, cron jobs or background consumers. Webhook intake and
reconciliation will need durable retries. Options: Cloudflare Queues, Durable Object
alarms, or request-driven resumable imports with an outbox. None exists today; this
is **not** a blocker for the journal, but it is for evidence ingestion.

Failure recovery: a batch either commits or not, but a Worker can die after commit
and before responding. The client must retry with an idempotency key; the UI must not
assume "no response" means "no write".

### 2.7 Migration safety

Migrations are forward-only SQL files applied by Wrangler. The local and test
databases apply them cleanly. **Unverified:** whether Wrangler wraps a migration file
in a transaction, how a partially applied migration is recovered, and whether D1
supports the `ALTER TABLE` patterns financial tables will need. Destructive changes
must use the SQLite table-rebuild pattern, which needs a verified rollback story.

### 2.8 Monetary precision

Money is integer minor units (`bigint`) with a safe ceiling of 2^53−1 and decimal
strings on the wire. SQLite stores 64-bit integers. **Unverified:** whether the D1
binding accepts JavaScript `bigint` parameters and how it returns 64-bit values
outside `Number.MAX_SAFE_INTEGER`. Until measured, all persisted amounts must stay
within 2^53−1 (already enforced in the domain) and be bound as numbers or strings,
not `bigint`, if D1 rejects them.

### 2.9 Tenant isolation under concurrency

`business_id` is present on tenant-owned tables, participates in unique keys, and is
included in mutation `WHERE` clauses. There is no row-level security, so a forgotten
scope is a breach; the schema cannot catch every omission. Isolation tests are
sequential. Concurrent cross-tenant probes are not tested, and would not be stopped by
the database if application code were wrong.

**Mitigation for financial tables:** composite foreign keys including `business_id`
(e.g. journal line → entry `(id, business_id)`), a schema test asserting the column,
and every repository function requiring `TenantContext`.

### 2.10 Backup, restore and limits

No remote database exists, so backup/restore, point-in-time recovery, database size
limits, row-size limits and query-duration behaviour are **UNVERIFIED**. Financial
records require a rehearsed restore before production; until then no recovery
objective may be promised. The exact current D1 limits must be read from the official
docs at implementation time, not from memory.

---

## 3. Limitations that threaten accounting correctness

| # | Limitation | Evidence | Financial impact | Options | Recommendation | Blocks core? |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | No interactive transactions; no read-then-write | D1 docs; no `transaction()` in bindings | Lost updates, unbalanced entries if code computes from stale reads | Precomputed batches; triggers/`CHECK`s; conditional updates with version; Durable Object serialiser | Design posting as append-only batch with SQL-enforced balance; forbid read-modify-write | **Blocks ledger launch** until proven, not design |
| F2 | Batch cannot be aborted after a zero-row update | `batch()` API; tests only show constraint failure rollback | Silent no-op on balance/state update | Triggers that `RAISE(ABORT)`; version mismatch as constraint; check `meta.changes` before commit by splitting into a preflight + guarded batch | Use guarded single statements + triggers; prototype both | **Yes for state transitions** |
| F3 | Audit not atomic in legacy tenancy flows | ADR 0015; actions call repository then audit | Action without evidence | Adopt `commitWithAudit` everywhere | Make it a financial-core gate: no financial write without it | **Yes for financial writes** |
| F4 | No cross-batch isolation guarantee | Docs describe sequencing, not isolation level | Non-repeatable reads, phantom period checks | Keep decisions inside one batch; lock period via conditional update; serialise per tenant | Serialise posting per business (DO or version row) | **Yes for concurrent posting** |
| F5 | No RLS; isolation is application-enforced | ADR 0005/0010 | Cross-tenant read/write if scope forgotten | Composite FKs, schema tests, repository guard, review | Add composite FKs and a schema test for every financial table | **No, but mandatory controls** |
| F6 | Audit chain throughput serialises on one head | ADR 0011; contention retry | Posting latency under load; retry storms | Batch amortisation, DO serialisation, or per-tenant chains | Measure before optimising; keep global chain for now | No (performance risk) |
| F7 | No durable queue / background processing | No queue binding or scheduler | Webhook loss, reconciliation stalls | Queues, DO alarms, resumable imports + outbox | Decide with evidence ingestion, not journal | No for journal; yes for ingestion |
| F8 | Migration and restore behaviour unverified | No remote DB; only local apply | Irrecoverable schema/data incident | Rehearse restore; test migration on populated DB; document partial-failure recovery | Required before production data | **Yes for production** |
| F9 | `bigint` binding/precision unverified on D1 | No financial persistence yet | Off-by-precision, rejected binds | Probe binding with 2^53−1 and beyond; store minor units as INTEGER within safe range | Add a binding test before ledger code | No, must verify early |
| F10 | TOTP replay within time step | ADR 0013; standard TOTP | Weakens second factor marginally | Provider usage tracking; shorter step | Accept for now; require MFA policy | No |

---

## 4. Recommended path for Milestone 2

1. **Posting shape:** an immutable `journal_entry` plus `journal_line` rows inserted in
   one batch, with a trigger that aborts unless debits equal credits per currency, and
   a unique idempotency key per business.
2. **State transitions:** period lock, entry void and reversal must use conditional
   statements backed by constraints/triggers, never read-then-write.
3. **Serialization:** start with the batch + trigger design. If the concurrency harness
   shows lost updates or deadlock-like retries at realistic load, serialize posting per
   business with a Durable Object; document it as an ADR before implementing.
4. **Audit:** every financial write uses `commitWithAudit`; the test suite asserts an
   audit row exists for every posted entry and that an injected failure leaves neither.
5. **Isolation:** composite foreign keys carrying `business_id`; a schema test that
   every financial table has it; two-tenant concurrency probe.
6. **Money:** a D1 binding probe for integer range before writing the repository.
7. **Migrations/restore:** rehearse on a populated database and document recovery
   before any remote financial data exists.
8. **Decision gate:** the ledger does not serve production until the failure-injection
   and concurrency suites pass in workerd, not only in the SQLite adapter.

## 5. What would justify changing database

Only a demonstrated failure of the invariants above under the chosen design, for
example: a required balance invariant that cannot be enforced by triggers or
constraints, or measured concurrency that cannot be serialised without unacceptable
retries. The evidence would be a failing harness plus a written comparison. Familiarity
with PostgreSQL is not evidence.

## 6. Unresolved decisions

- Isolation level observed by concurrent D1 batches (documentation insufficient).
- Whether Wrangler applies each migration atomically.
- D1 `bigint` binding behaviour and 64-bit read precision.
- Backup/restore and point-in-time recovery guarantees.
- D1 row/database limits at the time of implementation.
- Per-business posting serialisation (batch vs Durable Object).
- Audit retention and external anchoring before financial data exists.
