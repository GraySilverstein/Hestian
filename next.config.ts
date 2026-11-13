import type { NextConfig } from "next";

/**
 * Hestian runs as a server-rendered application on the Cloudflare Workers
 * runtime through the Freebuff Sites adapter. Node-only middleware, filesystem
 * access and long-lived background work are not available in this target.
 *
 * See docs/ARCHITECTURE.md and docs/decisions/0002-runtime-and-deployment.md.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
