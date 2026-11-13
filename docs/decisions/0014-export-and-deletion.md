# 0014 — Personal data export and account deletion

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Milestone 1 had no export or deletion path. Both are privacy obligations and both
can destroy evidence if implemented naively. Financial records do not exist yet, but
business records, memberships and audit events do, and a sole owner deleting their
identity could orphan a tenant.

## Decision

1. **Export is self-scoped.** The bundle contains the requester's profile, their
   memberships (business id, name, role, status, join date) and session timestamps.
   It excludes other people's details, tenant financial data, tokens, IP addresses,
   user agents and audit payloads.
2. **Export is stored in D1, not object storage.** A `governance_data_export` row
   holds the payload for one hour. There is no signed URL or public object to leak;
   the download route requires the owning session and checks `requested_by_user_id`.
3. **Expiry is enforced on read.** An expired row returns `NOT_FOUND`; ids are
   UUIDs and ownership is checked in the query, so probing reveals nothing.
4. **Generation and download are rate limited and audited** (`privacy.export_requested`,
   `privacy.export_downloaded`), with a recent-authentication requirement.
5. **Deletion is identity deletion, not data erasure.** One atomic batch records the
   request, deletes credentials, sessions, second factors and memberships, revokes
   pending invitations, anonymises the profile (name, email, verification and MFA
   flags) and appends the audit event.
6. **The user row survives, anonymised.** Foreign keys, audit attribution and any
   legally retained business records keep a stable pseudonymous reference. The
   email becomes `deleted+<uuid>@deleted.invalid`, which cannot receive mail.
7. **Sole owners are blocked.** If the user is the only active owner of a business,
   deletion is refused and the blocking businesses are named. Ownership transfer and
   business closure are separate workflows that do not exist yet; the system must not
   silently orphan a tenant.
8. **Strong reauthentication is required**: current password verified server-side,
   recent session, and a typed `DELETE` confirmation.
9. **Retention is explicit, not invented.** Audit events, business records and
   deletion-request records are retained. No statutory retention period is asserted
   because none has been fixed with legal review. This is a documented gap, not a
   compliance claim.
10. **Integration credential revocation is a no-op today** because no integration
    credentials exist; when they do, deletion must revoke them in the same workflow.

## Evidence

`tests/privacy/privacy.test.ts` proves bundle scoping, foreign-user denial, expiry,
sole-owner blocking, credential/session/membership removal, anonymisation, business
preservation and the audit event. The runtime script proves the download route
rejects unauthenticated access.

## Consequences

**Easier:** export cannot cross tenants by construction; deletion leaves no usable
credential and no orphaned tenant.

**Harder:** a deleted user cannot be identified by email afterwards, by design;
support must use the pseudonymous id and audit trail.

**Limitations:** no grace period, no cancel step, no email notification (delivery
blocked), no ownership-transfer flow, no business closure, no export of audit
events through this route (a separate tenant-scoped audit export exists for roles
with `audit.read`), and no fixed retention schedule.

## Alternatives considered

- **Hard-delete the user row.** Would break audit attribution and any retained
  business references; an anonymised tombstone is safer.
- **Export to R2 with a signed URL.** Adds a storage dependency and link-leak surface
  before R2 is provisioned.
- **Delete business data with the user.** Rejected: hides records other members may
  own and could destroy legally required evidence.

## Follow-ups

1. Ownership transfer and business closure workflows before financial data exists.
2. Legal review of retention periods by jurisdiction, then encode them.
3. Email confirmation of deletion once delivery is available.
4. Include integration credential revocation when integrations exist.
5. Consider a short grace period with cancellation, if product policy allows.
