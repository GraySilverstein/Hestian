import type { Database } from "@/config/bindings";
import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

import { randomToken, sha256Hex } from "@/core/crypto";

import { hasPermission, isRole, type Permission, type Role } from "./roles";

/**
 * A resolved tenant context. Only `resolveTenantContext` may construct one, and
 * it derives membership from the database — never from client input.
 */
export interface TenantContext {
  readonly businessId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly role: Role;
}

export interface BusinessSummary {
  readonly id: string;
  readonly name: string;
  readonly functionalCurrency: string;
  readonly role: Role;
}

export interface MemberSummary {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly status: "active" | "suspended" | "removed";
  readonly createdAt: string;
}

const MAX_NAME_LENGTH = 120;

function notFound(): DomainError {
  return new DomainError({
    code: "NOT_FOUND",
    message: "Business not found.",
  });
}

function invalid(message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError({
    code: "INVALID_ARGUMENT",
    message,
    ...(details === undefined ? {} : { details }),
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves the tenant for a request.
 *
 * A business id supplied by the client is only a *candidate*: membership is
 * looked up for the authenticated user, and a missing or suspended membership
 * returns NOT_FOUND so an attacker cannot enumerate other businesses.
 */
export async function resolveTenantContext(
  db: Database,
  userId: string,
  candidateBusinessId: unknown,
): Promise<Result<TenantContext, DomainError>> {
  if (typeof candidateBusinessId !== "string" || candidateBusinessId.length === 0) {
    return err(notFound());
  }

  const row = await db
    .prepare(
      `SELECT m.id AS membership_id, m.role AS role
         FROM tenancy_membership m
         JOIN tenancy_business b ON b.id = m.business_id
        WHERE m.business_id = ?
          AND m.user_id = ?
          AND m.status = 'active'
          AND b.archived_at IS NULL`,
    )
    .bind(candidateBusinessId, userId)
    .first<{ membership_id: string; role: string }>();

  if (row === null || !isRole(row.role)) {
    return err(notFound());
  }

  return ok({
    businessId: candidateBusinessId,
    userId,
    membershipId: row.membership_id,
    role: row.role,
  });
}

/** Centralised permission gate. Every protected operation calls exactly this. */
export function authorize(
  context: TenantContext,
  permission: Permission,
): Result<TenantContext, DomainError> {
  if (!hasPermission(context.role, permission)) {
    return err(
      new DomainError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        details: { permission },
      }),
    );
  }
  return ok(context);
}

export async function listBusinessesForUser(
  db: Database,
  userId: string,
): Promise<readonly BusinessSummary[]> {
  const rows = await db
    .prepare(
      `SELECT b.id, b.name, b.functional_currency, m.role
         FROM tenancy_membership m
         JOIN tenancy_business b ON b.id = m.business_id
        WHERE m.user_id = ?
          AND m.status = 'active'
          AND b.archived_at IS NULL
        ORDER BY b.name ASC`,
    )
    .bind(userId)
    .all<{ id: string; name: string; functional_currency: string; role: string }>();

  return rows.results.flatMap((row) =>
    isRole(row.role)
      ? [
          {
            id: row.id,
            name: row.name,
            functionalCurrency: row.functional_currency,
            role: row.role,
          },
        ]
      : [],
  );
}

export async function createBusiness(
  db: Database,
  input: { readonly userId: string; readonly name: string; readonly currency: string },
): Promise<Result<{ readonly businessId: string }, DomainError>> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return err(invalid("Business name must be between 1 and 120 characters."));
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return err(invalid("Functional currency must be an ISO 4217 code."));
  }

  const businessId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // A batch is applied atomically by D1 (and by the test adapter), so a
    // business can never exist without its owner membership.
    await db.batch([
      db
        .prepare(
          `INSERT INTO tenancy_business
             (id, name, functional_currency, created_by_user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(businessId, name, input.currency, input.userId, now, now),
      db
        .prepare(
          `INSERT INTO tenancy_membership
             (id, business_id, user_id, role, status, created_at, updated_at, created_by_user_id)
           VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?)`,
        )
        .bind(membershipId, businessId, input.userId, now, now, input.userId),
    ]);
  } catch {
    return err(
      new DomainError({
        code: "CONFLICT",
        message: "The business could not be created.",
      }),
    );
  }

  return ok({ businessId });
}

export async function getBusiness(
  db: Database,
  context: TenantContext,
): Promise<
  Result<
    { readonly id: string; readonly name: string; readonly functionalCurrency: string },
    DomainError
  >
> {
  const permitted = authorize(context, "business.read");
  if (!permitted.ok) return permitted;

  const row = await db
    .prepare(
      `SELECT id, name, functional_currency
         FROM tenancy_business
        WHERE id = ? AND archived_at IS NULL`,
    )
    .bind(context.businessId)
    .first<{ id: string; name: string; functional_currency: string }>();

  if (row === null) return err(notFound());

  return ok({ id: row.id, name: row.name, functionalCurrency: row.functional_currency });
}

export async function listMembers(
  db: Database,
  context: TenantContext,
): Promise<Result<readonly MemberSummary[], DomainError>> {
  const permitted = authorize(context, "business.read");
  if (!permitted.ok) return permitted;

  const rows = await db
    .prepare(
      `SELECT m.id AS membership_id, m.user_id, m.role, m.status, m.created_at,
              u.name, u.email
         FROM tenancy_membership m
         JOIN identity_user u ON u.id = m.user_id
        WHERE m.business_id = ?
          AND m.status != 'removed'
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'accountant' THEN 1 ELSE 2 END, u.name ASC`,
    )
    .bind(context.businessId)
    .all<{
      membership_id: string;
      user_id: string;
      role: string;
      status: MemberSummary["status"];
      created_at: string;
      name: string;
      email: string;
    }>();

  return ok(
    rows.results.flatMap((row) =>
      isRole(row.role)
        ? [
            {
              membershipId: row.membership_id,
              userId: row.user_id,
              name: row.name,
              email: row.email,
              role: row.role,
              status: row.status,
              createdAt: row.created_at,
            },
          ]
        : [],
    ),
  );
}

async function countActiveOwners(db: Database, businessId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS owners
         FROM tenancy_membership
        WHERE business_id = ? AND role = 'owner' AND status = 'active'`,
    )
    .bind(businessId)
    .first<{ owners: number }>();
  return row?.owners ?? 0;
}

