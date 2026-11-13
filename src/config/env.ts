import { z } from "zod";

import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

/** Names that must never appear with a `NEXT_PUBLIC_` prefix. */
const PUBLIC_SECRET_PATTERN = /^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|PRIVATE)/i;

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HESTIAN_ENV: z.enum(["local", "preview", "production"]).default("local"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parses and validates server configuration.
 *
 * Only names are reported on failure — never values — so a misconfigured
 * deployment cannot leak a credential through an error message or log.
 */
export function parseServerEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Result<ServerEnv, DomainError> {
  const exposedSecrets = Object.keys(source).filter((key) => PUBLIC_SECRET_PATTERN.test(key));
  if (exposedSecrets.length > 0) {
    return err(
      new DomainError({
        code: "CONFIGURATION_INVALID",
        message:
          "Sensitive configuration must not be exposed to the client. Rename these variables without the NEXT_PUBLIC_ prefix and read them on the server only.",
        details: { keys: exposedSecrets },
      }),
    );
  }

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: source["NODE_ENV"],
    HESTIAN_ENV: source["HESTIAN_ENV"],
    LOG_LEVEL: source["LOG_LEVEL"],
  });

  if (!parsed.success) {
    return err(
      new DomainError({
        code: "CONFIGURATION_INVALID",
        message: "Server configuration is invalid.",
        details: {
          fields: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
        },
      }),
    );
  }

  return ok(parsed.data);
}

export function isProduction(env: ServerEnv): boolean {
  return env.HESTIAN_ENV === "production";
}

let cached: ServerEnv | undefined;

/**
 * Returns validated configuration for the current process.
 *
 * Fails closed: invalid or missing configuration stops execution instead of
 * falling back to a permissive default.
 */
export function getServerEnv(): ServerEnv {
  assertServerRuntime();
  if (cached === undefined) {
    const parsed = parseServerEnv();
    if (!parsed.ok) {
      throw parsed.error;
    }
    cached = parsed.value;
  }
  return cached;
}

/** Test-only reset for the memoised configuration. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new DomainError({
      code: "CONFIGURATION_INVALID",
      message: "Server configuration was imported into client-side code.",
    });
  }
}
