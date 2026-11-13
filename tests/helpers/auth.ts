import { createUnconfiguredMailer } from "@/modules/identity/email";
import { createAuth } from "@/modules/identity/auth-options";

/**
 * Better Auth instance wired to the test SQLite connection.
 *
 * Uses the same `buildAuthOptions` as production, so hashing parameters, session
 * lifetimes and rate-limit rules under test are the shipped ones.
 */
export function createTestAuth(database: unknown) {
  return createAuth({
    database,
    secret: "test-secret-with-at-least-32-characters",
    baseURL: "http://localhost:3000",
    isProduction: false,
    mailer: createUnconfiguredMailer(),
  });
}