export interface InvitationResult {
  readonly invitationId: string;
  /** Returned once to the authorised inviter so they can share the link. */
  readonly token: string;
  readonly expiresAt: string;
}

export async function inviteMember(
  db: Database,
  context: TenantContext,
  input: { readonly email: string; readonly role: string },
): Promise<Result<InvitationResult, DomainError>> {
  const permitted = authorize(context, "business.manage_members");
  if (!permitted.ok) return permitted;

  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return err(invalid("A valid email address is required."));
  }
  if (!isRole(input.role)) {
    return err(invalid("Unknown role."));
  }

  const existing = await db
    .prepare(
      `SELECT id FROM tenancy_membership
        WHERE business_id = ? AND user_id IN (SELECT id FROM identity_user WHERE lower(email) = ?)
          AND status = 'active'`,
    )
    .bind(context.businessId, email)
    .first<{ id: string }>();
  if (existing !== null) {
    return err(new DomainError({ code: "CONFLICT", message: "That person is already a member." }));
  }

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO tenancy_invitation
           (id, business_id, email, role, token_hash, status, expires_at, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(
        invitationId,
        context.businessId,
        email,
        input.role,
        tokenHash,
        expiresAt,
        now.toISOString(),
        context.userId,
      )
      .run();
  } catch {
    return err(
      new DomainError({
        code: "CONFLICT",
        message: "A pending invitation already exists for that email address.",
      }),
    );
  }

  return ok({ invitationId, token, expiresAt });
}

