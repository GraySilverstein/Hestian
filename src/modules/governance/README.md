# governance

**Pillar** Platform · **Layer** platform · **Status** in progress (privacy
workflows implemented; period controls and approvals planned)

Policy and control over data and process. Milestone 1.5 implements the personal-data
workflows; accounting period controls and approval policies remain planned.

## Owns

- Personal data export requests and their payloads.
- Account deletion requests, blockers and completion records.
- (Planned) accounting period controls, approval policies, retention rules and access
  reviews.

## Does not own

- Authentication, sessions or second factors (see `identity`).
- Business membership and authorization decisions (see `tenancy`).
- Financial records, journal entries or payments.
- Audit storage, although it writes audit events through the audit module.

## May depend on

`identity`, `tenancy`, `audit`, `~core`.

## Public surface

| Export | Purpose |
| --- | --- |
| `requestExport(db, userId, now?)` | Builds a self-scoped bundle and stores it for one hour. |
| `loadExport(db, exportId, userId, now?)` | Owner-only, expiry-checked read; marks downloaded and audits. |
| `requestDeletion(db, userId, now?)` | Blocks a sole owner, otherwise atomically removes identity and anonymises. |

## Invariants

- Export scope is the requesting user's profile, memberships and session timestamps;
  never another user's details, tenant records or credentials.
- An export id is not authority: the query filters on `requested_by_user_id`.
- Expired exports return `NOT_FOUND`.
- Deletion is blocked for a sole active owner; businesses are never orphaned.
- Identity, credentials, sessions, second factors and memberships are removed in one
  D1 batch together with the audit event.
- Business records and audit events are retained; no statutory retention period is
  asserted.

## Status

Milestone 1.5: export and identity deletion implemented and tested. Ownership
transfer, business closure, integration-credential revocation, grace periods and
retention schedules are not implemented — see
[docs/decisions/0014](../../../docs/decisions/0014-export-and-deletion.md).
