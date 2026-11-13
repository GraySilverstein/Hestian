import { DomainError } from "@/core/errors";

/** Successful outcome. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed outcome. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Explicit success-or-failure value.
 *
 * Module boundaries return `Result` for every expected failure mode: invalid
 * input, missing evidence, denied authorization. Exceptions are reserved for
 * invariant violations that must abort the operation. This keeps callers from
 * forgetting the failure path, which is the fail-closed default.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Maps the success value, leaving an error untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, map: (value: T) => U): Result<U, E> {
  return result.ok ? ok(map(result.value)) : result;
}

/** Chains a fallible step, short-circuiting on the first error. */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  next: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? next(result.value) : result;
}

/** Returns the success value or the supplied fallback. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Returns the success value or throws. Intended for already-validated internal
 * values, tests and startup checks — not for request handling.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new DomainError({
    code: "RESULT_UNWRAP_FAILED",
    message: "Attempted to unwrap a failed Result.",
    details: { error: describeErrorForLog(result.error) },
  });
}

function describeErrorForLog(error: unknown): unknown {
  if (error instanceof DomainError) {
    return error.toSafeJSON();
  }
  if (typeof error === "string") {
    return error;
  }
  return "unrecognised error";
}
