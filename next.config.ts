import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

/**
 * Hestian runs as a server-rendered application on the Cloudflare Workers
 * runtime through the OpenNext adapter. Node-only middleware, filesystem access
 * and long-lived background work are not available in this target.
 *
 * `initOpenNextCloudflareForDev` is required so `next dev` exposes the bindings
 * declared in wrangler.jsonc (D1, assets) to server code.
 *
 * See docs/ARCHITECTURE.md and docs/decisions/0002-runtime-and-deployment.md.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The local preview may be reached as 127.0.0.1 rather than localhost. Next
  // blocks cross-origin dev resources (including HMR) by default; this allowlist
  // applies only to the development server.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The Worker build has no filesystem build cache to read at runtime.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

initOpenNextCloudflareForDev();
