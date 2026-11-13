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
npm run dev
```

No secrets are required in Milestone 0. Never commit `.env`, `.env.local` or any
file containing credentials.

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

`npm run check` plus `npm run build` is the minimum before a commit that changes
code. A documentation-only commit requires that the diff is reviewed; it does not
require a rebuild unless it changes executable examples.

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
      [SECURITY.md](SECURITY.md#13-review-checklist-for-security-relevant-changes).
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

CI does not verify the Worker runtime, D1 behaviour or authentication; those are
manual steps once the deployment path exists.

## 10. Deployment (planned)

Not performed in this milestone. When it begins:

1. Build and test locally first, including the Worker runtime path
   (`wrangler dev` / workerd) with the deployment compatibility date.
2. Deploy to a preview environment, verify routes, headers, data isolation and
   signed-out behaviour on the preview origin.
3. Obtain explicit authorization before publishing to production.
4. Apply migrations through a controlled path with a backup taken first.
5. Record the deployed commit SHA and verify the environment reports that version.

Never deploy from a dirty working tree, and never publish a build that has not
passed CI.

## 11. Rollback

- Code: redeploy the last known-good commit; do not revert published migrations.
- Data: restore from backup only as an explicit, audited incident action.
- If a financial defect is found, prefer a correcting entry over a data edit, and
  record the incident and its resolution.

## 12. Definition of done

A milestone is done when its behaviour is implemented, tested at the appropriate
levels, documented with accurate status, committed and pushed, and its completion
report includes the commit SHA and verification result.
