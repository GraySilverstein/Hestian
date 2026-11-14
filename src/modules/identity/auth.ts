import { getCloudflareContext } from "@opennextjs/cloudflare";
import { nextCookies } from "better-auth/next-js";
import type { Auth } from "better-auth";
import { headers } from "next/headers";

import type { HestianBindings } from "@/config/bindings";
import { createLogger } from "@/core/logging";

import {
  requireAuthSecret,
  resolveAuthBaseUrl,
  resolveAuthMode,
} from "./auth-runtime";
import { createAuth } from "./auth-options";
import { createMailer } from "./email";

const logger = createLogger({ fields: { module: "identity" } });

/** Reads the platform bindings for the current request. */
export async function getBindings(): Promise<HestianBindings> {
  const context = await getCloudflareContext({ async: true });
  return context.env as unknown as HestianBindings;
}

let cached: { readonly key: string; readonly auth: Auth } | undefined;

/**
 * Returns the Better Auth instance for this isolate.
 *
 * Construction is cached per isolate because schema validation is expensive.
 * Configuration fails closed: a missing or short signing secret throws rather
 * than falling back to a default.
 */
export async function getAuth(): Promise<Auth> {
  const env = await getBindings();
  const mode = resolveAuthMode({
    nodeEnv: process.env.NODE_ENV,
    hestianEnv: env.HESTIAN_ENV ?? process.env["HESTIAN_ENV"],
  });
  const secret = requireAuthSecret(
    env.BETTER_AUTH_SECRET,
    process.env["BETTER_AUTH_SECRET"],
    mode,
  );
  const baseURL = resolveAuthBaseUrl({
    configured: env.BETTER_AUTH_URL ?? process.env["BETTER_AUTH_URL"],
    mode,
    requestOrigin: mode === "development" ? await developmentRequestOrigin() : undefined,
  });

  const isProduction = env.HESTIAN_ENV === "production" || process.env["HESTIAN_ENV"] === "production";
  const key = `${baseURL}|${isProduction ? "prod" : "dev"}|${secret}`;

  if (cached?.key === key) {
    return cached.auth;
  }

  const mailer = createMailer({
    from: env.EMAIL_FROM,
    resendApiKey: env.RESEND_API_KEY,
  });

  // Fail closed: production requires verification unless explicitly disabled.
  // A build without a mail provider therefore cannot silently admit unverified
  // accounts; new users simply cannot complete sign-in until delivery exists.
  const requireEmailVerification =
    env.EMAIL_VERIFICATION_REQUIRED === "true" ||
    (isProduction && env.EMAIL_VERIFICATION_REQUIRED !== "false");

  const auth = createAuth({
    database: env.DB,
    secret,
    baseURL,
    isProduction,
    mailer,
    requireEmailVerification,
    onPasswordReset: async (userId) => {
      // A password reset invalidates every existing session: the credential that
      // created them is no longer the credential the account has.
      await env.DB.prepare("DELETE FROM identity_session WHERE userId = ?").bind(userId).run();
    },
    onEmailOutcome: (outcome) => {
      // Never log the message body: it contains single-use tokens.
      logger.warn("identity.email_not_delivered", {
        kind: outcome.kind,
        reason: outcome.reason ?? "unconfigured",
      });
    },
    plugins: [nextCookies()],
  });

  cached = { key, auth };
  return auth;
}

/**
 * The origin the preview is actually served from. Only loopback hosts are
 * accepted by `resolveAuthBaseUrl`, so a forged Host header cannot make the dev
 * server issue links or trust origins for an external domain.
 */
async function developmentRequestOrigin(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    if (host === null || host === "") return undefined;
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    return `${protocol}://${host}`;
  } catch {
    // Outside a request scope (for example schema tooling) use the configured
    // value rather than inventing an origin.
    return undefined;
  }
}

/** Test-only reset of the per-isolate auth instance cache. */
export function resetAuthCache(): void {
  cached = undefined;
}
