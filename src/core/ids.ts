import { DomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

/**
 * Nominal identifier types.
 *
 * A raw `string` must never be accepted where a tenant-scoped identifier is
 * expected: at runtime that is how cross-tenant reads happen. Identifiers are
 * parsed once at the boundary and carried as branded types from then on.
 */
declare const identifierBrand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [identifierBrand]: B };

export type TenantId = Brand<string, "TenantId">;
export type BusinessId = Brand<string, "BusinessId">;
export type UserId = Brand<string, "UserId">;
export type AccountId = Brand<string, "AccountId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;
export type SourceEvidenceId = Brand<string, "SourceEvidenceId">;
export type IntegrationId = Brand<string, "IntegrationId">;

/**
 * Permissive but strict format: 1–64 characters, ASCII letters, digits,
 * underscore or hyphen, must start with an alphanumeric character. This admits
 * UUIDs and ULIDs while rejecting path separators, whitespace and unicode
 * lookalikes.
 */
const IDENTIFIER_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{0,63}$/;

function parseIdentifier<T extends string>(raw: unknown, kind: string): Result<T, DomainError> {
  if (typeof raw !== "string") {
    return err(
      new DomainError({
        code: "INVALID_IDENTIFIER",
        message: `${kind} must be a string.`,
        details: { kind },
      }),
    );
  }

  if (!IDENTIFIER_PATTERN.test(raw)) {
    return err(
      new DomainError({
        code: "INVALID_IDENTIFIER",
        message: `${kind} is not a valid identifier.`,
        details: { kind },
      }),
    );
  }

  return ok(raw as T);
}

export function parseTenantId(raw: unknown): Result<TenantId, DomainError> {
  return parseIdentifier<TenantId>(raw, "TenantId");
}

export function parseBusinessId(raw: unknown): Result<BusinessId, DomainError> {
  return parseIdentifier<BusinessId>(raw, "BusinessId");
}

export function parseUserId(raw: unknown): Result<UserId, DomainError> {
  return parseIdentifier<UserId>(raw, "UserId");
}

export function parseAccountId(raw: unknown): Result<AccountId, DomainError> {
  return parseIdentifier<AccountId>(raw, "AccountId");
}

export function parseJournalEntryId(raw: unknown): Result<JournalEntryId, DomainError> {
  return parseIdentifier<JournalEntryId>(raw, "JournalEntryId");
}

export function parseSourceEvidenceId(raw: unknown): Result<SourceEvidenceId, DomainError> {
  return parseIdentifier<SourceEvidenceId>(raw, "SourceEvidenceId");
}

export function parseIntegrationId(raw: unknown): Result<IntegrationId, DomainError> {
  return parseIdentifier<IntegrationId>(raw, "IntegrationId");
}
