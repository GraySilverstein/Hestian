import { afterEach, describe, expect, it } from "vitest";

import { createTestDatabase, insertUser, type TestDatabase } from "../helpers/sqlite";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  return database;
}

function tableNames(db: TestDatabase): string[] {
  const rows = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return rows.map((row) => row.name).sort();
}

describe("database schema", () => {
  it("applies every migration from an empty database", () => {
    const db = open();
    expect(tableNames(db)).toEqual([
      "audit_event",
      "governance_data_export",
      "governance_deletion_request",
      "identity_account",
      "identity_rate_limit",
      "identity_session",
      "identity_two_factor",
      "identity_user",
      "identity_verification",
      "platform_rate_limit",
      "tenancy_business",
      "tenancy_invitation",
      "tenancy_membership",
    ]);
  });

  it("adds two-factor state without breaking existing users", () => {
    const db = open();
    insertUser(db.raw, { id: "user_a", email: "a@example.com" });
    const user = db.raw
      .prepare("SELECT twoFactorEnabled FROM identity_user WHERE id = 'user_a'")
      .get() as { twoFactorEnabled: number };
    expect(user.twoFactorEnabled).toBe(0);

    const columns = db.raw.prepare("PRAGMA table_info(identity_two_factor)").all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["userId", "secret", "backupCodes", "verified"]),
    );
  });

  it("carries tenant ownership in every tenant-scoped table", () => {
    const db = open();
    for (const table of ["tenancy_membership", "tenancy_invitation", "audit_event"]) {
      const columns = db.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(columns.map((column) => column.name)).toContain("business_id");
    }
  });

  it("rejects invalid roles, outcomes and orphaned memberships", () => {
    const db = open();
    insertUser(db.raw, { id: "user_a", email: "a@example.com" });
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `INSERT INTO tenancy_business
           (id, name, functional_currency, created_by_user_id, created_at, updated_at)
         VALUES ('b1', 'Alpha', 'USD', 'user_a', ?, ?)`,
      )
      .run(now, now);

    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO tenancy_membership
             (id, business_id, user_id, role, status, created_at, updated_at)
           VALUES ('m_bad_role', 'b1', 'user_a', 'superuser', 'active', ?, ?)`,
        )
        .run(now, now),
    ).toThrow();

    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO tenancy_membership
             (id, business_id, user_id, role, status, created_at, updated_at)
           VALUES ('m_orphan', 'missing-business', 'user_a', 'owner', 'active', ?, ?)`,
        )
        .run(now, now),
    ).toThrow();

    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO audit_event
             (id, occurred_at, action, outcome, correlation_id, metadata, prev_hash, hash)
           VALUES ('e1', ?, 'test', 'tampered', 'corr', '{}', 'p', 'h')`,
        )
        .run(now),
    ).toThrow();
  });

  it("protects the audit log with append-only triggers", () => {
    const db = open();
    const triggers = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all() as { name: string }[];
    expect(triggers.map((trigger) => trigger.name).sort()).toEqual([
      "audit_event_reject_delete",
      "audit_event_reject_update",
    ]);
  });

  it("enforces unique membership and one pending invitation per email", () => {
    const db = open();
    insertUser(db.raw, { id: "user_a", email: "a@example.com" });
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `INSERT INTO tenancy_business
           (id, name, functional_currency, created_by_user_id, created_at, updated_at)
         VALUES ('b1', 'Alpha', 'USD', 'user_a', ?, ?)`,
      )
      .run(now, now);

    const insertInvitation = (id: string, tokenHash: string) =>
      db.raw
        .prepare(
          `INSERT INTO tenancy_invitation
             (id, business_id, email, role, token_hash, status, expires_at, created_at, created_by_user_id)
           VALUES (?, 'b1', 'invitee@example.com', 'employee', ?, 'pending', ?, ?, 'user_a')`,
        )
        .run(id, tokenHash, now, now);

    insertInvitation("i1", "hash-one");
    expect(() => insertInvitation("i2", "hash-two")).toThrow();
  });
});
