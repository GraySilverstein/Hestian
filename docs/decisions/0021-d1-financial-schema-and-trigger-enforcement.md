# 0021 — D1 financial schema: batch, triggers and idempotency

- **Status:** Accepted (design; not implemented; concurrency unverified)
- **Date:** 2026-11-14

## Context

D1 has no interactive transactions. Its `batch()` is atomic and rolls back on failure,
but a zero-row conditional update is not an error, so JavaScript cannot abort a batch
after inspecting a result. A financial design that reads a balance, computes a new
value and writes it back is unsafe. ADR 0008's earlier statement that batches do not
roll back is corrected by ADR 0015 and the schema design.

## Decision

1. Use one `commitWithAudit` batch per posting: insert draft entry, insert lines,
   finalize (status update), append audit last. All statements are known before the
   batch; no mid-transaction reads.
2. Enforce balance, line count, distinct accounts, account postability, period state
   and functional currency in a **finalization trigger**. An abort rolls back the
   entire batch.
3. Use append-only entries/lines and derived balances. No authoritative mutable
   balance row; no read-modify-write.
4. Use `UNIQUE(business_id,idempotency_key)` for entries/events. A duplicate aborts
   one batch; the caller re-reads the existing result. Retry only audit-chain
   `prev_hash` conflicts, because that failure rolls back the whole batch.
5. Use composite tenant keys and foreign keys `(id,business_id)` on every financial
   parent. There is no RLS; application scoping plus schema shape must carry isolation.
6. Use trigger-enforced cumulative limits for allocations/refunds and period-overlap
   triggers. Do not rely on a post-batch `meta.changes` check.
7. Start without a Durable Object/per-business serialiser. D1 serializes writes and
   the append-only design has no lost update; measure the audit-chain throughput and
   add serialization only if a workerd harness proves it necessary.
8. Treat `bigint` binding, migration atomicity, populated-migration safety and
   backup/restore as **unverified** until measured. Persist within ±(2^53−1).

## Consequences

**Easier:** correct atomic posting without interactive transactions; duplicate
delivery safe; tenant references constrained; no balance lost-update class.

**Harder:** triggers are part of the correctness surface and need real-D1 tests; a
draft may remain non-authoritative if the finalize fails; audit chain serializes
posting and may be a bottleneck; no partial/progressive posting.

**Forbidden:** balance read-modify-write; deleting posted rows; relying on a
conditional `WHERE` alone; assuming `batch()` success means each statement changed a
row; using `REAL` for money.

## Alternatives considered

- **PostgreSQL.** Real transactions/RLS, but a hosting migration not justified without
  a failing harness and written comparison.
- **Durable Object per business.** Strong serialization, second consistency model;
  deferred until measured contention.
- **JSON journal lines in one row.** Would simplify atomic validation but lose
  line-level constraints/queryability; rejected for the canonical model.

## Follow-ups

1. Write failing schema/trigger tests before the posting service.
2. Probe D1 `bigint` and trigger behaviour in workerd.
3. Build the concurrent posting/allocation harness.
4. Rehearse migration on populated data and restore before real data.
5. Decide audit-chain throughput strategy with measurements.
