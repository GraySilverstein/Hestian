import { betterAuth, type BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";

import { attemptDelivery, type Mailer } from "./email";

/**
 * Table names owned by the identity module. Better Auth's default names
 * (`user`, `session`, …) are too generic for a schema that will grow to hold
 * financial records, so they are explicitly namespaced.
 */
export const AUTH_MODEL_NAMES = {
  user: "identity_user",
  session: "identity_session",
  account: "identity_account",
  verification: "identity_verification",
  rateLimit: "identity_rate_limit",
  twoFactor: "identity_two_factor",
} as const;

export interface AuthConfig {
  /** D1 binding (or a Node SQLite database in tests/schema tooling). */
  readonly database: unknown;
  readonly secret: string;
  readonly baseURL: string;
  readonly isProduction: boolean;
  readonly mailer: Mailer;
  /**
   * When true, an unverified address cannot sign in. Production sets this unless
   * explicitly disabled, so a missing mail provider fails closed rather than
   * silently admitting unverified accounts.
   */
  readonly requireEmailVerification?: boolean;
  /**
   * Invoked after a successful password reset. Production revokes every session
   * for the user so a stolen session cannot survive a credential change.
   */
  readonly onPasswordReset?: (userId: string) => Promise<void>;
  readonly onEmailOutcome?: (outcome: {
    readonly kind: "verification" | "password_reset" | "security_notice";
    readonly delivered: boolean;
    readonly reason?: string;
  }) => void;
  readonly plugins?: BetterAuthOptions["plugins"];
}

const SESSION_SECONDS = 60 * 60 * 8;
const SESSION_REFRESH_SECONDS = 60 * 15;

/**
 * Pure authentication configuration.
 *
 * Kept free of environment and framework imports so the schema generator and the
 * test suite construct exactly the same auth instance as production. Runtime
 * wiring (Cloudflare bindings, Next cookies plugin) lives in `auth.ts`.
 */
export function buildAuthOptions(config: AuthConfig): BetterAuthOptions {
  return {
    appName: "Hestian",
    baseURL: config.baseURL,
    secret: config.secret,
    database: config.database as BetterAuthOptions["database"],
    trustedOrigins: [config.baseURL],
    telemetry: { enabled: false },

    user: {
      modelName: AUTH_MODEL_NAMES.user,
    },
    session: {
      modelName: AUTH_MODEL_NAMES.session,
      expiresIn: SESSION_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
      // Database-backed sessions are always verified. A cookie cache would let a
      // revoked session remain usable until the cache expires.
      cookieCache: { enabled: false },
    },
    account: {
      modelName: AUTH_MODEL_NAMES.account,
    },
    verification: {
      modelName: AUTH_MODEL_NAMES.verification,
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Fail closed where verification is required: without a configured mailer
      // a new account cannot verify, so it cannot sign in. Local development may
      // opt out explicitly; production must not.
      requireEmailVerification: config.requireEmailVerification ?? false,
      onPasswordReset: async ({ user }) => {
        await config.onPasswordReset?.(user.id);
      },
      sendResetPassword: async ({ user, url }) => {
        const outcome = await attemptDelivery(config.mailer, {
          to: user.email,
          subject: "Reset your Hestian password",
          text: `A password reset was requested for your Hestian account. If this was you, open: ${url}\n\nIf you did not request it, ignore this message.`,
        });
        config.onEmailOutcome?.({
          kind: "password_reset",
          delivered: outcome.delivered,
          ...(outcome.delivered ? {} : { reason: outcome.reason }),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        const outcome = await attemptDelivery(config.mailer, {
          to: user.email,
          subject: "Verify your Hestian email address",
          text: `Confirm your email address for Hestian: ${url}`,
        });
        config.onEmailOutcome?.({
          kind: "verification",
          delivered: outcome.delivered,
          ...(outcome.delivered ? {} : { reason: outcome.reason }),
        });
      },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: AUTH_MODEL_NAMES.rateLimit,
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
        "/send-verification-email": { window: 300, max: 3 },
        "/change-password": { window: 300, max: 5 },
      },
    },

    advanced: {
      useSecureCookies: config.isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
        path: "/",
      },
      ipAddress: {
        // Set by the Cloudflare edge; a client cannot forge it through this hop.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      database: {
        // Random UUIDs avoid exposing sequence information in identifiers.
        generateId: () => crypto.randomUUID(),
      },
    },

    plugins: [
      twoFactor({
        issuer: "Hestian",
        twoFactorTable: AUTH_MODEL_NAMES.twoFactor,
        // Backup codes are stored encrypted with the auth secret and consumed
        // single-use by the provider; TOTP secrets are encrypted too.
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
        // Account-level lockout complements the HTTP rate limit: server actions
        // call the API directly, so the plugin must enforce its own limit.
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 900 },
        twoFactorCookieMaxAge: 600,
      }),
      ...(config.plugins ?? []),
    ],
  };
}

/** Creates the auth instance. Exported for schema generation and tests. */
export function createAuth(config: AuthConfig) {
  return betterAuth(buildAuthOptions(config));
}
