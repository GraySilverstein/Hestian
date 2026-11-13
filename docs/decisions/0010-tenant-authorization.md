# 0010 — Tenant context, roles and centralized authorization

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

ADR 0005 set the isolation principle but had no implementation. Authentication
alone must grant nothing: an authenticated user may belong to several businesses,
one business may have several users, and privilege differs by role. Every protected
operation must be denied by default and must not rely on the UI hiding a control.

## Decision

1. **Tenant is a business.** The ownership column is `business_id`
   (the concrete form of the `tenant_id` concept in ADR 0005). It is `NOT NULL` on
   `tenancy_membership`, `tenancy_invitation` and every future tenant-owned table,
   and participates in unique keys.
2. **Roles are fixed enums**: `owner`, `accountant`, `employee`, `contractor`,
   `agency`. `CHECK` constraints reject anything else; an unknown role grants no
   permission at runtime.
3. **`TenantContext` is resolved server-side**: `resolveTenantContext(userId,
   candidateBusinessId)` loads the active membership and returns
   `{ userId, businessId, role, permissions, membershipId }`. The candidate id is a
   lookup key, never proof.
4. **One permission matrix**, `hasPermission(role, permission)`, exhaustive over
   both dimensions and tested. Permissions are capabilities
   (`business.manage_members`, `business.manage_settings`, `financial.read`,
   `financial.write`, `financial.post`, `financial.approve`, `report.read`), not
   role checks scattered in handlers.
5. **One gate**: `authorize(context, permission)` returns `Result<TenantContext>`
   and is the only way a module decides access. Repositories take the resulting
   context, not a raw business id.
6. **Failure semantics:** `UNAUTHENTICATED` when there is no session,
   `NOT_FOUND` when membership or the resource does not resolve in this tenant,
   `FORBIDDEN` only when the resource is known to the caller's tenant but the role
   lacks the capability. This prevents existence probing across tenants.
7. **Resource scope in SQL**: membership updates and removals include
   `business_id = ?` in the `WHERE` clause, so a guessed row id in another tenant
   matches nothing and returns `NOT_FOUND`.
8. **Invariants**: a business always retains at least one active owner; demoting or
   removing the last owner fails with `INVARIANT_VIOLATION`. Role changes and
   removals require `business.manage_members` and recent authentication, and are
   rate limited.
9. **Invitations**: a 256-bit random token is returned once and stored only as its
   SHA-256 hash. Acceptance requires the signed-in user's email to equal the
   invitation email (case-insensitive), and the token is single-use with a 7-day
   expiry. A mismatched user receives `NOT_FOUND`.
10. **Lists are filtered and minimised**: `listMembers` exposes emails only to
    callers with `business.manage_members`; other roles see names and roles.

## Evidence

`tests/security/authorization.test.ts` covers the full matrix; `tests/security/tenant-isolation.test.ts`
creates two independent businesses and proves forged ids, cross-tenant listing,
cross-tenant membership mutation, invitation email mismatch, token replay, role
escalation and last-owner removal all fail. `verify:runtime` proves the
unauthenticated redirect and authenticated tenant page.

## Consequences

**Easier:** one place to change policy; denial is the default; tests can enumerate
roles and permissions; failures do not leak existence.

**Harder:** every new capability must be added to the matrix and tested; adding a
role is a schema migration plus matrix extension; per-resource grants are not yet
possible.

**Forbidden:** accepting `businessId`, `role` or `userId` from the client as
authority; checking only "is signed in"; returning `FORBIDDEN` for foreign
resources; UI-only enforcement.

## Alternatives considered

- **Per-handler checks.** Rejected: inconsistent and easy to forget.
- **Attribute-based access control now.** Premature; the role matrix covers current
  capabilities. Revisit when approvals and financial limits exist.
- **Database RLS.** Not available on D1 (ADR 0005).

## Follow-ups

1. Apply the same context to background jobs and integrations when they exist.
2. Add per-resource grants and approval policies with the financial core.
3. Add a schema test asserting every tenant-owned table has `business_id`.
4. Consider separation of duties once payment approval exists.
