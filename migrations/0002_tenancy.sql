-- Tenancy: businesses, memberships and invitations.
--
-- Every tenant-scoped record carries business_id, and composite uniqueness
-- includes it so a global-unique assumption cannot leak across businesses.
-- D1 has no row-level security; isolation is enforced by schema shape, server
-- derived tenant context and the two-tenant test suite.

CREATE TABLE tenancy_business (
  id text not null primary key,
  name text not null,
  functional_currency text not null default 'USD',
  created_by_user_id text not null references identity_user (id),
  created_at text not null,
  updated_at text not null,
  archived_at text,
  check (length(name) between 1 and 120),
  check (functional_currency glob '[A-Z][A-Z][A-Z]')
);

CREATE TABLE tenancy_membership (
  id text not null primary key,
  business_id text not null references tenancy_business (id) on delete cascade,
  user_id text not null references identity_user (id) on delete cascade,
  role text not null check (role in ('owner', 'accountant', 'employee', 'contractor', 'agency')),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at text not null,
  updated_at text not null,
  created_by_user_id text,
  unique (business_id, user_id)
);

CREATE INDEX tenancy_membership_user_idx ON tenancy_membership (user_id, status);
CREATE INDEX tenancy_membership_business_idx ON tenancy_membership (business_id, status);

CREATE TABLE tenancy_invitation (
  id text not null primary key,
  business_id text not null references tenancy_business (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'accountant', 'employee', 'contractor', 'agency')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at text not null,
  created_at text not null,
  created_by_user_id text not null references identity_user (id),
  accepted_by_user_id text references identity_user (id),
  accepted_at text,
  unique (business_id, email, status)
);

CREATE INDEX tenancy_invitation_business_idx ON tenancy_invitation (business_id, status);
