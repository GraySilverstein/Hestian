import { headers } from "next/headers";

import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

import { getAuth } from "./auth";

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
}

export interface ActiveSession {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface AuthenticatedSession {
  readonly user: SessionUser;
  readonly session: ActiveSession;
}

/** Resolves a session from request headers. Identity is never client-declared. */
export async function getSession(requestHeaders: Headers): Promise<AuthenticatedSession | null> {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: requestHeaders });
  if (result === null) return null;

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
      twoFactorEnabled:
        (result.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled === true,
    },
    session: {
      id: result.session.id,
      createdAt: toIsoString(result.session.createdAt),
      expiresAt: toIsoString(result.session.expiresAt),
      ipAddress: result.session.ipAddress ?? null,
      userAgent: result.session.userAgent ?? null,
    },
  };
}

/** Session for the current request, using Next's request headers. */
export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  return getSession(await headers());
}

/**
 * Requires a verified session for server operations.
 *
 * Returns `UNAUTHENTICATED` rather than redirecting so route handlers and
 * server actions can respond with the correct status code.
 */
export async function requireSession(
  requestHeaders: Headers,
): Promise<Result<AuthenticatedSession, DomainError>> {
  const session = await getSession(requestHeaders);
  if (session === null) {
    return err(new DomainError({ code: "UNAUTHENTICATED", message: "Sign in required." }));
  }
  return ok(session);
}

/**
 * Privileged operations require a session established recently, not merely a
 * long-lived cookie. Better Auth refreshes `updatedAt` on activity, so freshness
 * is measured from the session's original creation time.
 */
export function isRecentlyAuthenticated(
  session: Pick<ActiveSession, "createdAt">,
  maxAgeSeconds = 60 * 60,
  now: Date = new Date(),
): boolean {
  const createdAt = Date.parse(session.createdAt);
  if (Number.isNaN(createdAt)) return false;
  return now.getTime() - createdAt <= maxAgeSeconds * 1000;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
