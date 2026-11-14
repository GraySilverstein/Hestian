# Development workflow

This workflow is mandatory. The repository is the canonical source of truth and
`main` is the only long-lived branch.

- Repository: https://github.com/GraySilverstein/Hestian
- Branch: `main`
- Remote: `origin`

---

## 1. Environment

| Requirement | Version |
| --- | --- |
| Node.js | ≥ 22.12 (CI uses 24; local reference 24.13) |
| npm | 11.x, lockfile committed |
| Git | any current release |

```bash
npm ci
cp .env.example .env.local
npm run dev                     # creates .dev.vars with a random dev secret

# Worker runtime instead of the Next.js dev server:
npm run db:migrate:local
npm run start:worker            # http://127.0.0.1:8787
```

`.dev.vars` is git-ignored and read by Wrangler as local Worker bindings; Next.js
`dev` reads the same variables through `getCloudflareContext`. `npm run dev` runs
`scripts/ensure-dev-vars.mjs` first: it creates the file from the committed example
if absent and replaces only the placeholder with a cryptographically random
development secret. An existing valid secret is never overwritten, and the value is
never printed. Restart the dev server after editing the file: `.dev.vars` is read
once at startup. Never commit `.dev.vars`, `.env`, `.env.local` or any file
containing credentials; example files list names only.

The Next.js dev server derives its Better Auth origin from the loopback request, so
a preview on a different port still passes origin checks. The Worker keeps using
`BETTER_AUTH_URL` (8787 by default). Production reads `BETTER_AUTH_SECRET` only
from the platform binding and fails closed when it is missing or short.

## 2. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (single run) |
| `npm run check:boundaries` | Architecture gate only |
| `npm run check` | typecheck + lint + test |
| `npm run build:worker` | OpenNext build → `.open-next/worker.js` |
| `npm run start:worker` | `wrangler dev` on 127.0.0.1:8787 |
| `npm run verify:runtime` | 29 live HTTP checks against that Worker |
| `npm run verify:dev` | 31 checks against a running Next.js dev preview |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run db:migrate:remote` | Apply migrations to deployed D1 (requires auth) |
| `npm run auth:schema` | Regenerate identity schema SQL from Better Auth |

Email delivery uses `RESEND_API_KEY` and `EMAIL_FROM` as platform secret bindings;
production requires verification unless `EMAIL_VERIFICATION_REQUIRED` is explicitly
`"false"`. Never commit a provider key. `npm run sbom` regenerates the production
dependency inventory after a dependency change.

`npm run check` plus `npm run build` is the minimum before a commit that changes
code. Changes to authentication, middleware, headers, routing, bindings or
migrations additionally require `npm run build:worker`, a `start:worker` session
and `npm run verify:runtime`. A documentation-only commit requires that the diff
is reviewed; it does not require a rebuild unless it changes executable examples.

## 3. The mandatory loop

Every meaningful, completed change follows this sequence:

1. **Inspect** the working tree (`git status`, `git diff`) and identify every
   modified file.
2. **Review** the diff for accidental edits, debug leftovers, generated files and
   secrets.
3. **Verify** with the applicable checks: typecheck, lint, tests, build.
4. **Fix** failures before committing. Do not commit failing or unverified work.
5. **Re-read** the final diff.
6. **Commit** with a descriptive conventional message.
7. **Push** to `origin/main`.
8. **Verify** the push: fetch and confirm the commit is on `origin/main`.
9. **Report** the commit SHA and the files included.

A meaningful change includes: new modules, architectural changes, features,
schema changes, security changes, bug fixes, documentation that establishes or
materially changes a decision, and test-infrastructure changes.

Do not create commits for trivial intermediate typing, and do not accumulate
multiple unrelated completed milestones into one commit. If work is genuinely
unfinished, leave it uncommitted or in a clearly labelled draft commit series on
a branch — not on `main`.

## 4. Commit messages

Conventional Commits, imperative subject, ≤ 72 characters:

```
feat: establish Hestian application foundation
docs: document financial integrity architecture
test: introduce foundational validation suite
fix: enforce tenant boundary validation
chore: initialise toolchain and repository configuration
```

Body (when needed) explains *why*, not a file-by-file narration. Breaking
changes use `!` and a `BREAKING CHANGE:` footer.

Rules:

- Never commit secrets, `.env` files with credentials, tokens, private keys or
  database dumps.
- Never commit `node_modules`, `.next`, `.open-next`, `.wrangler` or coverage.
- Never force-push or rewrite published history.
- Never push a commit that has not passed its applicable checks.

## 5. Synchronisation and conflicts

- If `origin/main` has new commits, `git fetch` and reconcile before pushing.
  Never overwrite remote work.
- Rebase only local, unpushed commits. Published commits are corrected with new
  commits.
- If push fails for authentication or permission reasons: do not claim success,
  keep the local commit, report the exact error, the local SHA and the action
  needed (for example re-authenticating the stored Git credential) to restore
  synchronisation.

## 6. Review gates

A change is ready when:

- [ ] `npm run check` passes, plus `npm run build` for code changes.
- [ ] New behaviour has tests, including failure paths.
- [ ] Architectural changes update `src/modules/manifest.ts` **and** the
      architecture documentation, and add or amend an ADR.
- [ ] Financial changes state which invariants (`FI-xx`) they preserve or modify.
- [ ] Security-relevant changes complete the checklist in
      [SECURITY.md](SECURITY.md#10-review-checklist).
- [ ] No fixture or sample financial data is presented as real.
- [ ] Documentation status (implemented / planned) matches reality.

## 7. Decision records

Architecture Decision Records live in [docs/decisions/](decisions/). Add one when
a decision is hard to reverse, affects module boundaries, money representation,
security or deployment. Use the template in
[docs/decisions/README.md](decisions/README.md). ADRs are immutable once
accepted; supersede with a new record instead of rewriting history.

## 8. Milestones and scope discipline

- Milestones are defined in [ROADMAP.md](ROADMAP.md). Do not begin the next
  milestone automatically; each ends with a completion report and awaits review.
- Do not implement capabilities the milestone excludes, even if they are small.
- Mark every planned capability as planned in code and documentation until it is
  implemented and tested. A convincing screenshot is not evidence.

## 9. CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test`
5. `npm run build`
6. `npm run build:worker`

