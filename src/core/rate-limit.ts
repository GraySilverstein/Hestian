import type { Database } from "@/config/bindings";
import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

/**
 * Fixed-window rate limiter backed by D1.
 *
 * The check and the increment happen in a single upsert, so simultaneous
 * requests cannot all pass a stale read. Windows are per key, and the key must be
 * derived from a verified identity (never a client-supplied identifier alone).
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: { readonly windowSeconds: number; readonly max: number },
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const windowStart = nowSeconds - rule.windowSeconds;

  const row = await db
    .prepare(
      `INSERT INTO platform_rate_limit (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN platform_rate_limit.window_start <= ? THEN 1
                      ELSE platform_rate_limit.count + 1 END,
         window_start = CASE WHEN platform_rate_limit.window_start <= ? THEN ?
                             ELSE platform_rate_limit.window_start END
       RETURNING count, window_start`,
    )
    .bind(key, nowSeconds, windowStart, windowStart, nowSeconds)
    .first<{ count: number; window_start: number }>();

  if (row === null) {
    throw new DomainError({
      code: "INTERNAL",
      message: "Rate limiter did not return a decision.",
    });
  }

  return row.count <= rule.max
    ? { allowed: true }
    : {
        allowed: false,
        retryAfterSeconds: Math.max(1, row.window_start + rule.windowSeconds - nowSeconds),
      };
}

/** Convenience wrapper returning `RATE_LIMITED` when the limit is exceeded. */
export async function enforceRateLimit(
  db: Database,
  key: string,
  rule: { readonly windowSeconds: number; readonly max: number },
  now: Date = new Date(),
): Promise<Result<void, DomainError>> {
  const decision = await consumeRateLimit(db, key, rule, now);
  return decision.allowed
    ? ok(undefined)
    : err(
        new DomainError({
          code: "RATE_LIMITED",
          message: "Too many attempts. Try again later.",
          details: { retryAfterSeconds: decision.retryAfterSeconds },
        }),
      );
}
