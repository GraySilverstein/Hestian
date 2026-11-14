# 0022 — AI is advisory only; provider-independent gateway

- **Status:** Accepted (design; not implemented)
- **Date:** 2026-11-14

## Context

Hestian may use external API-based inference (initially OpenRouter with LiquidAI
LFM3-1.7B, target ₹0 budget). Financial data is sensitive and model output is
non-deterministic. A model must not become an accounting authority or a data-exfiltration
path.

## Decision

1. AI sits only in Layer C (intelligence). It may read explicitly exported,
   tenant-scoped, minimized data and may produce analyses, forecasts, annotations and
   recommendations with citations.
2. It may **never** create/post journal entries, change balances, authorize
   reconciliation, execute payments, bypass tenant authorization, query D1 directly,
   or override deterministic validation. No write function accepts model output as
   authority.
3. The gateway is provider-independent behind a server-side port. OpenRouter and
   LFM3-1.7B are initial configuration, not a hard dependency. Provider credentials
   stay in server secrets.
4. Financial data processing requires explicit tenant consent. Each provider's data
   policy and retention must be reviewed; free access does not imply safe processing.
   Minimize data, redact identifiers, and send only what the task needs.
5. Outputs are labelled as estimates/advice, carry model/provider/version metadata and
   evidence citations, and cannot be rendered as actuals.
6. Prompt injection and retrieved content are untrusted. Model output cannot change
   tools, permissions or financial state.
7. No AI gateway is implemented in this milestone.

## Consequences

**Easier:** deterministic accounting remains independent; provider can change;
consent and minimization are explicit; forecasts remain distinguishable.

**Harder:** every AI feature needs a read contract, consent flow and evaluation;
provider privacy review is a release gate; citations require evidence plumbing.

**Forbidden:** AI-authored journal payloads; direct model database access; sending
tenant data without consent; treating a confidence/analysis as approval.

## Alternatives considered

- **Direct provider SDK in feature code.** Rejected: couples the domain to a provider
  and spreads credentials/consent logic.
- **AI-assisted posting with human confirmation.** Rejected for authority: even
  confirmed model output would bypass deterministic rule validation; a human may enter
  an adjustment through the normal gate instead.
- **Local model only.** Not selected; the gateway remains provider-independent.

## Follow-ups

- Provider/data-policy review, consent UX and retention.
- Read-only data contracts and redaction.
- Evaluation set for financial explanations and citation accuracy.
- Cost controls and rate limits compatible with the ₹0 target.
