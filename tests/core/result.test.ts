import { describe, expect, it } from "vitest";

import { DomainError, toDomainError } from "@/core/errors";
import { err, flatMapResult, isErr, isOk, mapResult, ok, unwrap, unwrapOr } from "@/core/result";

describe("result", () => {
  it("distinguishes success from failure without truthiness traps", () => {
    expect(isOk(ok(0))).toBe(true);
    expect(isErr(ok(0))).toBe(false);
    expect(isErr(err("nope"))).toBe(true);
    expect(isOk(err("nope"))).toBe(false);
  });

  it("maps only the success branch", () => {
    expect(mapResult(ok(2), (value) => value * 2)).toEqual(ok(4));
    expect(mapResult(err("failed"), (value: number) => value * 2)).toEqual(err("failed"));
  });

  it("short-circuits a fallible chain", () => {
    const parse = (raw: string) => (raw === "" ? err("empty") : ok(Number(raw)));

    expect(flatMapResult(parse("21"), (value) => ok(value * 2))).toEqual(ok(42));
    expect(flatMapResult(parse(""), (value) => ok(value * 2))).toEqual(err("empty"));
  });

  it("substitutes a fallback only on failure", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    expect(unwrapOr(err("x"), 99)).toBe(99);
  });

  it("fails closed when a failed result is unwrapped", () => {
    let caught: unknown;
    try {
      unwrap(err(new DomainError({ code: "FORBIDDEN", message: "denied" })));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe("RESULT_UNWRAP_FAILED");
  });

  it("does not leak unexpected error messages when normalising", () => {
    const normalised = toDomainError(new Error("postgres://user:password@host/db"));
    expect(normalised.code).toBe("INTERNAL");
    expect(normalised.message).toBe("An unexpected internal error occurred.");
    expect(JSON.stringify(normalised.toSafeJSON())).not.toContain("password");
  });

  it("passes domain errors through untouched", () => {
    const original = new DomainError({ code: "CONFLICT", message: "already posted" });
    expect(toDomainError(original)).toBe(original);
  });
});
