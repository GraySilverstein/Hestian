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
  readonly isProduction?: boolean;
}

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
  const headers: Record<string, string> = {
    "content-security-policy": contentSecurityPolicy(options.nonce),
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
