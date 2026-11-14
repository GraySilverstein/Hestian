# 0016 — Dependency pins, overrides and supply-chain review

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Milestone 1 reported three moderate production advisories (`glob`, `minimatch`) and
eleven moderate development-tooling advisories. `npm audit fix --force` proposed
downgrading `@opennextjs/cloudflare` to 0.3.0, which would break the verified
deployment path. The brief forbids blind fixes and forbids dismissing findings just
because they are transitive.

## Decision

1. **Infrastructure packages stay pinned and are never downgraded to silence an
   advisory.** Next.js, React, OpenNext, Wrangler, Better Auth and the test toolchain
   keep exact versions.
2. **The advisories were traced to dependency paths, not request handlers.**
   `glob@13.0.7` (pulled by the OpenNext CLI) depended on `minimatch@10.2.6`, which
   is affected by GHSA-g3hv-75wg-m249 (CVE-2026-118764). ESLint and
   typescript-eslint pulled the same `minimatch`. No vulnerable package is imported
   by Worker request code.
3. **Safe overrides were tested, not assumed.** `overrides: { glob: "14.0.3",
   minimatch: "11.0.3" }` resolves every advisory. The full test suite, lint,
   typecheck and `build:worker` were rerun after the override; all pass. `glob` 14
   depends on `minimatch ^11.0.2`, so the override follows the maintained line rather
   than forcing an incompatible pair.
4. **A production SBOM is generated** with `npm run sbom`
   (`docs/sbom.production.cdx.json`, CycloneDX, production dependencies only).
5. **Review procedure:** on every dependency change, run `npm audit`, inspect
   `npm ls <package>`, determine whether the path is runtime or tooling, prefer a
   compatible upgrade, test the Worker build, and record residual findings with a
   risk statement. Never apply `--force` without an ADR.
6. **Re-evaluate overrides** when OpenNext, ESLint or TypeScript-ESLint publish
   versions that depend on patched glob/minimatch directly; remove the override then.

## Evidence

- Before: 3 moderate production, 11 moderate dev. After overrides: `found 0
  vulnerabilities` for both `npm audit` and `npm audit --omit=dev`.
- `npm run check` (115 tests), `npm run build:worker` and the 29-check runtime script
  pass with the overrides.
- `npm ls glob minimatch` shows a single deduped `minimatch@11.0.3`.

## Consequences

**Easier:** no known advisories, no infrastructure downgrade, reproducible SBOM.

**Harder:** forcing `glob` to a major version ahead of OpenNext's declared range is
a compatibility risk; it is covered by the build/runtime checks but must be revisited
on every OpenNext upgrade.

**Residual risk:** an advisory in a build-only dependency can still affect a
developer machine or CI. Overrides reduce, but do not eliminate, supply-chain risk;
there is no signature verification, provenance attestation or lockfile review
automation beyond audit + SBOM.

## Alternatives considered

- **Downgrade OpenNext to satisfy audit.** Rejected: destroys the verified runtime.
- **Ignore the findings as "build only".** Rejected by the brief and by discipline.
- **Vendor or replace `glob`.** Unnecessary once a patched compatible line exists.

## Follow-ups

1. Add Dependabot/Renovate with grouped patch updates and a required Worker build.
2. Sign/attest release artifacts when a deployment pipeline exists.
3. Re-check overrides on each OpenNext and ESLint upgrade.
