# 0015 — Audit atomicity: D1 batch commits, outbox rejected for now

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Milestone 1 recorded a hash-chained audit log but acknowledged that the business
write and its audit event were separate statements with no transaction, so a crash
between them could leave an action unaudited. This milestone had to determine
whether D1 can commit both atomically, and prove it rather than assume either way.

## Decision

1. **D1 `batch()` is the atomic primitive.** Current Cloudflare documentation states
   that batched statements are SQL transactions and that a failing statement "aborts
   or rolls back the entire sequence". D1 has no interactive transactions; `batch()`
   is the only multi-statement unit that carries this guarantee.
2. **`commitWithAudit(db, statements, event)` is the only supported way to make an
   audited mutation.** It:
   - reads the current chain head;
   - builds the audit row and its hash;
   - sends the business statements and the audit insert in one `batch()`;
   - retries only when the failure is a `prev_hash` collision (another writer
     appended first), because the whole batch was rolled back;
   - rethrows any other failure, because the mutation itself failed.
3. **The audit insert is last**, so a chain-head collision rolls back the business
   statements instead of recording them unaudited.
4. **Adopted for new privacy workflows and business-scoped writes** where the
   mutation is already statement-based. Existing tenancy server actions that write
   then audit separately remain two writes; they are listed as PARTIAL until
   retrofitted. Nothing claims otherwise.
5. **Outbox/durable event was rejected for this milestone.** A transactional outbox
   would add a dispatcher, retry loop and duplicate-handling rules for one database
   that already offers atomic batches; that is unjustified complexity until a
   consumer exists outside the request.
6. **Chain verification is a pure function** (`verifyAuditChain`), exposed through
   the tenant-scoped audit export (`/api/audit/export`) as a `chain` status, and
   tested against tampering, broken links and concurrent appends.
7. **Tamper evidence remains distinct from tamper proof.** Database-owner access can
   still rebuild the chain; there is no external anchor. This is unchanged and
   restated in SECURITY.md.

## Evidence

- `tests/audit/atomicity.test.ts`: a failing second statement rolls back the first,
  leaving neither a business row nor an audit row; six concurrent audited writes
  produce a linear chain; a modified row is reported as `hash_mismatch`.
- `tests/audit/audit-chain.test.ts`: linking, triggers, redaction, concurrency.
- `tests/audit/export.test.ts`: tenant-scoped export with chain fields.
- `tests/database/migrations.test.ts`: the test adapter runs real SQL and the real
  migrations; its `batch()` uses `BEGIN`/`COMMIT`/`ROLLBACK`, matching the documented
  D1 guarantee.
- Runtime: the Worker appends audit events through the same code path; D1 accepted
  the batches.

## Consequences

**Easier:** consequential mutations can be audited without a second system. A
chain-head race is a clean retry rather than a divergent chain.

**Harder:** all statements must be known before the batch. A decision that depends
on reading a row mid-transaction cannot be expressed. Conditional updates must
carry their own constraints so that "zero rows changed" is a failure the batch can
detect (for example a `CHECK` or trigger), because `batch()` cannot be aborted from
JavaScript after it starts.

**Limits:**
- No interactive transaction, no `SELECT … FOR UPDATE`.
- `batch()` "success" does not guarantee each statement affected a row; callers must
  inspect `meta.changes` or rely on constraint/trigger failures.
- Multi-statement invariants that depend on reading intermediate state remain
  unsolved for the financial core (see the readiness assessment).

## Alternatives considered

- **Outbox table + dispatcher.** Deferred; adds a second source of truth and a
  delivery mechanism with no consumer yet.
- **Durable Object per tenant as serialiser.** Promising for posting concurrency;
  evaluate only if batch + constraint design proves insufficient.
- **PostgreSQL.** Would provide interactive transactions and RLS, but is a hosting
  migration not justified by evidence before the financial core is designed.

## Follow-ups

1. Retrofitting tenancy actions to `commitWithAudit` (listed as PARTIAL).
2. An operator runbook and alerting when `verifyAuditChain` returns invalid.
3. External anchoring/export for tamper proofing.
4. Decide posting concurrency strategy in the financial-core milestone.
