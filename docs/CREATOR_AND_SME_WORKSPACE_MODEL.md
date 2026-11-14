# Creator and SME workspace model

Status: **design only.** No workspace, profile, capability, agreement or channel table
exists. The implemented tenant is `tenancy_business` with memberships and invitations.
This document explains how one platform serves creators and SMEs without forking the
financial core.

---

## 1. The shared shape

Both segments need the same accounting spine:

```
business → parties → commercial documents → payments → settlements → journal
```

The differences are in **what is sold, how it is evidenced and which optional
capabilities are enabled**, not in how debits and credits work.

| Dimension | Creator example | SME example | Shared primitive |
| --- | --- | --- | --- |
| Primary income | Platform earnings, sponsorships, products | Invoices, product sales, contracts | Revenue source + invoice/event |
| Counterparty | Brand, platform, audience/customer | Customer, vendor | Party + role |
| Evidence | Platform statement, brand contract | Invoice, bill, bank statement | Source evidence |
| Commitment | Sponsorship/campaign deliverable | Sales order, purchase order | Commercial agreement / operational document |
| Settlement | Platform payout, gateway | Gateway/bank | Payment + settlement |
| Optional | Inventory, employees, locations | Campaigns, creator channels | Capability flags |

No segment gets its own journal, chart of accounts or payment table.

---

## 2. Business, legal entity, workspace

These are three different questions:

| Question | Answer | Storage |
| --- | --- | --- |
| Whose books are these? | **Business** | `tenancy_business` (tenant root) |
| Which legal person is liable / registered? | **Legal entity** (optional) | Proposed `tenancy_legal_entity` |
| Where does the user operate? | **Workspace** | Proposed shell; today implicit 1:1 with business |

Rules:

1. A business can exist without a legal entity. A sole creator or unincorporated
   freelancer has books but may have no company registration.
2. A legal entity can later own multiple businesses. That is a consolidation
   relationship, not a reason to merge ledgers.
3. A workspace is an access/presentation scope. It does not create a legal entity,
   a tax registration or a second set of books.
4. Membership and permissions are business-scoped. A future workspace may show
   several businesses, but every query and mutation still selects one business.
5. Business type is a defaulting/onboarding choice, not an accounting rule. Changing
   it never rewrites posted entries.

A future `BusinessGroup`/consolidation feature is explicitly deferred. Do not add a
`parent_business_id` that silently aggregates balances.

---

## 3. Business profile

`BusinessProfile { businessId, displayName, businessType, legalStructure?, country?,
locale, timezone, functionalCurrency, accountingBasis, fiscalYearStart, capabilities,
onboardingState, version }`

- `businessType`: `creator`, `service`, `retail`, `ecommerce`, `digital`, `trading`,
  `hybrid`, `other`. It selects default capabilities and copy only.
- `legalStructure`: `sole_trader`, `partnership`, `llp`, `corporation`, `nonprofit`,
  `other`; optional and effective-dated.
- `country`/tax jurisdiction is a reference, not an encoded rule set.
- `capabilities`: explicit booleans/list: `invoicing`, `payables`, `inventory`,
  `projects`, `campaigns`, `platform_earnings`, `payroll` (not implemented). A
  capability enables UI and validation, never a different ledger.
- `functionalCurrency` and `accountingBasis` become immutable once a posted entry
  exists. Changing them requires a controlled policy migration, not a settings toggle.
- Every profile change is audited with actor, old/new values (redacted where needed).

---

## 4. Capability matrix

| Capability | Creator default | SME default | Can be enabled later? | Financial authority |
| --- | --- | --- | --- | --- |
| Invoicing/receivables | Yes | Yes | Yes | financial-core |
| Payments/settlements | Yes | Yes | Yes | financial-core |
| Platform earnings evidence | Yes | No | Yes | integrations → event |
| Sponsorship/campaign agreements | Yes | Optional | Yes | business-operations |
| Projects/deliverables | Yes | Optional | Yes | business-operations |
| Vendor bills/payables | Optional | Yes | Yes | financial-core |
| Purchase orders | No | Optional | Yes | business-operations |
| Inventory | No | Optional | Yes | business-operations + valuation event |
| Recurring contracts | Optional | Optional | Yes | business-operations → invoices |
| Multiple channels/locations | Optional | Optional | Yes | dimensions |
| Payroll/employees | No | Optional (deferred) | Not yet | future |
| Multi-entity consolidation | No | No | Deferred | not designed |

Defaults are onboarding presets, not permission to skip accounting controls.

---

## 5. Creator model

### 5.1 Revenue streams

| Stream | Evidence | Commercial object | Accounting path |
| --- | --- | --- | --- |
| Platform earnings (YouTube, TikTok, etc.) | Platform statement/API | Platform account/channel | Evidence → `platform.earnings` event → revenue + fee + clearing |
| Sponsorship/brand deal | Contract, purchase order, email | `CommercialAgreement` | Agreement → invoice/milestone → revenue/recognition |
| Campaign income | Campaign brief/contract | Campaign + agreement | Agreement → invoice/event |
| Affiliate commission | Affiliate statement | Affiliate program/channel | Evidence → commission revenue + fee |
| Digital product sales | Store order/payout | Catalog item + sales order | Invoice/payment/settlement |
| Subscription income | Billing provider record | Recurring contract | Invoice per period; payment/settlement |
| Retainers/consulting | Contract + invoice | Agreement | Invoice/payment |

