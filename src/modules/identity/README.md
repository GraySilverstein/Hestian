# identity

**Pillar** Platform · **Layer** platform · **Status** documented

Proves who is acting. Identity answers one question and nothing else: is this a
verified subject, and what is the server-issued proof of that?

## Owns

- Authenticated subject records and their verified provider references.
- Session lifecycle and revocation state.
- Credential references; raw secrets are never stored here.

## Does not own

- Roles, permissions or business membership (see `tenancy`).
- Any business or financial data.

## May depend on

Nothing. This is the innermost module in the graph.

## Invariants

- A subject is never inferred from a client-supplied header or identifier.
- Missing or unverifiable identity fails closed with `UNAUTHENTICATED`.
- Session tokens are never logged, stored in plaintext, or exposed to other tenants.

## Status

Milestone 0: responsibilities and boundaries only. No authentication is implemented
and none is simulated.
