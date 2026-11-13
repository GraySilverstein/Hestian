-- Append-only security audit log.
--
-- `prev_hash` is unique so concurrent appends cannot fork the chain: a racing
-- writer loses the constraint and retries against the new head. Triggers reject
-- UPDATE and DELETE, so ordinary application code (and a compromised query) can
-- neither edit nor remove history.
--
-- business_id is intentionally not a foreign key: audit must be able to record
-- events about a tenant that no longer exists, and the audit module must not
-- depend on tenancy's schema.

CREATE TABLE audit_event (
  seq integer primary key autoincrement,
  id text not null unique,
  occurred_at text not null,
  actor_user_id text,
  business_id text,
  action text not null,
  outcome text not null check (outcome in ('success', 'denied', 'failure')),
  target_type text,
  target_id text,
  correlation_id text not null,
  metadata text not null default '{}',
  prev_hash text not null unique,
  hash text not null unique
);

CREATE INDEX audit_event_business_idx ON audit_event (business_id, seq);
CREATE INDEX audit_event_actor_idx ON audit_event (actor_user_id, seq);

CREATE TRIGGER audit_event_reject_update
BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER audit_event_reject_delete
BEFORE DELETE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;
