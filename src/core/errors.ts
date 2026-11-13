/**
 * Typed, transport-agnostic error codes.
 *
 * A code is the only part of an error that is guaranteed safe to return to a
 * client. Messages and details are developer-facing and must never contain
 * credentials, tokens, tenant-confidential data or raw provider payloads.
 */
export const ERROR_CODES = [
  /** Input failed validation at a boundary. */
  "INVALID_ARGUMENT",
  /** An identifier was malformed or empty. */
  "INVALID_IDENTIFIER",
  /** Two monetary values of different currencies were combined. */
  "CURRENCY_MISMATCH",
  /** A monetary value left the exactly representable range. */
  "AMOUNT_OUT_OF_RANGE",
  /** Server configuration was missing or invalid. */
  "CONFIGURATION_INVALID",
  /** A `Result` was unwrapped while holding an error. */
  "RESULT_UNWRAP_FAILED",
  /** Deliberately unimplemented capability; fails closed rather than guessing. */
  "NOT_IMPLEMENTED",
  /** No verified identity was presented. */
  "UNAUTHENTICATED",
  /** Identity is known but not permitted. */
  "FORBIDDEN",
  /** Resource does not exist or is not visible to this tenant. */
  "NOT_FOUND",
  /** State transition conflicts with current state (for example a replayed key). */
  "CONFLICT",
  /** A record was accessed or written outside its tenant. */
  "TENANT_BOUNDARY_VIOLATION",
  /** A documented accounting or module invariant was violated. */
  "INVARIANT_VIOLATION",
  /** Request body exceeded the permitted size. */
  "PAYLOAD_TOO_LARGE",
  /** Too many attempts in the current window. */
  "RATE_LIMITED",
  /** Unexpected internal failure. */
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  INVALID_ARGUMENT: 400,
  INVALID_IDENTIFIER: 400,
  CURRENCY_MISMATCH: 400,
  AMOUNT_OUT_OF_RANGE: 422,
  CONFIGURATION_INVALID: 500,
  RESULT_UNWRAP_FAILED: 500,
  NOT_IMPLEMENTED: 501,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TENANT_BOUNDARY_VIOLATION: 403,
  INVARIANT_VIOLATION: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** HTTP status for a code. Unknown codes fail closed to 500. */
export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export interface DomainErrorInit {
  code: ErrorCode;
  /** Developer-facing description. Never interpolate secrets or raw payloads. */
  message: string;
  /**
   * Structured, non-sensitive context for logs: field names, identifiers,
   * expected and actual shapes. Never include tokens or full records.
   */
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

/**
 * The single error type crossing module boundaries.
 *
 * Modules must not throw ad-hoc `Error` instances for expected failure modes;
 * they return `Result` values (see `@/core/result`). `DomainError` exists for
 * fail-closed violations of a stated invariant, where continuing would be
 * unsafe.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(init: DomainErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "DomainError";
    this.code = init.code;
    this.details = init.details === undefined ? {} : { ...init.details };
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Log- and transport-safe projection of this error. */
  toSafeJSON(): {
    name: "DomainError";
    code: ErrorCode;
    message: string;
    details: Readonly<Record<string, unknown>>;
  } {
    return {
      name: "DomainError",
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/**
 * Normalises an unknown thrown value into a `DomainError` without leaking the
 * original message of unexpected errors.
 */
export function toDomainError(
  value: unknown,
  code: ErrorCode = "INTERNAL",
  message = "An unexpected internal error occurred.",
): DomainError {
  if (isDomainError(value)) {
    return value;
  }
  return new DomainError({ code, message, cause: value });
}
