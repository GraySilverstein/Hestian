import { afterEach, describe, expect, it } from "vitest";

import { consumeRateLimit, enforceRateLimit } from "@/core/rate-limit";

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

const rule = { windowSeconds: 60, max: 2 };
const now = new Date("2026-01-01T00:00:00.000Z");

describe("rate limiting", () => {
  it("allows up to the limit and then reports a retry delay", async () => {
    const { db } = open();

    expect((await consumeRateLimit(db, "key", rule, now)).allowed).toBe(true);
    expect((await consumeRateLimit(db, "key", rule, now)).allowed).toBe(true);

    const blocked = await consumeRateLimit(db, "key", rule, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", async () => {
    const { db } = open();

    await consumeRateLimit(db, "key", rule, now);
    await consumeRateLimit(db, "key", rule, now);
    expect((await consumeRateLimit(db, "key", rule, now)).allowed).toBe(false);

    const later = new Date(now.getTime() + 61_000);
    expect((await consumeRateLimit(db, "key", rule, later)).allowed).toBe(true);
  });

  it("keeps keys independent", async () => {
    const { db } = open();

    await consumeRateLimit(db, "user_a", rule, now);
    await consumeRateLimit(db, "user_a", rule, now);

    expect((await consumeRateLimit(db, "user_a", rule, now)).allowed).toBe(false);
    expect((await consumeRateLimit(db, "user_b", rule, now)).allowed).toBe(true);
  });

  it("returns a RATE_LIMITED domain error from the enforcing wrapper", async () => {
    const { db } = open();

    expect((await enforceRateLimit(db, "key", { windowSeconds: 60, max: 1 }, now)).ok).toBe(true);
    const blocked = await enforceRateLimit(db, "key", { windowSeconds: 60, max: 1 }, now);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("RATE_LIMITED");
  });
});
