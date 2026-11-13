# tenancy

**Pillar** Platform · **Layer** platform · **Status** documented

Defines the tenant boundary: which business is being operated and who may act
within it. Every tenant-scoped query in Hestian passes through a decision made
here.

## Owns

- Businesses (tenants) and their lifecycle.
- Memberships linking verified subjects to businesses.
- Role assignments (owner, accountant, employee, contractor, agency).
- Tenant-scoped access decisions returned as explicit results.

## Does not own

- Authentication (see `identity`).
- Financial records, which belong to their owning module and carry a tenant id.
- Audit storage, although it emits audit events for membership changes.

## May depend on

`identity`, `audit`.

## Invariants

- Every tenant-scoped record carries a `TenantId`; queries are never run without one.
- Authorization is decided on the server. A client-side role claim is never trusted.
- Cross-tenant access returns `NOT_FOUND`, not `FORBIDDEN`, to avoid confirming existence.

## Status

Milestone 0: responsibilities and boundaries only.
