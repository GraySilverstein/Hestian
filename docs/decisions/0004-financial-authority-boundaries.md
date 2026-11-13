# 0004 — Financial authority boundaries and AI prohibitions

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Hestian combines deterministic accounting with analytical and AI-derived features.
The most dangerous failure mode is not a wrong forecast; it is a forecast, an
imported document, or a marketing optimisation silently changing the books. Policy
statements in documentation are not sufficient: they erode under delivery pressure.

## Decision

Data is separated into three layers:

- **A. Source evidence** — imported records, documents, webhook metadata. Append-only.
- **B. Accounting authority** — financial events, interpretations, journal entries,
  balances, reconciliation outcomes. Append-only after posting.
- **C. Business intelligence** — forecasts, analyses, recommendations. Recomputable,
  never authoritative.

Authority is enforced by module layer and import direction:

- `financial-core` is the only module that writes Layer B, and it may depend only
  on `tenancy` and `audit`.
- `reconciliation` may write reconciliation outcomes and request postings, but
  never writes journal entries directly.
- `operations` requests financial consequences; it never writes them.
- Analytical modules (`growth`, `commerce-intelligence`, `intelligence`) may read
  A and B through exported contracts and may not be imported by any other layer.
- `intelligence` is imported by nothing.

AI and analysis may never:

1. create authoritative journal entries;
2. modify posted financial records;
3. mark transactions reconciled without verified evidence;
4. execute payments or move money;
5. override permission checks;
6. bypass accounting validation;
7. be recorded as an actual transaction or included in an actuals view.

These are enforced statically in
`tests/architecture/boundaries.test.ts` and are restated as invariants FI-01…FI-22
in [FINANCIAL_INTEGRITY.md](../FINANCIAL_INTEGRITY.md).

## Consequences

**Easier:** a whole class of catastrophic defects becomes a build failure rather
than a review miss; model providers can change without revisiting accounting
correctness; accounting rules stay deterministic and testable.

**Harder:** convenient shortcuts are impossible — an analysis that wants to
"just record an adjustment" must produce a proposal that a human-authorized
operation turns into a financial event. Reporting must join across layers rather
than reading a precomputed "everything" table.

**Required:** read contracts for analytical modules; a proposal/approval path for
AI-derived recommendations; separate types for forecasts vs actuals.

## Alternatives considered

- **Separate services with separate databases.** Strongest isolation, rejected for
  now because of distributed transactions and operational cost (ADR 0001).
- **Database permissions only.** Not available: D1 has no role-based table grants
  or row-level security, and the app uses a single database role.
- **Review discipline and code review alone.** Rejected: unenforceable over time;
  the static gate costs one test file and cannot be forgotten.
- **Let AI post draft entries for review.** Rejected: drafts still enter the books'
  lifecycle, create ambiguity about authority, and invite "approve all".

## Follow-ups

1. Define the proposal object and its approval operation when intelligence work
   begins.
2. Add a runtime guard in the financial-core API that rejects payloads carrying
   model provenance.
3. Add a test that no exported financial-core function accepts a free-form
   "interpretation" object from outside the module.
