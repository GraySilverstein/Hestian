import type { Database } from "@/config/bindings";

import type { AuditOutcome } from "./audit-log";

export interface AuditExportRecord {
  readonly seq: number;
  readonly id: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly businessId: string | null;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly correlationId: string;
  readonly metadata: Record<string, unknown>;
  readonly prevHash: string;
  readonly hash: string;
}

export interface AuditEventView {
  readonly seq: number;
  readonly id: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly correlationId: string;
  readonly metadata: Record<string, unknown>;
}

interface AuditViewRow {
  seq: number;
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action: string;
  outcome: AuditOutcome;
  target_type: string | null;
  target_id: string | null;
  correlation_id: string;
  metadata: string;
}

/** Most recent events for one business. The caller must have checked `audit.read`. */
interface AuditExportRow {
  seq: number;
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  business_id: string | null;
  action: string;
  outcome: AuditOutcome;
  target_type: string | null;
  target_id: string | null;
  correlation_id: string;
  metadata: string;
  prev_hash: string;
  hash: string;
}

/**
 * Complete audit trail for one business, including chain fields so the recipient
 * can verify each record. The caller must have checked `audit.read`.
 */
export async function exportBusinessAuditEvents(
  db: Database,
  businessId: string,
  limit = 5000,
): Promise<readonly AuditExportRecord[]> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 5000);
  const rows = await db
    .prepare(
      `SELECT seq, id, occurred_at, actor_user_id, business_id, action, outcome,
              target_type, target_id, correlation_id, metadata, prev_hash, hash
         FROM audit_event
        WHERE business_id = ?
        ORDER BY seq ASC
        LIMIT ?`,
    )
    .bind(businessId, safeLimit)
    .all<AuditExportRow>();

  return rows.results.map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.metadata);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = { parseError: true };
    }

    return {
      seq: row.seq,
      id: row.id,
      occurredAt: row.occurred_at,
      actorUserId: row.actor_user_id,
      businessId: row.business_id,
      action: row.action,
      outcome: row.outcome,
      targetType: row.target_type,
      targetId: row.target_id,
      correlationId: row.correlation_id,
      metadata,
      prevHash: row.prev_hash,
      hash: row.hash,
    };
  });
}

export async function listBusinessAuditEvents(
  db: Database,
  businessId: string,
  limit = 50,
): Promise<readonly AuditEventView[]> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const rows = await db
    .prepare(
      `SELECT seq, id, occurred_at, actor_user_id, action, outcome,
              target_type, target_id, correlation_id, metadata
         FROM audit_event
        WHERE business_id = ?
        ORDER BY seq DESC
        LIMIT ?`,
    )
    .bind(businessId, safeLimit)
    .all<AuditViewRow>();

  return rows.results.flatMap((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.metadata);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = { parseError: true };
    }

    return [
      {
        seq: row.seq,
        id: row.id,
        occurredAt: row.occurred_at,
        actorUserId: row.actor_user_id,
        action: row.action,
        outcome: row.outcome,
        targetType: row.target_type,
        targetId: row.target_id,
        correlationId: row.correlation_id,
        metadata,
      },
    ];
  });
}
