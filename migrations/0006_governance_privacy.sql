-- Privacy workflows owned by the governance module.
--
-- Exports are generated server-side, scoped to the requesting user, stored as a
-- row (never in public object storage) and readable only by that user until they
-- expire. Deletion requests are retained as a record of the workflow; the user
-- row itself is anonymised rather than deleted so foreign keys, audit attribution
-- and any legally retained records survive.

CREATE TABLE "governance_data_export" (
  "id" text not null primary key,
  "requested_by_user_id" text not null references "identity_user" ("id") on delete cascade,
  "status" text not null check ("status" in ('ready', 'downloaded', 'expired')),
  "payload" text not null,
  "created_at" text not null,
  "expires_at" text not null,
  "downloaded_at" text
);

CREATE INDEX "governance_data_export_user_idx"
  ON "governance_data_export" ("requested_by_user_id", "created_at");

CREATE TABLE "governance_deletion_request" (
  "id" text not null primary key,
  "user_id" text not null references "identity_user" ("id"),
  "status" text not null check ("status" in ('blocked', 'completed', 'failed')),
  "blockers" text,
  "requested_at" text not null,
  "completed_at" text
);

CREATE INDEX "governance_deletion_request_user_idx"
  ON "governance_deletion_request" ("user_id", "requested_at");
