import { getCloudflareContext } from "@opennextjs/cloudflare";
import { nextCookies } from "better-auth/next-js";
import type { Auth } from "better-auth";

import type { HestianBindings } from "@/config/bindings";
import { DomainError } from "@/core/errors";
import { createLogger } from "@/core/logging";

import { createAuth } from "./auth-options";
import { createMailer } from "./email";

const logger = createLogger({ fields: { module: "identity" } });

const MINIMUM_SECRET_LENGTH = 32;

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
  const secret = (env.BETTER_AUTH_SECRET ?? process.env["BETTER_AUTH_SECRET"] ?? "").trim();

  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new DomainError({
      code: "CONFIGURATION_INVALID",
      message: `Authentication secret must be at least ${MINIMUM_SECRET_LENGTH} characters.`,
    });
  }

  const baseURL = (env.BETTER_AUTH_URL ?? process.env["BETTER_AUTH_URL"] ?? "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(baseURL)) {
    throw new DomainError({
      code: "CONFIGURATION_INVALID",
      message: "Authentication base URL is missing or invalid.",
    });
  }

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

/** Test-only reset of the per-isolate auth instance cache. */
export function resetAuthCache(): void {
  cached = undefined;
}
