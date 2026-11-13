import type { Auth } from "better-auth";

import type { Database } from "@/config/bindings";
import { consumeRateLimit } from "@/core/rate-limit";

const RESEND_RULE = { windowSeconds: 60 * 5, max: 2 } as const;

export interface ResendOutcome {
  /** True when a provider call was attempted; never reveals whether the address exists. */
  readonly attempted: boolean;
  readonly rateLimited: boolean;
}

/**
 * Requests a verification email, with a fixed-window limit keyed by normalised
 * address.
 *
 * The caller must return the same response for every input. Provider errors are
 * swallowed here because the API must not disclose whether an address exists,
 * is already verified, or failed delivery.
 */
export async function resendVerificationEmail(
  db: Database,
  auth: Auth,
  email: string,
  callbackURL: string,
  now: Date = new Date(),
): Promise<ResendOutcome> {
  const normalised = email.trim().toLowerCase();
  const decision = await consumeRateLimit(db, `verification:resend:${normalised}`, RESEND_RULE, now);
  if (!decision.allowed) {
    return { attempted: false, rateLimited: true };
  }

  try {
    await auth.api.sendVerificationEmail({ body: { email: normalised, callbackURL } });
  } catch {
    // Uniform response is the security property; the failure is not surfaced.
  }

  return { attempted: true, rateLimited: false };
}
