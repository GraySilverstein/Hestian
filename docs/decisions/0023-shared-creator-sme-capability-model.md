# 0023 — One ledger with creator/SME capability profiles

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

Creators and SMEs have different revenue sources and operational documents but the
same double-entry accounting. Building separate financial systems would duplicate
invariants, reporting and reconciliation, and would make "creator who sells merch" or
"SME with platform income" a forced choice.

## Decision

1. One canonical ledger, chart-of-accounts model, journal, payment/settlement and
   reconciliation for both segments.
2. Segment differences are expressed through:
   - business profile and explicit **capability flags**;
   - **revenue source** and channel dimensions;
   - optional commercial agreements, projects, orders, inventory, recurring contracts;
   - onboarding/default templates.
3. No segment-specific journal, account type, invoice table or payment table.
4. Optional capabilities (inventory, projects, campaigns, payroll) are enabled per
   business and never become assumptions in the core.
5. Creator platform earnings and sponsorships use the same evidence → event →
   journal/invoice path as SME sales. A sponsorship is an agreement, not a ledger
   primitive.
6. Business type changes affect defaults/UI, never posted entries.
7. Cross-business consolidation remains deferred and is never implicit.

## Consequences

**Easier:** one invariant/test surface; creators and SMEs can mix models; reporting is
comparable; future capabilities attach without a second ledger.

**Harder:** onboarding must ask the right questions instead of branching code;
capability flags must be authorized and audited; dimension/reporting design must serve
both segments.

**Forbidden:** `creator_*`/`sme_*` financial tables; assuming creators have no
inventory or SMEs have no platform income; encoding segment in journal rules.

## Alternatives considered

- **Two products/two ledgers.** Rejected: duplicates correctness surface and blocks
  hybrid businesses.
- **One universal schema with every optional column.** Rejected: forces inventory,
  payroll and campaign fields on every business and encourages incorrect defaults.
- **Segment-specific posting rules.** Rejected: accounting treatment depends on the
  transaction and policy, not the customer type.

## Follow-ups

- Capability provisioning and onboarding UX.
- Revenue-source/channel reporting contracts.
- Migration rules for enabling capabilities after postings.
- Test matrix covering hybrid creator-retailer and service-SME scenarios.