CI does not run workerd, so it cannot prove headers, cookies, D1 bindings or
authentication behaviour end to end; `npm run verify:runtime` is the manual gate
for those.

## 10. Dependency review

Any dependency change follows this procedure:

1. Run `npm audit` and `npm audit --omit=dev`; record the result.
2. Trace every finding with `npm ls <package>` and decide whether the affected code is
   reachable from Worker request handling, build tooling, or tests.
3. Prefer a compatible upgrade. Do not downgrade Next.js, OpenNext, Wrangler or Better
   Auth to silence an advisory, and never run `npm audit fix --force` without an ADR.
4. If an override is required, pin exact versions, rerun `npm run check`,
   `npm run build:worker` and `npm run verify:runtime`, and record the risk in an ADR.
5. Regenerate the SBOM (`npm run sbom`) and commit it with the change.
6. An advisory is not dismissed because it is transitive; it is either fixed or
   documented with a reachability argument and a remediation plan.

## 11. Migrations

- Migrations live in `migrations/` and are applied by the Wrangler D1 migrator.
  They are forward-only; never edit an applied migration.
- Identity tables (including two-factor) are generated from the authentication
  library configuration: run `npm run auth:schema` (optionally with a scratch output
  path), review the produced SQL, then add it as a new numbered migration and account
  for existing rows. Do not hand-edit provider tables.
- Test locally against a fresh database, then against the existing local database
  to prove the migration applies to populated state.
- Every tenant-scoped table must include `business_id`, its foreign key and the
  indexes the access patterns need. `tests/database/migrations.test.ts` asserts
  the resulting constraints.
- Remote application (`npm run db:migrate:remote`) requires explicit authorization
  and a backup; no remote database exists yet.

## 12. Deployment (planned)

Not performed in this milestone. When it begins:

1. Build and test locally first, including the Worker runtime path
   (`wrangler dev` / workerd) with the deployment compatibility date.
2. Provision the remote D1 database, apply migrations, and confirm the binding in
   a preview environment before serving traffic.
3. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and email provider secrets as
   platform secret bindings; never in a committed file.
4. Deploy to a preview environment, verify routes, headers, data isolation and
   signed-out behaviour on the preview origin.
5. Obtain explicit authorization before publishing to production.
6. Record the deployed commit SHA and verify the environment reports that version.

Never deploy from a dirty working tree, and never publish a build that has not
passed CI and the runtime checks.

## 13. Rollback

- Code: redeploy the last known-good commit; do not revert published migrations.
- Data: restore from backup only as an explicit, audited incident action.
- If a financial defect is found, prefer a correcting entry over a data edit, and
  record the incident and its resolution.

## 14. Definition of done

A milestone is done when its behaviour is implemented, tested at the appropriate
levels, documented with accurate status, committed and pushed, and its completion
report includes the commit SHA and verification result.
