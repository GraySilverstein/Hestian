# audit

**Pillar** Platform · **Layer** platform · **Status** documented

Append-only record of consequential actions. Audit exists so that a financial
state change can be explained months later without trusting application logs.

## Owns

- Audit events: actor, tenant, action, target, outcome, correlation id, timestamp.
- Actor attribution for server-side operations.

## Does not own

- Financial state or its corrections.
- Authorization decisions (it records them, it does not make them).
- Log shipping or observability export.

## May depend on

Nothing. Audit accepts primitive and branded identifiers so that every module can
emit events without a circular dependency.

## Invariants

- Events are append-only. There is no update or delete path in the public surface.
- An event never contains credentials, tokens or full provider payloads.
- A failed audit write is a failed operation. Silence is not an acceptable outcome.

## Status

Milestone 0: responsibilities and boundaries only.
