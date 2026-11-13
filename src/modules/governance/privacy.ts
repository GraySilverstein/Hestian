import type { Database } from "@/config/bindings";
import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

import { commitWithAudit, type AuditEventRecord } from "@/modules/audit";

const EXPORT_TTL_SECONDS = 60 * 60;
const EXPORT_SCHEMA_VERSION = 1;

export interface ExportRequestResult {
  readonly exportId: string;
  readonly expiresAt: string;
  readonly event: AuditEventRecord;
}

export interface ExportBundle {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly subject: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly createdAt: string;
  };
  readonly memberships: readonly {
    readonly businessId: string;
    readonly businessName: string;
    readonly role: string;
    readonly status: string;
    readonly joinedAt: string;
  }[];
  readonly sessions: readonly { readonly createdAt: string; readonly expiresAt: string }[];
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  createdAt: string;
}

interface MembershipRow {
  business_id: string;
  business_name: string;
  role: string;
  status: string;
  created_at: string;
}

interface SessionRow {
  createdAt: string;
  expiresAt: string;
}

interface ExportRow {
  id: string;
  status: "ready" | "downloaded" | "expired";
  payload: string;
  expires_at: string;
}

function notFound(): DomainError {
  return new DomainError({ code: "NOT_FOUND", message: "Export not found." });
}

async function buildBundle(db: Database, userId: string, now: Date): Promise<ExportBundle | null> {
  const user = await db
    .prepare("SELECT id, name, email, emailVerified, createdAt FROM identity_user WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (user === null) return null;

  const memberships = await db
    .prepare(
      `SELECT m.business_id, b.name AS business_name, m.role, m.status, m.created_at
         FROM tenancy_membership m
         JOIN tenancy_business b ON b.id = m.business_id
        WHERE m.user_id = ?
          AND m.status != 'removed'
        ORDER BY m.created_at ASC`,
    )
    .bind(userId)
    .all<MembershipRow>();

  // Session metadata only: token hashes, IP addresses and user agents are not
  // included, because an export should not become a credential or tracking dump.
  const sessions = await db
    .prepare("SELECT createdAt, expiresAt FROM identity_session WHERE userId = ? ORDER BY createdAt ASC")
    .bind(userId)
    .all<SessionRow>();

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    subject: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified !== 0,
      createdAt: user.createdAt,
    },
    memberships: memberships.results.map((row) => ({
      businessId: row.business_id,
      businessName: row.business_name,
      role: row.role,
      status: row.status,
      joinedAt: row.created_at,
    })),
    sessions: sessions.results.map((row) => ({
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    })),
  };
}

/**
 * Generates a personal-data export for the authenticated user.
 *
 * Scope is deliberately narrow: the subject's own profile, the businesses they
 * belong to, and their session metadata. It never includes another user's
 * details, other tenants' records, financial data or audit payloads. The payload
 * is stored in D1 and served only to the requester until it expires, so there is
 * no public object-storage link to leak.
 */
export async function requestExport(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<Result<ExportRequestResult, DomainError>> {
  const bundle = await buildBundle(db, userId, now);
  if (bundle === null) return err(notFound());

  const exportId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_SECONDS * 1000).toISOString();

  try {
    const { event } = await commitWithAudit(
      db,
      [
        db
          .prepare(
            `INSERT INTO governance_data_export
               (id, requested_by_user_id, status, payload, created_at, expires_at)
             VALUES (?, ?, 'ready', ?, ?, ?)`,
          )
          .bind(exportId, userId, JSON.stringify(bundle), now.toISOString(), expiresAt),
      ],
      {
        action: "privacy.export_requested",
        outcome: "success",
        actorUserId: userId,
        targetType: "data_export",
        targetId: exportId,
        correlationId: crypto.randomUUID(),
        metadata: { memberships: bundle.memberships.length },
      },
      () => now,
    );

    return ok({ exportId, expiresAt, event });
  } catch {
    return err(
      new DomainError({
        code: "CONFLICT",
        message: "The export could not be generated. Try again.",
      }),
    );
  }
}

export interface ExportDownload {
  readonly body: string;
  readonly expiresAt: string;
  readonly event: AuditEventRecord;
}

/**
 * Loads an export for its owner only, marks it downloaded, and audits the access.
 * Expired or foreign exports return NOT_FOUND so ids cannot be probed.
 */
export async function loadExport(
  db: Database,
  exportId: string,
  userId: string,
  now: Date = new Date(),
): Promise<Result<ExportDownload, DomainError>> {
  const row = await db
    .prepare(
      `SELECT id, status, payload, expires_at
         FROM governance_data_export
        WHERE id = ? AND requested_by_user_id = ?`,
    )
    .bind(exportId, userId)
    .first<ExportRow>();

  if (row === null || row.status === "expired") return err(notFound());
  if (Date.parse(row.expires_at) <= now.getTime()) return err(notFound());

  try {
    const { event } = await commitWithAudit(
      db,
      [
        db
          .prepare(
            `UPDATE governance_data_export
                SET status = 'downloaded', downloaded_at = ?
              WHERE id = ? AND requested_by_user_id = ?`,
          )
          .bind(now.toISOString(), exportId, userId),
      ],
      {
        action: "privacy.export_downloaded",
        outcome: "success",
        actorUserId: userId,
        targetType: "data_export",
        targetId: exportId,
        correlationId: crypto.randomUUID(),
      },
      () => now,
    );

    return ok({ body: row.payload, expiresAt: row.expires_at, event });
  } catch {
    return err(
      new DomainError({ code: "CONFLICT", message: "The export could not be read. Try again." }),
    );
  }
}