export async function acceptInvitation(
  db: Database,
  input: { readonly userId: string; readonly userEmail: string; readonly token: string },
): Promise<Result<{ readonly businessId: string }, DomainError>> {
  const tokenHash = await sha256Hex(input.token);
  const now = new Date().toISOString();

  const invitation = await db
    .prepare(
      `SELECT id, business_id, email, role, expires_at
         FROM tenancy_invitation
        WHERE token_hash = ? AND status = 'pending'`,
    )
    .bind(tokenHash)
    .first<{ id: string; business_id: string; email: string; role: string; expires_at: string }>();

  if (invitation === null) {
    return err(new DomainError({ code: "NOT_FOUND", message: "Invitation not found." }));
  }
  if (invitation.expires_at <= now) {
    await db
      .prepare("UPDATE tenancy_invitation SET status = 'expired' WHERE id = ?")
      .bind(invitation.id)
      .run();
    return err(new DomainError({ code: "CONFLICT", message: "Invitation has expired." }));
  }
  if (normalizeEmail(invitation.email) !== normalizeEmail(input.userEmail)) {
    // Do not reveal that the invitation exists for a different address.
    return err(new DomainError({ code: "NOT_FOUND", message: "Invitation not found." }));
  }
  if (!isRole(invitation.role)) {
    return err(new DomainError({ code: "INTERNAL", message: "Invitation has an invalid role." }));
  }

  const membershipId = crypto.randomUUID();

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO tenancy_membership
             (id, business_id, user_id, role, status, created_at, updated_at, created_by_user_id)
           VALUES (?, ?, ?, ?, 'active', ?, ?, NULL)`,
        )
        .bind(membershipId, invitation.business_id, input.userId, invitation.role, now, now),
      db
        .prepare(
          `UPDATE tenancy_invitation
              SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?
            WHERE id = ? AND status = 'pending'`,
        )
        .bind(input.userId, now, invitation.id),
    ]);
  } catch {
    return err(
      new DomainError({ code: "CONFLICT", message: "The invitation could not be accepted." }),
    );
  }

  return ok({ businessId: invitation.business_id });
}

export async function changeMemberRole(
  db: Database,
  context: TenantContext,
  input: { readonly membershipId: string; readonly role: string },
): Promise<Result<void, DomainError>> {
  const permitted = authorize(context, "business.manage_members");
  if (!permitted.ok) return permitted;
  if (!isRole(input.role)) {
    return err(invalid("Unknown role."));
  }

  const target = await db
    .prepare(
      `SELECT id, role, user_id FROM tenancy_membership
        WHERE id = ? AND business_id = ? AND status = 'active'`,
    )
    .bind(input.membershipId, context.businessId)
    .first<{ id: string; role: string; user_id: string }>();

  if (target === null) {
    return err(new DomainError({ code: "NOT_FOUND", message: "Member not found." }));
  }

  if (target.role === "owner" && input.role !== "owner") {
    const owners = await countActiveOwners(db, context.businessId);
    if (owners <= 1) {
      return err(
        new DomainError({
          code: "INVARIANT_VIOLATION",
          message: "A business must retain at least one owner.",
        }),
      );
    }
  }

  await db
    .prepare(
      `UPDATE tenancy_membership SET role = ?, updated_at = ?
        WHERE id = ? AND business_id = ?`,
    )
    .bind(input.role, new Date().toISOString(), target.id, context.businessId)
    .run();

  return ok(undefined);
}

export async function removeMember(
  db: Database,
  context: TenantContext,
  input: { readonly membershipId: string },
): Promise<Result<void, DomainError>> {
  const permitted = authorize(context, "business.manage_members");
  if (!permitted.ok) return permitted;

  const target = await db
    .prepare(
      `SELECT id, role FROM tenancy_membership
        WHERE id = ? AND business_id = ? AND status = 'active'`,
    )
    .bind(input.membershipId, context.businessId)
    .first<{ id: string; role: string }>();

  if (target === null) {
    return err(new DomainError({ code: "NOT_FOUND", message: "Member not found." }));
  }

  if (target.role === "owner" && (await countActiveOwners(db, context.businessId)) <= 1) {
    return err(
      new DomainError({
        code: "INVARIANT_VIOLATION",
        message: "A business must retain at least one owner.",
      }),
    );
  }

  await db
    .prepare(
      `UPDATE tenancy_membership SET status = 'removed', updated_at = ?
        WHERE id = ? AND business_id = ?`,
    )
    .bind(new Date().toISOString(), target.id, context.businessId)
    .run();

  return ok(undefined);
}
