/**
 * Security header policy.
 *
 * Kept pure so it can be asserted in tests without a running Worker. The CSP is
 * nonce-based: Next.js inline bootstrap scripts receive the nonce, and
 * `strict-dynamic` allows the application's own chunks without a broad host
 * allowlist. Scripts never fall back to `unsafe-inline`.
 */
export interface SecurityHeaderOptions {
  readonly nonce: string;
  readonly isHttps: boolean;
  /**
   * Defaults to production. Development must be requested explicitly, so a
   * missing or unrecognised environment can only produce the strict policy.
   */
  readonly mode?: SecurityMode;
}

export type SecurityMode = "development" | "production";

/**
 * Chooses the policy mode from build-time environment values.
 *
 * Development is only selected when Next.js itself is running in development
 * *and* the deployment is not labelled preview or production. A production
 * build always sets `NODE_ENV=production`, but the explicit HESTIAN_ENV guard
 * means a preview deployment that happens to run a dev server still cannot serve
 * the development policy.
 */
export function resolveSecurityMode(environment: {
  readonly nodeEnv?: string | undefined;
  readonly hestianEnv?: string | undefined;
}): SecurityMode {
  const isLocal =
    environment.hestianEnv === undefined ||
    environment.hestianEnv === "" ||
    environment.hestianEnv === "local";
  return environment.nodeEnv === "development" && isLocal ? "development" : "production";
}

export function contentSecurityPolicy(
  nonce: string,
  mode: SecurityMode = "production",
): string {
  // Turbopack's React development runtime reconstructs callstacks with eval().
  // That capability is development-only and never appears in the production
  // policy; scripts remain nonce-bound and strict-dynamic in both modes.
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(mode === "development" ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    // React emits inline style attributes; scripts are the sensitive surface.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const mode = options.mode ?? "production";
  const headers: Record<string, string> = {
    "content-security-policy": contentSecurityPolicy(options.nonce, mode),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
  };

  // HSTS is only meaningful over HTTPS and must not be sent on plain HTTP.
  if (options.isHttps) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}
