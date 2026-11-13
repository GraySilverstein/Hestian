import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

/**
 * Monetary amounts are integer minor units plus an ISO 4217 currency code.
 *
 * Binary floating point is never used for money: `0.1 + 0.2 !== 0.3`, and
 * rounding drift in an accounting system is a defect, not a display issue.
 * Amounts are held as `bigint` in memory and stored as integers.
 *
 * `MAX_SAFE_MINOR_UNITS` is `Number.MAX_SAFE_INTEGER` (2^53 - 1). Every value
 * must round-trip through the JSON/SQL number boundary (SQLite `INTEGER`
 * columns are read back as JavaScript numbers) without losing precision, so
 * the bound is enforced at construction and on every operation.
 */
export const MAX_SAFE_MINOR_UNITS = 9_007_199_254_740_991n;

/**
 * Currency exponent registry.
 *
 * This set is deliberately small. Adding a currency is a reviewed change
 * because the exponent and rounding rules affect stored data. Currencies with
 * non-decimal minor units (for example MGA, which uses fifths) are out of scope
 * until a documented decision covers them.
 */
export const CURRENCIES = {
  USD: { minorUnitDigits: 2 },
  EUR: { minorUnitDigits: 2 },
  GBP: { minorUnitDigits: 2 },
  CAD: { minorUnitDigits: 2 },
  AUD: { minorUnitDigits: 2 },
  NZD: { minorUnitDigits: 2 },
  SGD: { minorUnitDigits: 2 },
  JPY: { minorUnitDigits: 0 },
  KRW: { minorUnitDigits: 0 },
  KWD: { minorUnitDigits: 3 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export interface Money {
  readonly currency: CurrencyCode;
  readonly amountMinor: bigint;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

export function minorUnitDigits(currency: CurrencyCode): number {
  return CURRENCIES[currency].minorUnitDigits;
}

/** Constructs a monetary value, failing closed on unsafe or non-integral input. */
export function money(currency: CurrencyCode, amountMinor: bigint): Money {
  if (!isCurrencyCode(currency)) {
    // Defensive: types are erased at runtime and data can arrive untyped.
    throw new DomainError({
      code: "INVALID_ARGUMENT",
      message: "Unknown currency code.",
      details: { field: "currency" },
    });
  }

  if (typeof amountMinor !== "bigint") {
    throw new DomainError({
      code: "INVALID_ARGUMENT",
      message: "Money amounts must be integer minor units held as bigint.",
      details: { field: "amountMinor", receivedType: typeof amountMinor },
    });
  }

  if (amountMinor > MAX_SAFE_MINOR_UNITS || amountMinor < -MAX_SAFE_MINOR_UNITS) {
    throw new DomainError({
      code: "AMOUNT_OUT_OF_RANGE",
      message: "Money amount exceeds the exactly representable range.",
      details: { field: "amountMinor", limit: MAX_SAFE_MINOR_UNITS.toString() },
    });
  }

  return { currency, amountMinor };
}

export function zeroMoney(currency: CurrencyCode): Money {
  return money(currency, 0n);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError({
      code: "CURRENCY_MISMATCH",
      message: "Cannot combine monetary values in different currencies.",
      details: { left: a.currency, right: b.currency },
    });
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.currency, a.amountMinor + b.amountMinor);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.currency, a.amountMinor - b.amountMinor);
}

export function negateMoney(value: Money): Money {
  return money(value.currency, -value.amountMinor);
}

/**
 * Multiplies by a whole-number factor (for example a quantity).
 *
 * Fractional multiplication requires a documented rounding policy and is
 * intentionally unavailable. See docs/decisions/0003-integer-minor-units.md.
 */
export function scaleMoney(value: Money, integerFactor: bigint | number): Money {
  if (typeof integerFactor === "number" && !Number.isSafeInteger(integerFactor)) {
    throw new DomainError({
      code: "INVALID_ARGUMENT",
      message: "A whole-number factor is required.",
      details: { field: "integerFactor" },
    });
  }
  const factor = typeof integerFactor === "bigint" ? integerFactor : BigInt(integerFactor);
  return money(value.currency, value.amountMinor * factor);
}

/** -1 when a < b, 0 when equal, 1 when a > b. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function isZeroMoney(value: Money): boolean {
  return value.amountMinor === 0n;
}

export function isNegativeMoney(value: Money): boolean {
  return value.amountMinor < 0n;
}

/** Exact canonical decimal string, for example `"1234.56"` or `"-0.09"`. */
export function toDecimalString(value: Money): string {
  const digits = minorUnitDigits(value.currency);
  const negative = value.amountMinor < 0n;
  const absolute = negative ? -value.amountMinor : value.amountMinor;
  const sign = negative ? "-" : "";

  if (digits === 0) {
    return `${sign}${absolute.toString()}`;
  }

  const padded = absolute.toString().padStart(digits + 1, "0");
  const whole = padded.slice(0, padded.length - digits);
  const fraction = padded.slice(padded.length - digits);
  return `${sign}${whole}.${fraction}`;
}

/**
 * Wire representation. `bigint` is not JSON-serialisable, so minor units travel
 * as a decimal string and never as a JavaScript number.
 */
export interface SerializedMoney {
  readonly currency: CurrencyCode;
  readonly amountMinor: string;
}

export function serializeMoney(value: Money): SerializedMoney {
  return { currency: value.currency, amountMinor: value.amountMinor.toString() };
}

const INTEGER_STRING_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;

/** Parses untrusted input into `Money`. Used at every external boundary. */
export function parseMoney(input: {
  currency: unknown;
  amountMinor: unknown;
}): Result<Money, DomainError> {
  if (!isCurrencyCode(input.currency)) {
    return err(
      new DomainError({
        code: "INVALID_ARGUMENT",
        message: "Currency must be a supported ISO 4217 code.",
        details: { field: "currency" },
      }),
    );
  }

  const raw = input.amountMinor;
  const asString = typeof raw === "string" ? raw : typeof raw === "bigint" ? raw.toString() : null;

  if (asString === null) {
    return err(
      new DomainError({
        code: "INVALID_ARGUMENT",
        message: "Amount must be an integer number of minor units, encoded as a decimal string.",
        details: { field: "amountMinor" },
      }),
    );
  }

  if (!INTEGER_STRING_PATTERN.test(asString)) {
    return err(
      new DomainError({
        code: "INVALID_ARGUMENT",
        message: "Amount must be a plain integer string with no separators or decimal point.",
        details: { field: "amountMinor" },
      }),
    );
  }

  try {
    return ok(money(input.currency, BigInt(asString)));
  } catch (error) {
    if (error instanceof DomainError) {
      return err(error);
    }
    throw error;
  }
}