### 5.2 Agreements and deliverables

A sponsorship agreement records:

- counterparty, brand/product, campaign/project;
- deliverables and due dates (operational);
- amount, currency, payment schedule (deposit/milestone/on-completion);
- exclusivity/usage rights (metadata; not an accounting rule);
- recognition condition (delivery, publication, acceptance) and policy version.

Deliverables are operational records. Completing a deliverable may *request* revenue
recognition; financial-core validates the rule and posts. A deliverable is never a
journal line.

### 5.3 Platform earnings example

```
Statement: gross 80,000, platform fee 16,000, net 64,000
  → evidence stored (provider statement id, hash)
  → event platform.earnings: revenue 80,000; fee 16,000; clearing 64,000
  → bank deposit 64,000: settlement clears clearing
```

If the platform only reports net, do not infer the fee; leave the split unresolved
until evidence/policy exists. Revenue is gross only when the gross is evidenced.

### 5.4 Creator with merchandise

Enable `inventory`; the same catalog/inventory capability as an SME. Creator status
does not imply digital-only or no stock.

---

## 6. SME model

### 6.1 Sell → invoice → collect

```
Sales order (optional) → invoice issued → AR → payment capture → allocation
  → settlement (bank net, gateway fee) → reconciliation to bank statement
```

The order is operational. The invoice creates revenue/receivable under accrual
accounting. Payment does not create revenue again.

### 6.2 Buy → bill → pay

```
Purchase order (optional) → goods/services received → vendor bill → AP
  → payment → settlement/bank → reconciliation
```

A PO is a commitment, not a payable. Receipt may create inventory movements and a
bill; the bill creates the payable.

### 6.3 Inventory and COGS

Inventory movements (receipt, issue, adjustment, transfer) are operational. A
documented valuation/COGS policy turns cost into a financial event. Until that policy
exists, do not store an inventory value as an accounting balance. The model supports
inventory without making it mandatory.

### 6.4 Channels and locations

A channel (Shopify, retail, marketplace, direct) and a location are reporting
dimensions and reconciliation scopes. They may have separate provider connections and
settlement schedules. They do not create separate books.

### 6.5 Recurring contracts

A retainer/subscription contract generates ordinary invoices on a schedule. Each
invoice is idempotent per period. No hidden recurring journal; failed billing creates
an exception, not a silent revenue entry.

---

## 7. Shared operational-to-financial boundary

| Operational record | May request | May not do |
| --- | --- | --- |
| Sales order | invoice issuance | post revenue directly |
| Purchase order | bill/inventory receipt | create payable directly |
| Deliverable | revenue recognition event | write a journal entry |
| Campaign | cost/revenue event | change balances |
| Inventory movement | COGS event | set account balances |
| Approval | authorize a financial event | post it |
| Reconciliation outcome | request adjustment | post directly |

Every request goes through `financial-core`'s validation gate and `commitWithAudit`.

---

## 8. Onboarding

1. Create user (identity).
2. Create business with display name, functional currency, accounting basis, fiscal
   start and country reference.
3. Choose a business type preset; capabilities are explicit and can be changed later.
4. Optionally add legal entity/tax registration (effective-dated).
5. Provision a minimal chart of accounts; owner reviews.
6. Connect channels/providers (deferred; no live integration now).
7. Import opening balances as a posted, evidenced entry (deferred until ledger).
8. Invite accountant/team with least privilege.

Onboarding must not create sample transactions or fake balances. Empty states stay
empty.

---

## 9. Reporting dimensions (shared)

- `business_id` (mandatory tenant boundary)
- `revenue_source`
- `channel_id`
- `location_id`
- `party_id`
- `agreement_id`, `project_id`, `campaign_id`
- `period_id`

Dimensions never affect debit/credit balance. They are validated to belong to the
same business. Reports label actual vs forecast, gross vs net, cash vs accrual.

---

## 10. Security and privacy implications

- Business profile and legal/tax data are restricted; owner/accountant only.
- Party and agreement data are confidential; operational roles see only what their
  role requires.
- Workspace switching must re-authorize; a client-supplied business id is never
  trusted.
- Financial records are retained; identity deletion anonymises the person but does
  not erase posted books. Sole-owner deletion remains blocked until ownership
  transfer exists.
- Export includes business profile, parties, agreements, documents, payments and
  journal metadata; document binaries are separately authorized.
- Logs never contain tax ids, bank details, full payloads or amounts tied to a person
  unless explicitly classified and redacted.

---

## 11. Deferred

- Multi-business workspace UI and consolidation.
- Legal-entity verification/KYC.
- Tax registration validation and jurisdiction rules.
- Payroll and contractor withholding.
- Inventory valuation/COGS policy.
- Creator platform API integrations and revenue-share contracts.
- Cross-business party deduplication.
- Capability migration rules when changing business type after postings.
