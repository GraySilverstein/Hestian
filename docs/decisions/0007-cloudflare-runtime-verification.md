# 0007 — Cloudflare runtime verification and pinned adapter

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Milestone 0 declared Cloudflare Workers the deployment target but had never built
or executed a Worker. A successful `next build` proves nothing about workerd: the
adapter, runtime APIs, middleware, cookies, bindings and D1 access all differ.
The installed framework is Next.js 16.4.6 with React 19.3.1, which is recent enough
that adapter support is version-sensitive.

## Decision

1. Build through `@opennextjs/cloudflare@1.20.17` (peer range `next >=16.4.5`) with
   `wrangler@4.161.0`, both pinned exactly. Do not float these versions: the
   adapter patches Next.js internals and a minor bump can change behaviour.
2. Keep `src/middleware.ts`. OpenNext does not support Next.js 16's `proxy.ts`
   replacement yet (opennextjs-cloudflare issue #1277), so renaming would silently
   disable the CSP nonce and body limits.
3. Configure `wrangler.jsonc` with the `DB` D1 binding, `nodejs_compat`,
   `global_fetch_strictly_public`, compatibility date `2026-11-01`, and static
   assets served through the Worker.
4. Every page opts into dynamic rendering (`force-dynamic`). A nonce-based CSP
   requires a per-request nonce; a static page would be cached with a stale nonce.
5. Verify in workerd, not only in Node: `npm run build:worker`,
   `npm run start:worker`, then `npm run verify:runtime`.
6. Keep the deployment step unimplemented until explicitly authorized. No remote
   database, Worker version or secret binding has been created.

## Evidence

- `npx opennextjs-cloudflare build` finishes with "OpenNext build complete" and
  writes `.open-next/worker.js`.
- `wrangler dev` serves `http://127.0.0.1:8787`; `/api/health` reports
  `database: ok`, `authentication: configured`.
- Live sign-up, session read, authenticated page render, sign-out and
  post-sign-out invalidation all succeed (17/17 runtime checks).
- Security headers and the nonce are present on HTML and API responses.
- D1 writes are durable across requests in `.wrangler/state`.

## Consequences

**Easier:** the production path is now the path that was tested. Known-good
versions prevent surprise breakage from an adapter release.

**Harder:** upgrades require an explicit, tested version bump. `middleware.ts`
carries a temporary constraint. Every page is dynamic, so per-page caching must be
designed deliberately rather than assumed.

**Forbidden:** using Node-only APIs (`fs`, `child_process`, native addons) in
server code; relying on `next build` alone as deployment evidence; changing the
adapter without rerunning the runtime script.

## Alternatives considered

- **Vercel/Node hosting.** Removes the runtime constraints but abandons the
  intended platform and its D1 integration.
- **Older Next.js with a more mature adapter.** Rejected: the baseline pins 16.4.6,
  and downgrading to satisfy tooling is the kind of change that should be proposed
  with evidence, not made quietly.
- **`proxy.ts`.** Unsupported by the adapter; would drop middleware protections.

## Follow-ups

1. Production deployment requires a remote D1 database, secret bindings and an
   explicit authorization; not done.
2. R2, scheduled jobs, streaming and CPU-heavy work remain unverified.
3. Revisit `middleware.ts` → `proxy.ts` when OpenNext supports it, then rerun the
   runtime checks.
4. Load and latency measurements must precede any performance claim.
