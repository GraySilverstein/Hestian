/**
 * Role and permission definitions.
 *
 * Roles are ceilings. A resource-level grant may narrow what a member can reach
 * but never widen it beyond the permissions listed here. Every check is a pure
 * function so the matrix can be tested exhaustively without a database.
 */
export const ROLES = ["owner", "accountant", "employee", "contractor", "agency"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "business.read",
  "business.manage_members",
  "business.manage_settings",
  "financial.read",
  "financial.write",
  "financial.post",
  "reconciliation.manage",
  "operations.read",
  "operations.write",
  "growth.read",
  "growth.write",
  "intelligence.read",
  "audit.read",
  "export.request",
  "payment.approve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: OWNER_PERMISSIONS,
  accountant: [
    "business.read",
    "financial.read",
    "financial.write",
    "financial.post",
    "reconciliation.manage",
    "operations.read",
    "growth.read",
    "intelligence.read",
    "audit.read",
    "export.request",
  ],
  employee: ["business.read", "operations.read", "operations.write"],
  contractor: ["business.read", "operations.read"],
  agency: ["business.read", "growth.read", "growth.write", "intelligence.read"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Deny by default: an unknown role or permission grants nothing. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  owner: "Owner",
  accountant: "Accountant",
  employee: "Employee",
  contractor: "Contractor",
  agency: "Agency",
};
