import { afterEach, describe, expect, it } from "vitest";

import { commitWithAudit, recordAuditEvent, verifyAuditChain } from "@/modules/audit";

import { createTestDatabase, insertUser, type TestDatabase } from "../helpers/sqlite";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  insertUser(database.raw, { id: "user_a", email: "a@example.com" });
  return database;
}

function auditCount(db: TestDatabase): number {
  return (db.raw.prepare("SELECT COUNT(*) AS n FROM audit_event").get() as { n: number }).n;
}

const now = new Date("2026-01-01T00:00:00.000Z");

describe("audit atomicity", () => {
  it("commits the business write and its audit event together", async () => {
    const db = open();

    const result = await commitWithAudit(
      db.db,
      [
        db.db
          .prepare(
            `INSERT INTO tenancy_business
               (id, name, functional_currency, created_by_user_id, created_at, updated_at)
             VALUES ('b1', 'Alpha', 'USD', 'user_a', ?, ?)`,
          )
          .bind(now.toISOString(), now.toISOString()),
      ],
      {
        action: "tenancy.business_created",
        outcome: "success",
        actorUserId: "user_a",
        businessId: "b1",
        correlationId: "corr-1",
      },
      () => now,
    );

    expect(result.event.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditCount(db)).toBe(1);
    expect((await verifyAuditChain(db.db)).valid).toBe(true);
  });

  it("rolls back the business write when the audit append cannot commit", async () => {
    const db = open();

    await expect(
      commitWithAudit(
        db.db,
        [
          db.db
            .prepare(
              `INSERT INTO tenancy_business
                 (id, name, functional_currency, created_by_user_id, created_at, updated_at)
               VALUES ('b2', 'Beta', 'USD', 'user_a', ?, ?)`,
            )
            .bind(now.toISOString(), now.toISOString()),
          // Invalid role violates a CHECK constraint, so the whole batch fails.
          db.db
            .prepare(
              `INSERT INTO tenancy_membership
                 (id, business_id, user_id, role, status, created_at, updated_at)
               VALUES ('m1', 'b2', 'user_a', 'superuser', 'active', ?, ?)`,
            )
            .bind(now.toISOString(), now.toISOString()),
        ],
        {
          action: "tenancy.business_created",
          outcome: "success",
          actorUserId: "user_a",
          correlationId: "corr-2",
        },
        () => now,
      ),
    ).rejects.toThrow();

    const businesses = db.raw.prepare("SELECT COUNT(*) AS n FROM tenancy_business").get() as {
      n: number;
    };
    expect(businesses.n).toBe(0);
    expect(auditCount(db)).toBe(0);
  });

  it("serialises concurrent audited writes without breaking the chain", async () => {
    const db = open();

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        commitWithAudit(
          db.db,
          [
            db.db
              .prepare(
                `INSERT INTO tenancy_business
                   (id, name, functional_currency, created_by_user_id, created_at, updated_at)
                 VALUES (?, ?, 'USD', 'user_a', ?, ?)`,
              )
              .bind(`b${index + 10}`, `Business ${index}`, now.toISOString(), now.toISOString()),
          ],
          {
            action: "tenancy.business_created",
            outcome: "success",
            actorUserId: "user_a",
            businessId: `b${index + 10}`,
            correlationId: `corr-${index}`,
          },
          () => now,
        ),
      ),
    );

    expect(auditCount(db)).toBe(6);
    const verification = await verifyAuditChain(db.db);
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(6);
  });

  it("detects a modified audit row", async () => {
    const db = open();
    await recordAuditEvent(db.db, {
      action: "test.event",
      outcome: "success",
      correlationId: "corr",
    });

    // Simulate an attacker who can bypass the append-only triggers.
    db.raw.exec("DROP TRIGGER audit_event_reject_update");
    db.raw.exec("UPDATE audit_event SET action = 'tampered.event'");

    const verification = await verifyAuditChain(db.db);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("hash_mismatch");
  });
});
