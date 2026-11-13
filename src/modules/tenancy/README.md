# tenancy

**Pillar** Platform · **Layer** platform · **Status** implemented and tested

Defines the tenant boundary: which business is being operated and who may act within
it. Every tenant-scoped query passes through a decision made here.

## Owns

- Businesses (tenants) and their lifecycle.
- Memberships linking verified subjects to businesses.
- Role assignments (owner, accountant, employee, contractor, agency).
- The permission matrix and invitation flow.
- Tenant-scoped access decisions returned as explicit results.

## Does not own

- Authentication (see `identity`).
- Financial records, which belong to their owning module and carry `business_id`.
- Audit storage, although it emits audit events for membership changes.

## May depend on

`identity`, `audit`, `~core`.

## Public surface

| Export | Purpose |
| --- | --- |
| `resolveTenantContext(db, userId, businessId)` | Loads membership; the only source of tenant authority. |
| `authorize(context, permission)` | Central gate; returns `Result<TenantContext>`. |
| `hasPermission(role, permission)` | Pure exhaustive matrix. |
| `createBusiness`, `getBusiness`, `listBusinessesForUser` | Business lifecycle and scoped reads. |
| `listMembers`, `changeMemberRole`, `removeMember` | Membership management with invariants. |
| `inviteMember`, `acceptInvitation`, `revokeInvitation` | Hashed-token invitations bound to an email. |

## Invariants

- Every tenant-scoped record carries `business_id`; queries are never run without it.
- Authorization is decided on the server. A client-supplied role or business id is
  never authority.
- Cross-tenant access returns `NOT_FOUND`, not `FORBIDDEN`.
- Membership mutations include `business_id` in the statement, so guessed row ids in
  another tenant match nothing.
- A business always retains at least one active owner.
- Invitation tokens are stored only as SHA-256 hashes, are single-use, and require
  the signed-in email to match.

## Status

Milestone 1: implemented. Full role matrix, two-tenant isolation, invitation binding,
privilege-escalation and last-owner tests pass; schema constraints tested against the
real migrations.
