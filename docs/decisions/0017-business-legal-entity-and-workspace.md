# 0017 — Business, legal entity and workspace are distinct

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

Hestian serves creators and SMEs, including sole traders, agencies and companies.
The current tenant root is `tenancy_business`. Future requirements include multiple
brands, registered entities and potentially one owner operating several businesses.
Conflating "workspace", "company" and "books" would make consolidation and tenant
isolation ambiguous.

## Decision

1. **Business** is the accounting, ownership and isolation root. It owns one set of
   books, one functional currency, one accounting basis and one fiscal calendar. The
   existing `tenancy_business.id` remains the tenant id.
2. **Legal entity** is an optional, effective-dated record describing a registered
   legal person and tax identifiers. A business may have none (sole trader) or one;
   one legal entity may later own several businesses.
3. **Workspace** is an access/presentation scope. Today it is implicit and 1:1 with a
   business. A future workspace may show several businesses, but every financial
   query still selects exactly one `business_id`.
4. **No implicit consolidation.** There is no parent business, shared ledger or
   aggregated balance until a separate consolidation design exists.
5. **Business type** (`creator`, `service`, `retail`, etc.) selects defaults and
   capabilities, never accounting rules. Changing it does not rewrite posted entries.
6. Functional currency and accounting basis are immutable once a posted entry exists.

## Consequences

**Easier:** one isolation boundary; optional legal details; future multi-business UI
without forking books; creators without companies are first-class.

**Harder:** a future consolidation feature needs explicit intercompany/elimination
design; workspace switching must re-authorize and cannot trust a client business id.

**Forbidden:** treating workspace membership as legal ownership; creating a second
tenant per brand automatically; merging ledgers for convenience.

## Alternatives considered

- **Workspace as legal entity/tenant.** Rejected: a workspace is an access concept and
  may later span businesses.
- **Separate creator and SME tenants.** Rejected: duplicates the ledger and violates
  one canonical financial foundation.
- **Parent business now.** Deferred: consolidation requirements and elimination rules
  are not understood; premature hierarchy risks silent aggregation.

## Follow-ups

- Design ownership transfer and business closure (currently only sole-owner deletion
  is blocked).
- Design consolidation/intercompany only when a customer requirement and accounting
  policy exist.
- Add migrations and tenant tests when these records are implemented.
