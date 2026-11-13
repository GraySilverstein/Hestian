import { describe, expect, it } from "vitest";

import { DomainError, type ErrorCode } from "@/core/errors";
import {
  MAX_SAFE_MINOR_UNITS,
  addMoney,
  compareMoney,
  isNegativeMoney,
  isZeroMoney,
  money,
  negateMoney,
  parseMoney,
  scaleMoney,
  serializeMoney,
  subtractMoney,
  toDecimalString,
  zeroMoney,
} from "@/core/money";

function expectDomainError(action: () => unknown, code: ErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected a DomainError with code ${code}.`);
}

describe("money", () => {
  it("keeps exact decimal sums where binary floating point would drift", () => {
    const tenCents = money("USD", 10n);
    const twentyCents = money("USD", 20n);

    expect(toDecimalString(addMoney(tenCents, twentyCents))).toBe("0.30");
    // The reason integer minor units exist: the float equivalent is not 0.3.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("subtracts across zero without losing sign", () => {
    const result = subtractMoney(money("USD", 500n), money("USD", 1250n));
    expect(result.amountMinor).toBe(-750n);
    expect(toDecimalString(result)).toBe("-7.50");
    expect(isNegativeMoney(result)).toBe(true);
  });

  it("refuses to combine different currencies", () => {
    expectDomainError(() => addMoney(money("USD", 100n), money("EUR", 100n)), "CURRENCY_MISMATCH");
    expectDomainError(() => compareMoney(money("USD", 1n), money("GBP", 1n)), "CURRENCY_MISMATCH");
  });

  it("enforces the exactly representable range on construction and arithmetic", () => {
    expectDomainError(() => money("USD", MAX_SAFE_MINOR_UNITS + 1n), "AMOUNT_OUT_OF_RANGE");
    expectDomainError(
      () => addMoney(money("USD", MAX_SAFE_MINOR_UNITS), money("USD", 1n)),
      "AMOUNT_OUT_OF_RANGE",
    );
    expectDomainError(() => scaleMoney(money("USD", MAX_SAFE_MINOR_UNITS), 2n), "AMOUNT_OUT_OF_RANGE");
  });

  it("rejects non-integer and unknown-currency construction", () => {
    expectDomainError(() => money("USD", 1.5 as unknown as bigint), "INVALID_ARGUMENT");
    expectDomainError(() => money("XYZ" as never, 100n), "INVALID_ARGUMENT");
    expectDomainError(() => scaleMoney(money("USD", 100n), 1.5), "INVALID_ARGUMENT");
  });

  it("formats currencies according to their exponent", () => {
    expect(toDecimalString(money("USD", 0n))).toBe("0.00");
    expect(toDecimalString(money("USD", 5n))).toBe("0.05");
    expect(toDecimalString(money("USD", -5n))).toBe("-0.05");
    expect(toDecimalString(money("JPY", 1234n))).toBe("1234");
    expect(toDecimalString(money("KWD", 1234n))).toBe("1.234");
  });

  it("round-trips through its wire representation", () => {
    const value = money("EUR", -129900n);
    const serialized = serializeMoney(value);
    expect(serialized).toEqual({ currency: "EUR", amountMinor: "-129900" });

    const parsed = parseMoney(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(value);
    }
  });

  it("parses only plain integer strings at boundaries", () => {
    expect(parseMoney({ currency: "USD", amountMinor: "1000" }).ok).toBe(true);
    expect(parseMoney({ currency: "USD", amountMinor: "-1" }).ok).toBe(true);

    for (const amountMinor of ["1.5", "1,000", " 12", "01", "1e3", "", "١٢"]) {
      const parsed = parseMoney({ currency: "USD", amountMinor });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe("INVALID_ARGUMENT");
      }
    }
  });

  it("rejects unsupported currencies at the boundary", () => {
    const parsed = parseMoney({ currency: "BTC", amountMinor: "100" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("INVALID_ARGUMENT");
      // Error details must not echo the offending value.
      expect(JSON.stringify(parsed.error.toSafeJSON())).not.toContain("BTC");
    }
  });

  it("treats zero and negation as exact operations", () => {
    expect(isZeroMoney(zeroMoney("GBP"))).toBe(true);
    expect(negateMoney(money("GBP", 42n)).amountMinor).toBe(-42n);
    expect(negateMoney(money("GBP", 0n)).amountMinor).toBe(0n);
  });
});
