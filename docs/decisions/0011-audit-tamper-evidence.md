# 0011 — Append-only, hash-chained audit log

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Security-relevant actions (sign-in, session revocation, role changes, business
creation, invitations, data export, credential lifecycle) must be recorded in a way
ordinary application code cannot rewrite. D1 has no interactive transactions and no
row-level security, so tamper evidence had to come from the schema and the write
path.

## Decision

1. **One table**, `audit_event`, with `id`, `seq` (autoincrement), `occurred_at`,
   `actor_user_id`, `business_id`, `action`, `outcome`, `target_type`, `target_id`,
   `correlation_id`, `metadata`, `prev_hash`, `hash`.
2. **Hash chain:** `hash = SHA-256(canonical JSON of the record without seq/hash +
   prev_hash)`. The first record links to a fixed genesis hash.
3. **`prev_hash` is `UNIQUE`.** Concurrent appenders compute the same head; one
   insert wins and the others receive a constraint error. The writer re-reads the
   head and retries (bounded, then `CONFLICT`). This serialises the chain without a
   transaction.
4. **Append-only at the database level:** triggers `audit_event_reject_update` and
   `audit_event_reject_delete` abort any `UPDATE` or `DELETE`, including from a
   compromised application path or a console mistake.
5. **Redaction before hashing:** secret-shaped keys (password, token, secret,
   authorization, cookie, key, credential, email) are replaced with `[redacted]`
   recursively and the metadata is bounded, so a token cannot be permanently
   embedded in the chain and secrets cannot leak through audit reads.
6. **Verification** (`verifyAuditChain`) recomputes every hash in `seq` order and
   checks linkage; it reports the first broken sequence and reason
   (`hash_mismatch`, `broken_link`, `duplicate_prev_hash`).
7. **What is recorded:** authentication success and failure, sign-out, session
   revocation, password reset request/completion, business creation, invitation
   creation/acceptance, role changes, member removal. What is not: passwords,
   tokens, email bodies, financial amounts.
8. **Actor attribution honesty:** HTTP-level auth events carry a correlation id and
   outcome but not necessarily an actor id (the auth response does not expose it in
   a way the wrapper can trust); server actions record the actor they resolved. This
   limitation is stated rather than papered over.

## Evidence

`tests/audit/audit-chain.test.ts` proves linking, verification, detection of a
tampered row, rejection of `UPDATE`/`DELETE`, metadata redaction, and six parallel
appends producing an unbroken chain. Live workerd runs record sign-up, sign-in and
sign-out events in D1.

## Consequences

**Easier:** tampering is detectable with a single query and pure function; no
external service is required; the same verification runs in tests and production.

**Harder:** appends serialise on one head, so throughput is bounded and contention
is possible under heavy auth traffic; a retry loop is required.

**Limits, stated plainly:**
- The chain is tamper-evident, not tamper-proof: an attacker with database owner
  access could rebuild the entire chain. External anchoring or off-platform export
  is required for stronger guarantees, and is not implemented.
- Audited actions and their audit rows are not atomic (no D1 transactions): a crash
  between the two can leave an action without its event. The financial core must
  resolve this, for example by writing the event in the same conditional statement
  or by reconciling from state.
- Retention, export and tenant-facing audit access are undecided.
- No alerting on verification failure exists.

## Alternatives considered

- **Append-only table without hashing.** Cheap, but silent edits are undetectable.
- **External log service (e.g. an append-only SaaS).** Stronger, adds a dependency
  and a data-sharing decision; revisit for production.
- **Signed records with an asymmetric key.** Better against database-owner tampering,
  but requires key management Hestian does not have.
- **Merkle tree with periodic roots.** More efficient verification at scale; overkill
  for current volume, possible later without changing the record format.

## Follow-ups

1. Decide retention and an export/anchor mechanism before production.
2. Add monitoring that runs `verifyAuditChain` and alerts on failure.
3. Make consequential action + audit atomic where the financial core requires it.
4. Add actor attribution for HTTP auth events if the provider exposes it safely.
