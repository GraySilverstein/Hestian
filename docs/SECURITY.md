# Security

Status: security architecture documented. **No authentication, session, role or
tenant enforcement exists in the codebase.** There is no user data to protect yet,
and this document must not be read as evidence that the system is secure.

What *does* exist and is tested: fail-closed configuration validation, rejection
of secrets in `NEXT_PUBLIC_*` variables, structured redacting logs, exact money
handling, and an import-graph gate that prevents analytical code from reaching
financial authority.

---

## 1. Security principles

1. **Deny by default.** Unknown identity, unknown permission, unknown record or
   unknown state results in refusal, not a permissive fallback.
2. **The server decides.** A browser can hide a button; only the server can deny
   an action. No client-supplied tenant, role, user id or amount is trusted.
3. **Least data.** Return only the fields the current view needs; never return a
   full record because it is convenient.
4. **Secrets stay server-side.** Credentials live in platform secret storage,
   are read in the operation that needs them, and never appear in bundles,
   client state, logs, error messages or URLs.
5. **Evidence before consequence.** Payment-related and reconciliation actions
   require verified evidence and explicit authorization.
6. **Consequential actions are auditable.** If it changes money, access or
   obligations, it produces an audit event.
7. **Fail closed on ambiguity.** A cross-tenant or unresolved-tenant record is
   treated as absent, not as accessible.

## 2. Trust boundaries

```
untrusted              │ trusted boundary                    │ authoritative
───────────────────────┼─────────────────────────────────────┼──────────────────
browser (JS, forms,    │ route handler / server action       │ D1, R2
URLs, cookies)         │  → session verification             │ (single primary)
webhook payloads       │  → tenant + permission decision     │
provider APIs          │  → validation → module → gate        │ audit log
model output           │                                     │
───────────────────────┴─────────────────────────────────────┴──────────────────
Everything left of the boundary is attacker-controlled input.
Model output is untrusted data, never an instruction and never a write permit.
```

## 3. Threat model

| # | Threat | Primary controls | Status |
| --- | --- | --- | --- |
| T-01 | Cross-tenant data read via forged id or query parameter | Tenant derived from server session; tenant in every key; deny-by-default; two-tenant tests | planned |
| T-02 | Privilege escalation by client-claimed role | Role read from membership records server-side; no role from headers/cookies | planned |
| T-03 | Credential/token theft from browser or bundle | No secrets in client code; platform secret bindings; no `NEXT_PUBLIC_*` secrets (config guard implemented) | partially |
| T-04 | Webhook forgery causing fake revenue | Signature verification before state change; unverified deliveries stored but inert | planned |
| T-05 | Replay/duplicate webhook creating duplicate money effects | Provider event id + idempotency key uniqueness; replay returns existing result | planned |
| T-06 | AI-induced financial mutation | Static import gate; no analytical→authority edges; no model-authored posting API | **enforced (static)** |
| T-07 | Prompt injection via imported content influencing actions | Model output treated as data; recommendations require human-authorized operation | planned |
| T-08 | Silent financial restatement | Append-only books; reversal records; audit trail | planned |
| T-09 | Insider abuse by a privileged member | Role ceilings, separation of duties for payments, full audit trail, least privilege | planned |
| T-10 | Secret leakage through logs/errors | Redacting logger (implemented); generic client errors; no raw payload logging | partially |
| T-11 | Dependency compromise | Lockfile, pinned versions, CI install from lockfile, review of new dependencies | partially |
| T-12 | Enumeration of other tenants' records via error differences | `NOT_FOUND` for both absent and unauthorized resources | planned |
| T-13 | Session fixation / theft | Server-issued sessions, rotation on privilege change, short lifetime, secure cookies | planned |
| T-14 | Denial of service through expensive requests | Bounded request size, pagination, chunked jobs, platform limits | planned |
| T-15 | Backup or export exfiltration | Access-controlled exports, audit of export actions, no public R2 objects | planned |

## 4. Authentication (planned)

- Use the platform-managed sign-in (Freebuff Sign in) when the milestone that
  implements identity begins. Do not hand-roll cryptography.
- Identity is established by the server from a verified provider assertion; a
  user id in a request body or query is never authentication.
- Sessions: secure, HTTP-only, same-site cookies; rotation on privilege change;
  explicit revocation; no long-lived tokens in browser storage.
- Signed-out requests to private routes return `401`. A sign-in redirect is not
  proof of authentication; tests must complete a full sign-in, callback, session
  and sign-out flow on the deployed origin before the feature is called working.

## 5. Authorization (planned)

Role-based access with resource-level narrowing. Roles are ceilings; grants can
remove capability but never add it.

