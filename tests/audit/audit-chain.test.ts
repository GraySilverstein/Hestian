import { afterEach, describe, expect, it } from "vitest";

import { recordAuditEvent, verifyAuditChain } from "@/modules/audit";

import { createTestDatabase, type TestDatabase } from "../helpers/sqlite";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  return database;
}

const baseEvent = {
  action: "tenancy.business_created",
  outcome: "success" as const,
  actorUserId: "user_a",
  businessId: "business_a",
  correlationId: "corr_1",
};

describe("audit chain", () => {
  it("appends a verifiable hash chain", async () => {
    const { db } = open();

    await recordAuditEvent(db, baseEvent);
    await recordAuditEvent(db, { ...baseEvent, action: "tenancy.invitation_created" });
    await recordAuditEvent(db, { ...baseEvent, action: "tenancy.member_removed", outcome: "denied" });

    const verification = await verifyAuditChain(db);
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(3);
  });

  it("reports an empty chain as valid", async () => {
    const { db } = open();
    const verification = await verifyAuditChain(db);
    expect(verification).toEqual({ valid: true, checked: 0 });
  });

  it("rejects updates and deletes at the database layer", async () => {
    const { db, raw } = open();
    await recordAuditEvent(db, baseEvent);

    expect(() => raw.prepare("UPDATE audit_event SET action = 'tampered'").run()).toThrow(
      /append-only/,
    );
    expect(() => raw.prepare("DELETE FROM audit_event").run()).toThrow(/append-only/);
  });

  it("detects a forged record with an invalid hash", async () => {
    const { db, raw } = open();
    await recordAuditEvent(db, baseEvent);
    const last = raw.prepare("SELECT hash FROM audit_event ORDER BY seq DESC LIMIT 1").get() as {
      hash: string;
    };

    raw
      .prepare(
        `INSERT INTO audit_event
           (id, occurred_at, actor_user_id, business_id, action, outcome, correlation_id,
            metadata, prev_hash, hash)
         VALUES ('forged', '2026-01-01T00:00:00.000Z', 'user_a', 'business_a',
                 'tenancy.business_created', 'success', 'corr_2', '{}', ?, ?)`,
      )
      .run(last.hash, "f".repeat(64));

    const verification = await verifyAuditChain(db);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("hash_mismatch");
  });

  it("redacts sensitive metadata before hashing and storage", async () => {
    const { db, raw } = open();

    await recordAuditEvent(db, {
      ...baseEvent,
      metadata: { email: "owner@example.com", apiKey: "sk_live_do_not_store", nested: { token: "abc" } },
    });

    const row = raw.prepare("SELECT metadata FROM audit_event").get() as { metadata: string };
    expect(row.metadata).not.toContain("sk_live_do_not_store");
    expect(row.metadata).not.toContain('"abc"');
    expect(row.metadata).toContain("owner@example.com");
    expect((await verifyAuditChain(db)).valid).toBe(true);
  });

  it("serialises concurrent appends without forking the chain", async () => {
    const { db } = open();

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        recordAuditEvent(db, {
          ...baseEvent,
          action: `tenancy.concurrent_${index}`,
          correlationId: `corr_${index}`,
        }),
      ),
    );

    const verification = await verifyAuditChain(db);
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(6);
  });
});
