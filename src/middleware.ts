import { NextResponse, type NextRequest } from "next/server";

import { resolveSecurityMode, securityHeaders } from "@/core/security-headers";

/**
 * Edge middleware: security headers, nonce-based CSP and a coarse body limit.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`, but the Cloudflare adapter
 * does not support `proxy.ts` yet (opennextjs-cloudflare#1277). Keep this file
 * named `middleware.ts` until the adapter supports the rename.
 */
const MAX_REQUEST_BYTES = 256 * 1024;

function createNonce(): string {
  return btoa(crypto.randomUUID());
}

export function middleware(request: NextRequest): NextResponse {
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (isMutation && Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  const nonce = createNonce();
  const mode = resolveSecurityMode({
    nodeEnv: process.env.NODE_ENV,
    hestianEnv: process.env.HESTIAN_ENV,
  });
  const headers = securityHeaders({
    nonce,
    isHttps: request.nextUrl.protocol === "https:",
    mode,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", headers["content-security-policy"] ?? "");
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
