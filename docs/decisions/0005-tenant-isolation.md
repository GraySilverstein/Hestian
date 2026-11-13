# 0005 — Tenant isolation without row-level security

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

A business (tenant) may have multiple users, and a user may belong to multiple
businesses. Cross-tenant exposure is a catastrophic defect for a financial system.
The intended store is D1: SQLite-compatible, single primary, no row-level security,
no per-role table grants, no session-level tenant variable.

## Decision

Isolation is enforced **by construction in the application and schema**, not by a
database policy:

1. Every tenant-scoped table has `tenant_id` as a non-null column, included in its
   primary key or unique keys.
2. `TenantContext` is resolved server-side from the verified session and membership
   records. It is never derived from a request body, query string, header or cookie
   value that the client can set.
3. Repository and query functions require a `TenantContext` parameter; there is no
   variant that omits it. The context is applied inside the module, not by callers.
4. Domain objects carry branded identifiers; a `TenantId` cannot be produced from
   an arbitrary string without parsing, and identifiers are validated on entry.
5. Cross-tenant access returns `NOT_FOUND`. `FORBIDDEN` is reserved for a known
   resource in the caller's own tenant.
6. Every module ships a two-tenant isolation suite: for each read and write, a
   probe from tenant B against tenant A's identifiers must fail without revealing
   existence.
7. Foreign keys and composite constraints include `tenant_id`, so a row cannot
   reference a record in another tenant even if application code is wrong.

No module may execute raw SQL assembled from request input.

## Consequences

**Easier:** works on D1 without unsupported features; isolation is testable per
module; failures are ordinary unit/integration failures rather than database
policy mysteries.

**Harder:** every table and query must be written with the tenant; review must
catch missing scoping; there is no database safety net for a forgotten `WHERE`.

**Required:** a shared repository helper that refuses to build a query without a
tenant context, and CI that runs the isolation suite for every module.

## Alternatives considered

- **PostgreSQL with row-level security.** Strongest enforcement, but not available
  on the target platform; would require a different host and connection strategy.
- **Database per tenant.** Strong isolation, impractical for many small tenants on
  D1 and complicates migrations and reporting.
- **Schema per tenant.** Same drawbacks, plus SQLite schema management overhead.
- **Application filtering only, with no schema constraints.** Rejected: a single
  missed filter is a breach; composite keys at least prevent cross-tenant references.

## Follow-ups

1. Implement `TenantContext` and the repository guard in Milestone 2.
2. Verify foreign-key enforcement behaviour in D1 before relying on it.
3. Add an automated probe: every table must contain `tenant_id`, checked by a schema
   test.
4. Log denials with reason codes (without tenant data) for detection of probing.