| Capability | owner | accountant | employee | contractor | agency |
| --- | --- | --- | --- | --- | --- |
| View financial reports | yes | yes | scoped | no | scoped |
| Create/edit draft entries | yes | yes | no | no | no |
| Post entries | yes | yes | no | no | no |
| Reconcile | yes | yes | no | no | no |
| Manage members | yes | no | no | no | no |
| Approve payments | yes | no | no | no | no |
| Execute payments | owner only, explicit confirmation | no | no | no | no |
| View own project costs | yes | yes | scoped | scoped | scoped |

Rules:

- Authorization is evaluated on the server for every read and write. Client-side
  gating is cosmetic.
- Cross-tenant access returns `NOT_FOUND`, never `FORBIDDEN`, to avoid confirming
  existence.
- Every permission decision is a typed result with a reason code, so denials are
  auditable without leaking data.

## 6. Tenant isolation

Because D1 is SQLite-compatible, there is no row-level security. Isolation must be
enforced by construction:

1. `tenant_id` is a required column of every tenant-scoped table and part of its
   primary/unique keys.
2. Repositories take a `TenantContext` value, never a raw id from the request.
3. No query function exists without a tenant parameter; module query contracts
   scope by tenant internally.
4. Composite unique constraints include `tenant_id`, so a global-unique assumption
   cannot leak into a multi-tenant deployment.
5. The test suite must include a two-tenant isolation suite per module; a module
   without it is not complete.

Decision record: [decisions/0005-tenant-isolation.md](decisions/0005-tenant-isolation.md).

## 7. Credentials and integration secrets

- Provider credentials are encrypted at rest using a key held in platform secret
  storage, never in the database or repository. Envelope encryption with a
  per-record data key allows rotation without re-encrypting everything.
- Decryption happens inside the operation that needs the credential; plaintext is
  never returned to callers, logged, or cached across requests.
- Tokens are refreshed with the stored refresh credential and re-encrypted; a
  revoked connection is marked `revoked` and blocks further calls.
- No secret is ever placed in a `NEXT_PUBLIC_*` variable. `src/config/env.ts`
  rejects such names at startup.
- `.env` files are ignored by git; `.env.example` documents names only.

## 8. Payment-related actions

- Payment execution is out of scope for now. When introduced it requires:
  explicit human confirmation with the amount and counterparty displayed,
  step-up authentication, separation of duties (initiator ≠ approver), an
  idempotency key, a recorded approval, and an audit event.
- An AI recommendation can never trigger a payment, even indirectly.
- Amounts and counterparties are re-read and re-validated server-side at
  execution time; nothing displayed in the browser is trusted.

## 9. Audit

Consequential actions produce an audit event containing actor, tenant, action,
target, outcome, correlation id and timestamp. Audit writes are part of the same
transaction as the action; if the audit write fails the action fails. Audit
events never contain credentials, tokens or full provider payloads.

## 10. Logging and error hygiene

- One JSON line per event with stable names; sensitive keys redacted at any depth;
  payloads bounded; circular structures described, not followed.
- Client-facing errors carry a code and a generic message. Stack traces, SQL,
  provider payloads and internal identifiers stay server-side.
- `no-console` is enforced outside the logger module.
- Correlation ids allow tracing without exposing tenant data in URLs.

## 11. Dependency and supply chain

- Lockfile committed; CI installs with `npm ci`.
- Dependencies are added only with a stated need. Authentication, cryptography,
  money and ORM choices get an ADR.
- No dependency may be introduced that reads tenant data at build time.

## 12. Known limitations and debt

1. No authentication, sessions, roles or tenant records exist.
2. No database, therefore no isolation tests and no encryption-at-rest design in
   practice.
3. No rate limiting, CSRF strategy, security headers policy or CSP yet. Next.js
   defaults are not a policy; define one before exposing a real deployment.
4. No secrets management integration; only local `.env` and platform secrets.
5. No dependency or container scanning beyond GitHub's defaults.
6. No incident response runbook, key rotation drill or backup restore test.
7. Worker runtime security characteristics (CPU limits, cold starts, log access)
   are unverified.

## 13. Review checklist for security-relevant changes

- [ ] Identity and tenant are derived server-side, never from the payload.
- [ ] Every new table has `tenant_id` in its keys.
- [ ] Every new route checks authentication and authorization before data access.
- [ ] New inputs are validated at the boundary and typed inward.
- [ ] No secret, token or raw provider payload is logged or returned.
- [ ] Consequential actions emit an audit event in the same transaction.
- [ ] Errors use domain codes; cross-tenant cases return `NOT_FOUND`.
- [ ] Two-tenant isolation tests added or updated.
- [ ] No analytical module gained an import edge into financial authority.
