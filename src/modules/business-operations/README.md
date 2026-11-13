# business-operations

**Pillar** Operations · **Layer** operations · **Status** documented

Runs the non-financial side of a creator-led business: people, projects,
workflows and approvals.

## Owns

- People and contractor records, scoped to a tenant.
- Projects, deliverables and workflow state.
- Approval state for operational decisions.
- Project cost records as operational inputs, not as accounting entries.

## Does not own

- Journal entries or account balances.
- Payroll execution, tax withholding or payment rails.
- Marketing campaigns (see `growth`).

## May depend on

`tenancy`, `audit`, `financial-core`. Financial consequences are requested from
`financial-core`; this module never writes financial records directly.

## Invariants

- Approval is explicit state, not an inference from absence of objection.
- Contractor access is scoped to assigned work, not to the whole tenant.
- Cost inputs are validated against `financial-core` contracts before use.

## Status

Milestone 0: responsibilities and boundaries only.
