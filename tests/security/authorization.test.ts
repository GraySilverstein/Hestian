import { describe, expect, it } from "vitest";

import { authorize } from "@/modules/tenancy/repository";
import {
  PERMISSIONS,
  ROLES,
  hasPermission,
  permissionsFor,
  type Permission,
  type Role,
} from "@/modules/tenancy/roles";

const context = (role: Role) => ({
  businessId: "b_1",
  userId: "u_1",
  membershipId: "m_1",
  role,
});

describe("role permissions", () => {
  it("grants every permission to owners and nothing outside the declared set", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("owner", permission)).toBe(true);
    }
    expect(permissionsFor("owner")).toHaveLength(PERMISSIONS.length);
  });

  it("keeps financial authority away from non-financial roles", () => {
    expect(hasPermission("employee", "financial.read")).toBe(false);
    expect(hasPermission("contractor", "financial.read")).toBe(false);
    expect(hasPermission("agency", "financial.read")).toBe(false);
    expect(hasPermission("agency", "growth.write")).toBe(true);
  });

  it("separates membership administration and payment approval from accounting", () => {
    expect(hasPermission("accountant", "financial.post")).toBe(true);
    expect(hasPermission("accountant", "business.manage_members")).toBe(false);
    expect(hasPermission("accountant", "payment.approve")).toBe(false);
  });

  it("gives every role only the read scope it needs", () => {
    for (const role of ROLES) {
      expect(hasPermission(role, "business.read")).toBe(true);
    }
    expect(hasPermission("contractor", "operations.write")).toBe(false);
    expect(hasPermission("employee", "operations.write")).toBe(true);
  });

  it("denies unknown permissions and unknown roles (fail closed)", () => {
    expect(hasPermission("owner", "financial.launder" as Permission)).toBe(false);
    expect(hasPermission("intruder" as Role, "business.read")).toBe(false);
    expect(permissionsFor("intruder" as Role)).toEqual([]);
  });

  it("returns FORBIDDEN from the central gate without leaking role details", () => {
    const result = authorize(context("employee"), "business.manage_members");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.details).toEqual({ permission: "business.manage_members" });
    }
  });

  it("passes the context through when permitted", () => {
    const result = authorize(context("accountant"), "financial.post");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe("accountant");
    }
  });
});
