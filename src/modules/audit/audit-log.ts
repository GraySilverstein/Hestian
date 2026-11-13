import type { Database } from "@/config/bindings";
import { DomainError } from "@/core/errors";
import { redactValue } from "@/core/logging/redact";

import { GENESIS_HASH, canonicalize, sha256Hex } from "./canonical";

export type AuditOutcome = "success" | "denied" | "failure";

export interface AuditEventInput {
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly actorUserId?: string | null;
  readonly businessId?: string | null;
  readonly targetType?: string | null;
  readonly targetId?: string | null;
  readonly correlationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuditEventRecord extends AuditEventInput {
  readonly seq: number;
  readonly id: string;
  readonly occurredAt: string;
  readonly prevHash: string;
  readonly hash: string;
}

interface AuditRow {
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

const MAX_APPEND_ATTEMPTS = 20;

function material(row: Omit<AuditEventRecord, "hash" | "seq">): string {
  return canonicalize({
    id: row.id,
    occurredAt: row.occurredAt,
    actorUserId: row.actorUserId,
    businessId: row.businessId,
    action: row.action,
    outcome: row.outcome,
    targetType: row.targetType,
    targetId: row.targetId,
    correlationId: row.correlationId,
    metadata: row.metadata,
    prevHash: row.prevHash,
  });
}

async function headHash(db: Database): Promise<string> {
  const row = await db
    .prepare("SELECT hash FROM audit_event ORDER BY seq DESC LIMIT 1")
    .first<{ hash: string }>();
  return row?.hash ?? GENESIS_HASH;
}

/**
 * Appends one audit event and returns the stored record.
 *
 * Integrity: each record hashes its own content plus the previous record's hash,
 * so editing or deleting a record breaks verification. The `prev_hash` column is
 * unique, which serialises concurrent appends even without D1 transactions: a
 * racing writer loses the unique constraint and retries against the new head.
 *
 * Metadata is redacted before hashing, so a secret cannot become permanently
 * embedded in the audit chain.
 */
export async function recordAuditEvent(
  db: Database,
  input: AuditEventInput,
  now: () => Date = () => new Date(),
): Promise<AuditEventRecord> {
  if (input.correlationId.trim() === "") {
    throw new DomainError({
      code: "INVALID_ARGUMENT",
      message: "Audit events require a correlation id.",
    });
  }

  const safeMetadata = (redactValue(input.metadata ?? {}) ?? {}) as Record<string, unknown>;

  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
    const prevHash = await headHash(db);
    const id = crypto.randomUUID();
    const occurredAt = now().toISOString();

    const base = {
      id,
      occurredAt,
      actorUserId: input.actorUserId ?? null,
      businessId: input.businessId ?? null,
      action: input.action,
      outcome: input.outcome,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      correlationId: input.correlationId,
      metadata: safeMetadata,
      prevHash,
    } satisfies Omit<AuditEventRecord, "hash" | "seq">;

    const hash = await sha256Hex(material(base));

    try {
      await db
        .prepare(
          `INSERT INTO audit_event
            (id, occurred_at, actor_user_id, business_id, action, outcome,
             target_type, target_id, correlation_id, metadata, prev_hash, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          occurredAt,
          base.actorUserId,
          base.businessId,
          base.action,
          input.outcome,
          base.targetType,
          base.targetId,
          input.correlationId,
          JSON.stringify(safeMetadata),
          prevHash,
          hash,
        )
        .run();

      const inserted = await db
        .prepare("SELECT seq FROM audit_event WHERE id = ?")
        .first<{ seq: number }>();

      return { ...base, seq: inserted?.seq ?? 0, hash };
    } catch (error) {
      // A unique `prev_hash` collision means another writer appended first.
      if (attempt === MAX_APPEND_ATTEMPTS - 1) {
        throw new DomainError({
          code: "CONFLICT",
          message: "Audit chain is contended; the event was not recorded.",
          details: { action: input.action },
          cause: error,
        });
      }
    }
  }

  throw new DomainError({
    code: "CONFLICT",
    message: "Audit chain is contended; the event was not recorded.",
    details: { action: input.action },
  });
}

export interface AuditVerification {
  readonly valid: boolean;
  readonly checked: number;
  readonly brokenAtSeq?: number;
  readonly reason?: "hash_mismatch" | "broken_link" | "duplicate_prev_hash";
}

/**
 * Recomputes the chain from the stored records.
 *
 * Called by tests and by an operator-only diagnostic. It is not exposed as a
 * public endpoint.
 */
export async function verifyAuditChain(db: Database): Promise<AuditVerification> {
  const rows = await db
    .prepare(
      `SELECT seq, id, occurred_at, actor_user_id, business_id, action, outcome,
              target_type, target_id, correlation_id, metadata, prev_hash, hash
         FROM audit_event
        ORDER BY seq ASC`,
    )
    .all<AuditRow>();

  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  const seenPrev = new Set<string>();

  for (const row of rows.results) {
    checked += 1;

    if (seenPrev.has(row.prev_hash)) {
      return { valid: false, checked, brokenAtSeq: row.seq, reason: "duplicate_prev_hash" };
    }
    seenPrev.add(row.prev_hash);

    if (row.prev_hash !== expectedPrev) {
      return { valid: false, checked, brokenAtSeq: row.seq, reason: "broken_link" };
    }

    const metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    const recomputed = await sha256Hex(
      material({
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
      }),
    );

    if (recomputed !== row.hash) {
      return { valid: false, checked, brokenAtSeq: row.seq, reason: "hash_mismatch" };
    }
    expectedPrev = row.hash;
  }

  return { valid: true, checked };
}