export interface DeletionBlocker {
  readonly businessId: string;
  readonly businessName: string;
  readonly reason: "sole_owner";
}

export interface DeletionResult {
  readonly deletionRequestId: string;
  readonly status: "blocked" | "completed";
  readonly blockers: readonly DeletionBlocker[];
  readonly event: AuditEventRecord;
}

/**
 * Executes an account-deletion request after the caller has reauthenticated.
 *
 * Deletion is scoped to *identity*: credentials, sessions, second factors,
 * memberships and invitations are removed and the profile is anonymised. The user
 * row itself is retained (anonymised) so foreign keys and legally retained
 * business records keep a stable reference, and audit history stays attributable
 * to a pseudonymous id. A sole owner is blocked rather than silently orphaning a
 * business; ownership transfer and business closure are separate workflows that
 * do not exist yet.
 */
export async function requestDeletion(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<Result<DeletionResult, DomainError>> {
  const soleOwnerRows = await db
    .prepare(
      `SELECT b.id AS business_id, b.name AS business_name
         FROM tenancy_membership m
         JOIN tenancy_business b ON b.id = m.business_id
        WHERE m.user_id = ?
          AND m.role = 'owner'
          AND m.status = 'active'
          AND b.archived_at IS NULL
          AND (SELECT COUNT(*) FROM tenancy_membership o
                WHERE o.business_id = m.business_id
                  AND o.role = 'owner'
                  AND o.status = 'active') = 1`,
    )
    .bind(userId)
    .all<{ business_id: string; business_name: string }>();

  const blockers: DeletionBlocker[] = soleOwnerRows.results.map((row) => ({
    businessId: row.business_id,
    businessName: row.business_name,
    reason: "sole_owner",
  }));

  const deletionRequestId = crypto.randomUUID();
  const storedBlockers = blockers.length === 0 ? null : JSON.stringify(blockers);

  if (blockers.length > 0) {
    try {
      const { event } = await commitWithAudit(
        db,
        [
          db
            .prepare(
              `INSERT INTO governance_deletion_request
                 (id, user_id, status, blockers, requested_at)
               VALUES (?, ?, 'blocked', ?, ?)`,
            )
            .bind(deletionRequestId, userId, storedBlockers, now.toISOString()),
        ],
        {
          action: "privacy.deletion_blocked",
          outcome: "denied",
          actorUserId: userId,
          targetType: "user",
          targetId: userId,
          correlationId: crypto.randomUUID(),
          metadata: { blockers: blockers.length },
        },
        () => now,
      );
      return ok({ deletionRequestId, status: "blocked", blockers, event });
    } catch {
      return err(new DomainError({ code: "CONFLICT", message: "The request could not be recorded." }));
    }
  }

  const user = await db
    .prepare("SELECT email FROM identity_user WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  if (user === null) return err(notFound());

  const anonymisedEmail = `deleted+${crypto.randomUUID()}@deleted.invalid`;
  const timestamp = now.toISOString();

  // One batch: the request record, credential/session/credential-factor removal,
  // membership and invitation cleanup, anonymisation and the audit event either
  // all commit or none do.
  try {
    const { event } = await commitWithAudit(
      db,
      [
        db
          .prepare(
            `INSERT INTO governance_deletion_request
               (id, user_id, status, blockers, requested_at, completed_at)
             VALUES (?, ?, 'completed', NULL, ?, ?)`,
          )
          .bind(deletionRequestId, userId, timestamp, timestamp),
        db.prepare("DELETE FROM identity_session WHERE userId = ?").bind(userId),
        db.prepare("DELETE FROM identity_account WHERE userId = ?").bind(userId),
        db.prepare("DELETE FROM identity_two_factor WHERE userId = ?").bind(userId),
        db.prepare("DELETE FROM identity_verification WHERE identifier = ?").bind(user.email),
        db
          .prepare("UPDATE tenancy_membership SET status = 'removed', updated_at = ? WHERE user_id = ?")
          .bind(timestamp, userId),
        db
          .prepare(
            "UPDATE tenancy_invitation SET status = 'revoked' WHERE email = ? AND status = 'pending'",
          )
          .bind(user.email),
        db
          .prepare(
            `UPDATE identity_user
                SET name = 'Deleted user', email = ?, emailVerified = 0,
                    twoFactorEnabled = 0, updatedAt = ?
              WHERE id = ?`,
          )
          .bind(anonymisedEmail, timestamp, userId),
      ],
      {
        action: "privacy.account_deleted",
        outcome: "success",
        actorUserId: userId,
        targetType: "user",
        targetId: userId,
        correlationId: crypto.randomUUID(),
        metadata: { sessionsRevoked: true, credentialsRemoved: true },
      },
      () => now,
    );

    return ok({ deletionRequestId, status: "completed", blockers: [], event });
  } catch {
    return err(
      new DomainError({ code: "CONFLICT", message: "The account could not be deleted. Try again." }),
    );
  }
}
