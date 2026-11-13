import { createUnconfiguredMailer } from "@/modules/identity/email";
import { createAuth } from "@/modules/identity/auth-options";

/**
 * Better Auth instance wired to the test SQLite connection.
 *
 * Uses the same `buildAuthOptions` as production, so hashing parameters, session
 * lifetimes and rate-limit rules under test are the shipped ones.
 */
export function createTestAuth(
  database: unknown,
  options: {
    readonly mailer?: ReturnType<typeof createUnconfiguredMailer>;
    readonly requireEmailVerification?: boolean;
    readonly onPasswordReset?: (userId: string) => Promise<void>;
  } = {},
) {
  return createAuth({
    database,
    secret: "test-secret-with-at-least-32-characters",
    baseURL: "http://localhost:3000",
    isProduction: false,
    mailer: options.mailer ?? createUnconfiguredMailer(),
    requireEmailVerification: options.requireEmailVerification ?? false,
    ...(options.onPasswordReset === undefined
      ? {}
      : { onPasswordReset: options.onPasswordReset }),
  });
}
