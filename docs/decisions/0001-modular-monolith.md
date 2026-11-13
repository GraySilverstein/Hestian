# 0001 — Modular monolith with an enforced module registry

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Hestian must separate financial authority from business process and analytics, or
AI and marketing features will eventually acquire a write path into accounting.
The team is small and the deployment target is a serverless platform with a
request-scoped runtime and a single SQLite-compatible database.

Options for achieving separation were: separate services, separate deployment
units in one repository, or one deployable with enforced internal boundaries.

## Decision

Hestian is a **single Next.js application** divided into bounded contexts
(`src/modules/<module>`), each with an explicit ownership document and a declared
dependency list in `src/modules/manifest.ts`.

Boundaries are enforced statically by `tests/architecture/boundaries.test.ts`,
which scans real import statements and fails when:

- a module imports an undeclared module;
- a non-analytical layer imports an analytical module;
- `financial-core` depends on anything except `tenancy` and `audit`;
- a module imports the app shell, or `src/core` imports a module;
- the declared graph contains a cycle.

Modules communicate through exported contracts, never by reading another module's
tables.

## Consequences

**Easier:** one deploy, one database, atomic postings without sagas, fast local
development, one test command, no service discovery or network contracts.

**Harder:** CI must run the boundary gate on every change; reviewers must reject
"just import it" shortcuts; the build has one failure domain, so a runtime crash in
one module affects all.

**Forbidden:** analytical code calling financial write functions; shared mutable
tables between modules; importing a module's internals rather than its contract.

**Required next:** a per-module public entry point (`index.ts`) that exports the
module's contracts, and a linter/test rule that forbids deep imports into module
internals.

## Alternatives considered

- **Microservices.** Rejected: distributed transactions for postings, high
  operational cost, no benefit at this scale, and boundaries would be enforced by
  network contracts that are harder to change safely.
- **Single app without module structure.** Rejected: the AI-to-accounting
  separation would be a convention only, and conventions do not survive deadlines.
- **One repository, several deployables.** Rejected for now: shared schema and
  transactional posting become awkward, and Workers deployment would multiply
  without benefit. The module graph keeps this option open.

## Follow-ups

- Add module entry points when the first module gains behaviour (Milestone 1).
- Decide the enforcement for cross-module read contracts (read-only types versus a
  distinct port interface).
- Revisit only if a module's resource profile genuinely requires isolation.
