# 0002 — Next.js on Cloudflare Workers via Freebuff Sites

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The deployment target is Freebuff Sites, which hosts Workers-based applications
with static assets, D1 (SQLite), R2 object storage, managed sign-in and managed
realtime. It does not run Node/Bun servers, containers, Python, persistent
filesystems or background daemons, and Node compatibility is partial.

Hestian needs server-rendered application surfaces, server-side authorization,
request handlers for webhooks and API contracts, and a single deployable.

A dedicated Node host was not available as a supported target; choosing one would
mean abandoning the platform's storage, auth and deployment integration.

## Decision

Use **Next.js 16 App Router** with React 19, deployed as a prebuilt Worker through
the platform's supported OpenNext adapter, with static assets served by the Worker.
D1 is the intended system of record and R2 the intended document store. Server
Components and route handlers keep authority on the server; the browser receives
rendered output, never credentials or business rules.

Target-runtime rules adopted now, before any financial code exists:

- no filesystem, `child_process`, native addons or long CPU work;
- no long-running processes; recurring work is request-triggered and idempotent;
- no in-memory state used for correctness;
- Web APIs (`fetch`, `crypto`, `Request`/`Response`) preferred over Node APIs;
- writes designed for a single-primary SQLite database: unique constraints and
  conditional updates instead of row locks.

## Consequences

**Easier:** one deployment, integrated auth/storage/realtime, server-rendered
authorization, no server fleet to operate.

**Harder:** heavy reconciliation and reporting must be chunked and resumable;
local database behaviour differs from production unless tested with the Worker
runtime; framework upgrades are constrained by adapter support.

**Unverified in Milestone 0:** Worker bundling, D1 semantics in practice, request
CPU limits, and the auth provider integration. `next build` passing locally is not
evidence of Worker compatibility.

## Alternatives considered

- **Hono Worker + Vite SPA.** Attractive for explicit API boundaries and a tiny
  runtime, but removes server-rendered UI and the platform's primary supported
  framework path; auth integration and routing would be hand-rolled.
- **Node server on a VPS or container host.** Not supported by the target platform;
  would lose managed storage and deployment and add operational burden.
- **Static site plus separate API service.** Contradicts the single-deployable
  decision (ADR 0001) and doubles the deployment surface.

## Follow-ups

1. Run `sites_prepare_next`, build the Worker, and test routes/assets under
   workerd with the deployment compatibility date (Milestone 1 or earlier).
2. Verify D1 transaction semantics before relying on multi-statement atomicity.
3. Pin framework and adapter versions; record the compatibility date in the repo.
4. Measure cold start and request CPU on realistic posting workloads before making
   performance claims.
