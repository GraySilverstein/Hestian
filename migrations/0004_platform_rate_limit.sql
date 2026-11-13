-- Application rate limiting for non-auth actions.
--
-- Better Auth rate-limits its own endpoints in identity_rate_limit. This table
-- covers business operations (create business, invitations, role changes) that
-- are authenticated but still abusable.

CREATE TABLE platform_rate_limit (
  key text not null primary key,
  window_start integer not null,
  count integer not null check (count >= 1)
);
