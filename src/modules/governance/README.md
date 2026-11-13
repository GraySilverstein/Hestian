# governance

**Pillar** Platform · **Layer** platform · **Status** documented

Policy and control: the rules that constrain what may happen, separate from the
code that performs it.

## Owns

- Accounting period controls (open, locked, closed).
- Approval policies for consequential actions.
- Retention policy and access review schedules.
- Control status reporting for operators.

## Does not own

- Journal entries, which are posted by `financial-core` after consulting controls.
- Runtime authorization checks (see `tenancy`).
- Payments or money movement.

## May depend on

`identity`, `tenancy`, `audit`.

## Invariants

- A locked period rejects new postings; it is never silently reopened.
- Policy changes are audited with the previous and new policy version.
- Controls fail closed: if control state cannot be read, the action does not proceed.

## Status

Milestone 0: responsibilities and boundaries only. Period controls are not implemented.
