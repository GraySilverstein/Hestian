import { afterEach, describe, expect, it } from "vitest";

import {
  acceptInvitation,
  changeMemberRole,
  createBusiness,
  getBusiness,
  inviteMember,
  listBusinessesForUser,
  listMembers,
  removeMember,
  resolveTenantContext,
} from "@/modules/tenancy";

import { createTestDatabase, insertUser, type TestDatabase } from "../helpers/sqlite";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function setup(): TestDatabase {
  const test = createTestDatabase();
  insertUser(test.raw, { id: "user_a", email: "a@example.com", name: "Alice" });
  insertUser(test.raw, { id: "user_b", email: "b@example.com", name: "Bob" });
  insertUser(test.raw, { id: "user_c", email: "c@example.com", name: "Cara" });
  database = test;
  return test;
}

async function createBusinessFor(db: TestDatabase, userId: string, name: string) {
  const created = await createBusiness(db.db, { userId, name, currency: "USD" });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.businessId;
}

describe("tenant isolation", () => {
  it("resolves membership from the database, not from the supplied id", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const beta = await createBusinessFor(db, "user_b", "Beta");

    const own = await resolveTenantContext(db.db, "user_a", alpha);
    expect(own.ok).toBe(true);

    const foreign = await resolveTenantContext(db.db, "user_a", beta);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");

    const forged = await resolveTenantContext(
      db.db,
      "user_a",
      "00000000-0000-0000-0000-000000000000",
    );
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.error.code).toBe("NOT_FOUND");

    const malformed = await resolveTenantContext(db.db, "user_a", { id: alpha });
    expect(malformed.ok).toBe(false);
  });

  it("never lists another tenant's members or businesses", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    await createBusinessFor(db, "user_b", "Beta");

    const alphaContext = await resolveTenantContext(db.db, "user_a", alpha);
    if (!alphaContext.ok) throw new Error("context missing");

    const members = await listMembers(db.db, alphaContext.value);
    expect(members.ok).toBe(true);
    if (members.ok) {
      expect(members.value.map((member) => member.userId)).toEqual(["user_a"]);
    }

    const business = await getBusiness(db.db, alphaContext.value);
    expect(business.ok).toBe(true);
    if (business.ok) expect(business.value.name).toBe("Alpha");

    expect((await listBusinessesForUser(db.db, "user_b")).map((b) => b.name)).toEqual(["Beta"]);
    expect((await listBusinessesForUser(db.db, "user_c")).length).toBe(0);
  });

  it("accepts an invitation only for the invited email address", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const context = await resolveTenantContext(db.db, "user_a", alpha);
    if (!context.ok) throw new Error("context missing");

    const invitation = await inviteMember(db.db, context.value, {
      email: "c@example.com",
      role: "employee",
    });
    if (!invitation.ok) throw new Error(invitation.error.message);

    const stolen = await acceptInvitation(db.db, {
      userId: "user_b",
      userEmail: "b@example.com",
      token: invitation.value.token,
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error.code).toBe("NOT_FOUND");

    const accepted = await acceptInvitation(db.db, {
      userId: "user_c",
      userEmail: "c@example.com",
      token: invitation.value.token,
    });
    expect(accepted.ok).toBe(true);

    const replay = await acceptInvitation(db.db, {
      userId: "user_c",
      userEmail: "c@example.com",
      token: invitation.value.token,
    });
    expect(replay.ok).toBe(false);

    const members = await listMembers(db.db, context.value);
    if (members.ok) {
      const cara = members.value.find((member) => member.userId === "user_c");
      expect(cara?.role).toBe("employee");
    }
  });

  it("stores invitation tokens only as hashes", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const context = await resolveTenantContext(db.db, "user_a", alpha);
    if (!context.ok) throw new Error("context missing");

    const invitation = await inviteMember(db.db, context.value, {
      email: "c@example.com",
      role: "agency",
    });
    if (!invitation.ok) throw new Error(invitation.error.message);

    const row = db.raw
      .prepare("SELECT token_hash FROM tenancy_invitation WHERE id = ?")
      .get(invitation.value.invitationId) as { token_hash: string };

    expect(row.token_hash).not.toBe(invitation.value.token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prevents privilege escalation and last-owner removal", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const ownerContext = await resolveTenantContext(db.db, "user_a", alpha);
    if (!ownerContext.ok) throw new Error("context missing");

    const invitation = await inviteMember(db.db, ownerContext.value, {
      email: "c@example.com",
      role: "employee",
    });
    if (!invitation.ok) throw new Error(invitation.error.message);

    await acceptInvitation(db.db, {
      userId: "user_c",
      userEmail: "c@example.com",
      token: invitation.value.token,
    });

    const employeeContext = await resolveTenantContext(db.db, "user_c", alpha);
    if (!employeeContext.ok) throw new Error("employee context missing");

    const members = await listMembers(db.db, ownerContext.value);
    if (!members.ok) throw new Error("members missing");
    const ownerMembership = members.value.find((member) => member.userId === "user_a");
    if (ownerMembership === undefined) throw new Error("owner membership missing");

    const escalation = await changeMemberRole(db.db, employeeContext.value, {
      membershipId: ownerMembership.membershipId,
      role: "employee",
    });
    expect(escalation.ok).toBe(false);
    if (!escalation.ok) expect(escalation.error.code).toBe("FORBIDDEN");

    const removal = await removeMember(db.db, ownerContext.value, {
      membershipId: ownerMembership.membershipId,
    });
    expect(removal.ok).toBe(false);
    if (!removal.ok) expect(removal.error.code).toBe("INVARIANT_VIOLATION");

    const employeeRemoval = await removeMember(db.db, employeeContext.value, {
      membershipId: ownerMembership.membershipId,
    });
    expect(employeeRemoval.ok).toBe(false);
  });

  it("scopes membership updates to the resolved business", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const beta = await createBusinessFor(db, "user_b", "Beta");

    const betaContext = await resolveTenantContext(db.db, "user_b", beta);
    if (!betaContext.ok) throw new Error("context missing");

    const alphaContext = await resolveTenantContext(db.db, "user_a", alpha);
    if (!alphaContext.ok) throw new Error("context missing");

    const alphaMembers = await listMembers(db.db, alphaContext.value);
    if (!alphaMembers.ok) throw new Error("members missing");

    // Bob, an owner of Beta, cannot mutate an Alpha membership by guessing its id.
    const crossTenant = await changeMemberRole(db.db, betaContext.value, {
      membershipId: alphaMembers.value[0]?.membershipId ?? "missing",
      role: "employee",
    });
    expect(crossTenant.ok).toBe(false);
    if (!crossTenant.ok) expect(crossTenant.error.code).toBe("NOT_FOUND");
  });

  it("rejects duplicate memberships at the database level", async () => {
    const db = setup();
    const alpha = await createBusinessFor(db, "user_a", "Alpha");
    const context = await resolveTenantContext(db.db, "user_a", alpha);
    if (!context.ok) throw new Error("context missing");

    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO tenancy_membership
             (id, business_id, user_id, role, status, created_at, updated_at)
           VALUES ('dup', ?, 'user_a', 'employee', 'active', '2026-01-01', '2026-01-01')`,
        )
        .run(context.value.businessId),
    ).toThrow();
  });
});
