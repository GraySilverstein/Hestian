import { afterEach, describe, expect, it } from "vitest";

import { exportBusinessAuditEvents, recordAuditEvent, verifyAuditChain } from "@/modules/audit";

import { createTestDatabase, type TestDatabase } from "../helpers/sqlite";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe("audit export", () => {
  it("exports only one business's events with chain fields that verify", async () => {
    database = createTestDatabase();
    const db = database.db;

    for (const [index, businessId] of ["b1", "b2", "b1"].entries()) {
      await recordAuditEvent(db, {
        action: "tenancy.business_created",
        outcome: "success",
        businessId,
        correlationId: `corr-${index}`,
      });
    }

    const exported = await exportBusinessAuditEvents(db, "b1");
    expect(exported).toHaveLength(2);
    expect(exported.every((event) => event.businessId === "b1")).toBe(true);
    expect(exported[0]?.prevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(exported[0]?.hash).toMatch(/^[0-9a-f]{64}$/);

    expect((await verifyAuditChain(db)).valid).toBe(true);
  });
});
