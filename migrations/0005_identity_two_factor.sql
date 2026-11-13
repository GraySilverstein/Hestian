-- Two-factor authentication (Better Auth 1.7.22 twoFactor plugin).
-- Generated from src/modules/identity/auth-options.ts via
-- scripts/generate-auth-schema.ts, with two deliberate changes:
--   * twoFactorEnabled defaults to 0 so existing users are explicitly "off"
--     rather than NULL.
--   * table and index names are namespaced like the rest of the identity schema.
-- Existing rows keep working; enrolment is opt-in.

ALTER TABLE identity_user ADD COLUMN twoFactorEnabled integer NOT NULL DEFAULT 0;

CREATE TABLE "identity_two_factor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "identity_user" ("id") on delete cascade,
  "verified" integer,
  "failedVerificationCount" integer,
  "lockedUntil" date
);

CREATE INDEX "identity_two_factor_secret_idx" ON "identity_two_factor" ("secret");

CREATE INDEX "identity_two_factor_userId_idx" ON "identity_two_factor" ("userId");
