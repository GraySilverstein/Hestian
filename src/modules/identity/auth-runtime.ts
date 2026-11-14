import { DomainError } from "@/core/errors";
import { resolveSecurityMode, type SecurityMode } from "@/core/security-headers";

/**
 * Better Auth signs session and token material with this secret. Anything
 * shorter is rejected rather than stretched or defaulted.
 */
export const MINIMUM_SECRET_LENGTH = 32;

/**
 * Reads the signing secret from the platform binding first, then the process
 * environment (which is how `next dev` and tests supply it).
 *
 * There is deliberately no development fallback and no generated default: a
 * missing or short value throws, and the error never contains the value.
 */
export function requireAuthSecret(
  bindingValue: string | undefined,
  processValue: string | undefined,
  mode: SecurityMode = "production",
): string {
  // Production reads only the platform binding. Falling back to an ambient
  // process value there could silently reuse a developer's local credential.
  const source = mode === "production" ? bindingValue : (bindingValue ?? processValue);
  const secret = (source ?? "").trim();
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new DomainError({
      code: "CONFIGURATION_INVALID",
      message: `Authentication secret must be at least ${MINIMUM_SECRET_LENGTH} characters.`,
    });
  }
  return secret;
}

export interface AuthBaseUrlOptions {
  readonly configured: string | undefined;
  readonly mode: SecurityMode;
  /** Origin derived from the current request; used only by the dev server. */
  readonly requestOrigin?: string | undefined;
}

/**
 * Resolves the origin Better Auth uses for callback links and CSRF checks.
 *
 * Production always uses the configured binding. The development server is
 * allowed to derive a loopback origin from the request so a preview assigned a
 * different port still works; a non-loopback or malformed origin is ignored.
 */
export function resolveAuthBaseUrl(options: AuthBaseUrlOptions): string {
  const configured = normaliseOrigin(options.configured ?? "");
  const requestOrigin =
    options.mode === "development" ? normaliseOrigin(options.requestOrigin ?? "") : "";
  const candidate = isLoopbackOrigin(requestOrigin) ? requestOrigin : configured;

  if (!isHttpOrigin(candidate)) {
    throw new DomainError({
      code: "CONFIGURATION_INVALID",
      message: "Authentication base URL is missing or invalid.",
    });
  }
  return candidate;
}

/** Picks the dev or production auth mode from the same rule as the CSP. */
export function resolveAuthMode(environment: {
  readonly nodeEnv?: string | undefined;
  readonly hestianEnv?: string | undefined;
}): SecurityMode {
  return resolveSecurityMode(environment);
}

function normaliseOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function isHttpOrigin(value: string): boolean {
  if (value === "") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(value: string): boolean {
  if (!isHttpOrigin(value)) return false;
  const host = new URL(value).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}
