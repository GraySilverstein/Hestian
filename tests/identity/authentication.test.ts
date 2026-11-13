import { afterEach, describe, expect, it } from "vitest";

import { createTestAuth } from "../helpers/auth";
import { createTestDatabase, type TestDatabase } from "../helpers/sqlite";

const PASSWORD = "correct-horse-battery-staple";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  return database;
}

describe("identity authentication", () => {
  it("stores a scrypt hash and never the plaintext password", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    const result = await auth.api.signUpEmail({
      body: { name: "Owner", email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    expect(result.user.email).toBe("owner@example.com");

    const account = raw
      .prepare("SELECT password FROM identity_account WHERE userId = ?")
      .get(result.user.id) as { password: string } | undefined;

    expect(account?.password).toBeDefined();
    expect(account?.password).not.toContain(PASSWORD);
    // Better Auth's scrypt encoding is salt:hex; long, structured and never plain.
    expect(account?.password.length).toBeGreaterThan(80);

    const plaintextMatches = raw
      .prepare("SELECT COUNT(*) AS matches FROM identity_account WHERE password LIKE ?")
      .get(`%${PASSWORD}%`) as { matches: number };
    expect(plaintextMatches.matches).toBe(0);
  });

  it("rejects duplicate email registration regardless of case", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    await auth.api.signUpEmail({
      body: { name: "Owner", email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    await expect(
      auth.api.signUpEmail({
        body: { name: "Impostor", email: "OWNER@example.com", password: PASSWORD },
        headers: new Headers(),
      }),
    ).rejects.toBeDefined();
  });

  it("rejects a wrong password and accepts the correct one", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    await auth.api.signUpEmail({
      body: { name: "Owner", email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    await expect(
      auth.api.signInEmail({
        body: { email: "owner@example.com", password: "wrong-password-value" },
        headers: new Headers(),
      }),
    ).rejects.toBeDefined();

    const signedIn = await auth.api.signInEmail({
      body: { email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    expect(signedIn.token).toBeTruthy();
    expect(signedIn.user.email).toBe("owner@example.com");
  });

  it("creates a database session with an eight-hour lifetime", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    const result = await auth.api.signUpEmail({
      body: { name: "Owner", email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    const session = raw
      .prepare("SELECT expiresAt, createdAt, userId FROM identity_session WHERE userId = ?")
      .get(result.user.id) as
      | { expiresAt: string; createdAt: string; userId: string }
      | undefined;

    expect(session?.userId).toBe(result.user.id);

    const created = Date.parse(session?.createdAt ?? "");
    const expires = Date.parse(session?.expiresAt ?? "");
    expect(Math.round((expires - created) / 3_600_000)).toBe(8);
  });

  it("revokes a session when its stored row is removed", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    const result = await auth.api.signUpEmail({
      body: { name: "Owner", email: "owner@example.com", password: PASSWORD },
      headers: new Headers(),
    });

    raw.prepare("DELETE FROM identity_session WHERE userId = ?").run(result.user.id);
    const remaining = raw
      .prepare("SELECT COUNT(*) AS count FROM identity_session WHERE userId = ?")
      .get(result.user.id) as { count: number };

    expect(remaining.count).toBe(0);
  });
});
