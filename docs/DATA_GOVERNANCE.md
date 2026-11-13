# Data governance

Status: first tenant data is now stored (identity, businesses, memberships,
invitations, audit). Financial records, documents and AI data do not exist. This
document separates what is stored today from what is planned, and states the
retention decisions that remain open.

---

## 1. Classification

| Class | Examples | Handling |
| --- | --- | --- |
| **Public** | product marketing copy, documentation | no restriction |
| **Internal** | module structure, non-tenant operational metrics | staff only |
| **Confidential** | tenant financial records, invoices, counterparties, project costs, campaign performance, business names, membership lists | tenant-scoped access, no cross-tenant aggregation without explicit contract |
| **Restricted** | provider credentials, session tokens, password hashes, invitation tokens, encryption keys, bank account numbers, tax identifiers | encrypted or hashed, never logged, never returned to the browser, access audited |

Financial records are Confidential by default. Anything that authenticates or
moves money is Restricted.

### Data stored today

| Data | Class | Location | Notes |
| --- | --- | --- | --- |
| Name, email address | Confidential | `identity_user` | Collected at registration; no verification yet |
| Password hash (scrypt) | Restricted | `identity_account.password` | Never logged or returned; plaintext never stored |
| Session token hash, expiry, IP, user agent | Restricted | `identity_session` | IP/user agent are collected by the provider for security; not surfaced in the UI |
| Verification / reset tokens | Restricted | `identity_verification` | Single-use, expiring; delivery unconfigured |
| Business name, functional currency | Confidential | `tenancy_business` | Created by an authenticated owner |
| Membership role and status | Confidential | `tenancy_membership` | Drives authorization |
| Invitation email, role, token hash | Confidential / Restricted | `tenancy_invitation` | Token stored only as SHA-256; expires in 7 days |
| Audit events | Internal, may contain Confidential references | `audit_event` | Metadata redacted; no emails, tokens or passwords |
| Rate-limit counters | Internal | `identity_rate_limit`, `platform_rate_limit` | Keyed by hashed subject; no content |

Not stored: financial transactions, documents, payment details, tax identifiers,
uploaded files, AI prompts or outputs.

## 2. Ownership

- A module owns its tables. No other module queries them directly; reads go
  through the owner's exported contracts, which enforce tenant scope.
- The tenant owns its business data. Hestian holds it as processor/controller
  depending on the contract, which must be stated explicitly before launch.
- Derived analytical outputs (Layer C) are owned by the module that computed
  them, carry their inputs, and are disposable.
- Audit events are owned by `audit` and are not editable by any module; database
  triggers reject `UPDATE` and `DELETE`.

## 3. Provenance

Every important financial fact must be traceable to its source:

1. **Evidence** records the original artefact: provider, provider object id,
   received timestamp, content hash, storage reference.
2. **Financial event** references the evidence that justified it and the rule
   version that interpreted it.
3. **Journal entry** references the financial event, or records the manual
   justification for an adjustment.
4. **Reconciliation outcome** references the evidence and the entry it matched.
5. **Intelligence output** references the retrievable evidence and the data
   window it used.

A record whose provenance cannot be resolved is a defect. Provenance references
are immutable; a correction creates new records rather than rewriting the chain.

Today the only provenance is the audit chain: each event hashes the previous event,
so the order and integrity of security-relevant actions can be verified.

## 4. Data quality and ambiguity

- Conflicting evidence produces an `unresolved` review item with both sources
  attached. It is never averaged, guessed or silently dropped.
- Missing data is represented as unknown, not zero. Reporting must distinguish
  "no spend recorded" from "spend of zero".
- Imported data is validated against a schema; records that fail validation are
  stored as rejected evidence with a reason, so the failure is visible.
- Duplicate detection uses content hashes and provider identifiers, not fuzzy
  matching, for anything that affects money.

## 5. Retention

Implemented today:

| Data | Retention | Notes |
| --- | --- | --- |
| Sessions | 8 hours absolute; refresh extends activity within that window | Rows expire and are rejected on read; no cleanup job yet |
| Invitations | 7 days, single use | Expired invitations remain rows until a cleanup policy exists |
| Rate-limit counters | Window length (max 5 minutes) | Overwritten in place by key |
| Audit events | Indefinite | Append-only; retention period undecided |
| Identity and tenancy records | Until deletion is implemented | No self-service account deletion exists |

Planned policy (periods to be confirmed with legal review before production):

