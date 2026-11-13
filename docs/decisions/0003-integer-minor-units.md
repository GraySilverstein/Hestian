# 0003 — Money as integer minor units

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Monetary arithmetic in an accounting system must be exact and reproducible.
Binary floating point cannot represent most decimal amounts exactly
(`0.1 + 0.2 !== 0.3`), and a one-cent drift compounds across allocations, tax and
reports. Storage is SQLite via D1, which has no decimal type; values read back
through the JSON layer become JavaScript numbers.

## Decision

Money is represented as:

```ts
interface Money {
  readonly currency: CurrencyCode;   // ISO 4217, explicit exponent registry
  readonly amountMinor: bigint;      // integer minor units
}
```

- All arithmetic is integer arithmetic on `bigint`. Floating point is rejected at
  the boundary; no amount is ever parsed into a `number`.
- Values are bounded to ±(2^53−1) (`Number.MAX_SAFE_INTEGER`), enforced at
  construction and after every operation, so every amount round-trips through
  SQLite `INTEGER` and JSON unchanged. Out-of-range values are rejected, never
  rounded.
- JSON contracts carry the amount as a **decimal string**
  (`{ "currency": "USD", "amountMinor": "125000" }`). A JSON number is not an
  acceptable wire format for money.
- Each currency declares its exponent (USD 2, JPY 0, KWD 3). Currencies with
  non-decimal minor units are excluded until a documented decision covers them.
- Only same-currency operations are permitted; mixing throws
  `CURRENCY_MISMATCH`.
- Fractional multiplication, percentage splits, pro-rata allocation, tax rounding
  and FX conversion are **not available** until an explicit rounding policy is
  decided. Whole-number scaling is available.

Implemented in `src/core/money.ts` and covered by `tests/core/money.test.ts`.

## Consequences

**Easier:** exact sums, reproducible reports, safe JSON transport, straightforward
comparison to stored integers, no hidden banker's-rounding behaviour.

**Harder:** callers cannot pass decimals carelessly; conversion for display is a
separate step; any future rounding policy must be introduced deliberately, with
tests, and recorded in a new ADR.

**Required:** a storage rule in the financial-core milestone — `INTEGER` columns
with an application-level range check, and a test proving the ±(2^53−1) boundary
survives a write/read cycle.

## Alternatives considered

- **IEEE-754 floating point.** Rejected: not exact, unsuitable for money, and the
  failure mode is silent.
- **Decimal library (for example decimal.js / big.js).** Viable, but adds a
  dependency, its own rounding modes and a serialisation format; integer minor
  units are simpler and match storage. Revisit only if non-decimal exponents or
  high-precision unit prices are required.
- **Store amounts as text decimal strings.** Rejected for storage: sorting and
  summing require parsing anyway, and `INTEGER` is exact within the enforced range.
- **Store micro-units to avoid rounding.** Rejected: still requires a rounding
  policy, and smaller units do not remove the need for one.

## Follow-ups

1. Decide the rounding policy for allocation remainders, percentage calculations
   and tax (Milestone 1 or the first milestone that needs it).
2. Decide the policy for unit prices that are genuinely fractional (for example
   ₹0.005 per impression) — likely micro-units with explicit rounding.
3. Add property-based tests for sums and allocations once the journal exists.
