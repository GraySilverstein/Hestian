import { afterEach, describe, expect, it } from "vitest";

import { loadExport, requestDeletion, requestExport } from "@/modules/governance";
import { createBusiness } from "@/modules/tenancy";

import { createTestAuth } from "../helpers/auth";
import { createTestDatabase, insertUser, type TestDatabase } from "../helpers/sqlite";

const PASSWORD = "correct-horse-battery-staple";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  insertUser(database.raw, { id: "user_a", email: "a@example.com" });
  insertUser(database.raw, { id: "user_b", email: "b@example.com" });
  return database;
}

async function createBusinessFor(db: TestDatabase, userId: string, name: string): Promise<string> {
  const created = await createBusiness(db.db, { userId, name, currency: "USD" });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.businessId;
}

function addMember(db: TestDatabase, businessId: string, userId: string): void {
  db.raw
    .prepare(
      `INSERT INTO tenancy_membership
         (id, business_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'employee', 'active', ?, ?)`,
    )
    .run(crypto.randomUUID(), businessId, userId, new Date().toISOString(), new Date().toISOString());
}

describe("privacy exports", () => {
  it("includes only the requesting user's data and is owner-scoped", async () => {
    const db = open();
    const businessId = await createBusinessFor(db, "user_a", "Alpha");
    addMember(db, businessId, "user_b");

    const exported = await requestExport(db.db, "user_a");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const download = await loadExport(db.db, exported.value.exportId, "user_a");
    expect(download.ok).toBe(true);
    if (!download.ok) return;

    const body = JSON.parse(download.value.body) as {
      subject: { email: string };
      memberships: { businessName: string; role: string }[];
    };
    expect(body.subject.email).toBe("a@example.com");
    expect(body.memberships).toEqual([
      expect.objectContaining({ businessName: "Alpha", role: "owner" }),
    ]);
    expect(download.value.body).not.toContain("b@example.com");

    // Another user cannot read the export, even with the exact id.
    const foreign = await loadExport(db.db, exported.value.exportId, "user_b");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");

    const events = db.raw
      .prepare("SELECT action FROM audit_event ORDER BY seq ASC")
      .all() as { action: string }[];
    expect(events.map((event) => event.action)).toEqual([
      "privacy.export_requested",
      "privacy.export_downloaded",
    ]);
  });

  it("refuses an expired export", async () => {
    const db = open();
    const now = new Date("2026-01-01T00:00:00.000Z");

    const exported = await requestExport(db.db, "user_a", now);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const download = await loadExport(db.db, exported.value.exportId, "user_a", later);
    expect(download.ok).toBe(false);
  });
});

describe("account deletion", () => {
  it("blocks a sole owner instead of orphaning the business", async () => {
    const db = open();
    const businessId = await createBusinessFor(db, "user_a", "Alpha");

    const result = await requestDeletion(db.db, "user_a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe("blocked");
    expect(result.value.blockers).toEqual([
      { businessId, businessName: "Alpha", reason: "sole_owner" },
    ]);

    const user = db.raw
      .prepare("SELECT email FROM identity_user WHERE id = 'user_a'")
      .get() as { email: string };
    expect(user.email).toBe("a@example.com");
  });

  it("removes identity, credentials and sessions, anonymises the profile, and audits it", async () => {
    const test = open();
    const { raw } = test;
    const businessId = await createBusinessFor(test, "user_a", "Alpha");

    const auth = createTestAuth(raw);
    await auth.api.signUpEmail({
      body: { name: "C", email: "c@example.com", password: PASSWORD },
      headers: new Headers(),
    });
    const user = raw
      .prepare("SELECT id FROM identity_user WHERE email = 'c@example.com'")
      .get() as { id: string };
    addMember(test, businessId, user.id);
    const signIn = await auth.api.signInEmail({
      body: { email: "c@example.com", password: PASSWORD },
      headers: new Headers(),
    });
    expect(signIn.user.id).toBe(user.id);

    const result = await requestDeletion(test.db, user.id);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    if (!result.ok) return;
    expect(result.value.status).toBe("completed");

    const rows = {
      user: raw.prepare("SELECT name, email, emailVerified FROM identity_user WHERE id = ?").get(user.id),
      accounts: raw.prepare("SELECT COUNT(*) AS n FROM identity_account WHERE userId = ?").get(user.id),
      sessions: raw.prepare("SELECT COUNT(*) AS n FROM identity_session WHERE userId = ?").get(user.id),
      memberships: raw
        .prepare("SELECT status FROM tenancy_membership WHERE user_id = ? AND business_id = ?")
        .get(user.id, businessId),
    } as {
      user: { name: string; email: string; emailVerified: number };
      accounts: { n: number };
      sessions: { n: number };
      memberships: { status: string };
    };

    expect(rows.user.name).toBe("Deleted user");
    expect(rows.user.email).toMatch(/^deleted\+.+@deleted\.invalid$/);
    expect(rows.accounts.n).toBe(0);
    expect(rows.sessions.n).toBe(0);
    expect(rows.memberships.status).toBe("removed");

    const audit = raw
      .prepare("SELECT action, outcome FROM audit_event WHERE action = 'privacy.account_deleted'")
      .get() as { action: string; outcome: string };
    expect(audit.outcome).toBe("success");

    const business = raw.prepare("SELECT name FROM tenancy_business WHERE id = ?").get(businessId) as {
      name: string;
    };
    expect(business.name).toBe("Alpha");
  });
});
