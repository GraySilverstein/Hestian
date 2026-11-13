# 0006 — Idempotent financial events with explicit provenance

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Financial facts arrive more than once: providers retry webhooks, imports are
re-run, users refresh a submission, and jobs resume after failure. Duplicate
processing doubles revenue or payments. Separately, an entry that cannot be traced
to its source cannot be defended in an audit or corrected safely.

## Decision

### Idempotency

- Every inbound delivery is recorded with `(provider, provider_event_id)` under a
  unique constraint before any interpretation.
- Every financial event carries an `idempotencyKey`, unique per tenant and event
  type. The key is derived deterministically from the provider event identity or a
  server-generated operation id — never from a client-supplied value alone.
- Processing an existing key returns the previously produced result. It does not
  create a second entry, does not silently no-op, and does not error in a way that
  invites the caller to retry with a new key.
- Where a duplicate is detected after a partial failure, the operation resumes from
  recorded state rather than recreating effects.
- Concurrency is handled by unique constraints plus conditional writes, not by
  read-then-write checks, because D1 offers no row locks.

### Provenance

Every posted entry records:

- the financial event that produced it, and the rule/interpretation version;
- the source evidence references (provider object ids, document hashes) when the
  event came from outside Hestian;
- for manual adjustments, the actor, reason and approving actor where required.

Evidence records are immutable. A correction supersedes rather than edits, and the
chain evidence → event → entry → reconciliation outcome must remain resolvable.

### Audit

A consequential write and its audit event are committed together. If the audit
write fails, the operation fails.

## Consequences

**Easier:** safe retries, replayable imports, defensible audits, deterministic
debugging ("which evidence produced this entry?").

**Harder:** every ingestion path needs a key strategy; keys must be stable across
retries and distinct across genuinely different events; storage grows with evidence
and audit history (intended).

**Forbidden:** "dedupe by payload similarity" for anything affecting money; deleting
a duplicate entry instead of preventing it; posting without provenance.

## Alternatives considered

- **Hash the whole payload as the key.** Rejected as the primary strategy: harmless
  formatting changes produce new keys, and legitimate distinct events can share
  shapes. Provider identifiers are more stable.
- **Rely on transactional rollback only.** Insufficient: a retry after a committed
  transaction is not rolled back, and the platform offers no distributed lock.
- **Best-effort deduplication with a time window.** Rejected: a late retry outside
  the window duplicates money.

## Follow-ups

1. Define the key format and ownership per provider in Milestone 3.
2. Add concurrency tests: simultaneous duplicate deliveries must yield one effect.
3. Decide evidence retention and hashing algorithm (SHA-256) and record it.
4. Add an operational query for entries with unresolved provenance before launch.