| Data | Retention | Notes |
| --- | --- | --- |
| Journal entries, invoices, payments | Life of tenant + statutory retention period | Never hard-deleted while retained; corrections are reversals |
| Source evidence | At least as long as the records it supports | Documents in R2, referenced by hash |
| Audit events | Life of tenant + statutory period | Append-only |
| Session and authentication records | Short operational window | Security monitoring only |
| Analytical outputs | Recomputation window, typically months | Disposable; excluded from backup guarantees |
| Operational logs | Days to weeks | Not a system of record |

Retention durations are unresolved because they depend on jurisdiction and
contract. No retention claim should be made in product copy until decided.

## 6. Deletion and tenant offboarding

- Deleting a financial record is never a correction and is never available
  through normal application paths (FI-20).
- Tenant offboarding: export the tenant's data in a documented format, then
  delete after the contractual and statutory window. Deletion is recorded as an
  audit event with scope and date.
- Account-level deletion (Sites → Delete site) destroys code, secrets, the D1
  database and R2 objects. This is distinct from tenant offboarding and must not
  be offered as a tenant-facing "delete my data" control.
- Legal hold suspends deletion for the affected tenant; the hold itself is
  audited.
- Account deletion is **not implemented**. The authentication provider exposes a
  deletion hook, but Hestian has no user-facing flow, no confirmation step, no
  grace period and no export. This must be designed before launch.
- Email addresses cannot currently be changed or removed by the user; a change
  would require re-verification, which depends on an email provider.

## 7. Residency and subprocessors

- Data is stored in the platform's D1 region. The exact region set and any
  data-residency guarantees are unresolved and must be confirmed before
  representing residency to customers.
- Subprocessors (hosting, model providers, email) require a recorded list with
  purpose and data categories. None are engaged in this milestone; Resend is the
  intended email provider but is not configured.
- Cross-border transfer mechanisms are a legal decision, not an engineering one.

## 8. AI and model data

Rules for when intelligence work begins:

1. Model output is untrusted data. It can never mutate Layer A or Layer B, and it
   cannot authorize an action.
2. Tenant data may be sent to a model provider only if the applicable contract
   permits it, the tenant has been informed, and the data is minimised to the
   task. Credentials and Restricted-class identifiers are never included.
3. Prefer aggregates and explicitly selected records over bulk export.
4. Every model-derived output records the model identifier, prompt version,
   evidence references and timestamp, so it can be reproduced or withdrawn.
5. Prompt injection from imported content (invoice memos, product names, campaign
   copy) is expected. Retrieved content is data, never instruction.
6. Provider training-on-customer-data terms must be verified and documented
   before any tenant data is sent.
7. Recommendations are proposals; acting on them requires a human-authorized
   operation in the owning module.

No AI feature, prompt or embedding exists in this milestone.

## 9. Fixtures and test data

- Any development fixture must be labelled as a fixture in its name and in the
  UI where it appears, and must be syntactically obvious (for example
  `FIXTURE — not real financial data`).
- Fixtures never enter a production database. Seeding is a local/test-only path.
- Real tenant data is never copied into a test, a screenshot, a prompt or a
  repository file.
- Tests create synthetic users such as `a@example.com` in isolated databases.

## 10. Storage, backup and migrations

- D1 is the authoritative store. R2 is not used yet.
- Migrations are forward-only, reviewed, and applied through Wrangler
  (`db:migrate:local`, `db:migrate:remote`) — never by hand-editing production
  data. Each migration states what happens to existing rows.
- Local state lives in `.wrangler/state` and is disposable; it is not a backup.
- D1 backup/restore capabilities and point-in-time recovery must be verified and
  documented before real tenant data exists. Do not promise a recovery objective
  until a restore has been rehearsed. No remote database exists yet, so this is
  unverified.
- Restoring a backup is itself a consequential action and must be audited.

## 11. Access and least privilege

- Human access to production data is limited to those who need it, is logged, and
  is reviewed periodically.
- Support access to a tenant's data requires the tenant's authorization and a
  time-bounded grant.
- Exports are generated server-side, access-controlled, expiring and audited.
- No public R2 objects. Document access will use signed, short-lived URLs.
- No production environment exists yet, so no production access grant exists.

## 12. Open questions

1. Statutory retention durations by jurisdiction.
2. Data residency commitments the platform can actually support.
3. Tenant export format and whether it must be machine-reconcilable.
4. Whether analytical outputs are included in tenant exports.
5. Legal basis and consent model for any model-provider data sharing.
6. Audit log retention and tenant-facing audit access.
7. Encryption key management and rotation ownership.
8. Account deletion, export and grace-period design.
9. Cleanup jobs for expired sessions, invitations and rate-limit rows.
