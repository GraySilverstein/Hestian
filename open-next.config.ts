import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare adapter configuration.
 *
 * Incremental caching (R2) is deliberately not enabled yet: no R2 bucket is
 * provisioned, and cached rendering must not be mistaken for a correctness
 * feature. Add `incrementalCache` only with a provisioned bucket and a tested
 * invalidation path.
 */
export default defineCloudflareConfig({});
