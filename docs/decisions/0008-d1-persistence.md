# 0008 — D1 persistence, migrations and transaction boundaries

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Hestian needs a relational store for identity, tenancy, audit and later financial
records. The target platform offers Cloudflare D1: SQLite-compatible, single
primary, accessed through a Worker binding. Before designing accounting tables we
had to establish what D1 guarantees and what it cannot do.

## Decision

1. **Use D1** as the authoritative relational store, bound as `DB` per environment.
   Local development and tests use the same migrations; production is a separate
   database bound to the same name.
2. **Forward-only numbered SQL migrations** in `migrations/`, applied with
   `wrangler d1 migrations apply`. Applied files are never edited.
3. **Schema conventions:** module prefix on every table (`identity_`, `tenancy_`),
   `business_id` on every tenant-owned table, foreign keys and `CHECK` constraints
   for enumerations, unique indexes for natural keys, ISO-8601 UTC timestamps.
4. **No interactive transactions.** D1 exposes no `BEGIN`/`COMMIT` across requests.
   Correctness uses unique constraints, conditional updates (`WHERE` includes the
   expected state), idempotency keys, and `db.batch()` only for writes that are
   individually valid. `batch()` is atomic but does **not** roll back on constraint
   failure, so it is never used to enforce a multi-row invariant.
5. **Single-writer invariants are serialised by unique constraints.** The audit
   chain uses a unique `prev_hash`: a racing writer loses the constraint and retries
   against the new head, producing a linear chain without a transaction.
6. **Better Auth runs with `transaction: false`.** Its D1 dialect is non-transactional;
   its operations are individually idempotent enough for identity writes. This is
   documented rather than hidden.
7. **Provider-owned tables are generated, not hand-written.** `npm run auth:schema`
   emits the identity schema from the configured provider; changes become a new
   migration.
8. **Tests use a real D1-shaped adapter** over `node:sqlite` with the real
   migrations. The adapter is test-only; it is not an alternative production path.

## Evidence

- Four migrations apply cleanly to an empty database; `tests/database/migrations.test.ts`
  asserts tables, tenant columns, invalid-role/orphan rejection, audit triggers and
  duplicate-invitation rejection.
- D1 rejects the invalid rows in the same way in the local Worker (constraint
  failures surface as `D1_ERROR`).
- The audit concurrency test appends six events in parallel and verifies an
  unbroken chain; retries resolve `prev_hash` conflicts.
- Foreign keys are enabled; the orphan-membership insert fails.

## Consequences

**Easier:** one database for identity, tenancy and (later) accounting; SQL that is
portable to the local test harness; schema constraints carry real weight.

**Harder:** any future rule spanning multiple rows (balanced journal entry plus
lines plus balances) needs an explicit strategy: either a single-statement
invariant, a conditional update, or an idempotent append with reconciliation. This
is the central open question for the financial core.

**Forbidden:** assuming transactions exist; using `batch()` for rollback; relying
on `SELECT … FOR UPDATE`; row-level security; hand-editing applied migrations.

## Alternatives considered

- **PostgreSQL (Supabase/Neon).** Real transactions and RLS, but leaves the
  intended platform and adds a network dependency from the Worker.
- **Durable Objects as a write serialiser.** Strong option for financial posting,
  but adds a second consistency model; revisit if the financial core needs it.
- **ORM with implicit transactions.** Hides a guarantee D1 does not provide.

## Follow-ups

1. Decide the posting consistency strategy in the financial-core milestone.
2. Verify D1 row/size limits and query latency under realistic data.
3. Add populated-database migration tests.
4. Verify backup/restore and point-in-time recovery before real tenant data.
