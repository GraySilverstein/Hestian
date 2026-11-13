/**
 * Deterministic serialisation for audit hashing.
 *
 * JSON.stringify preserves insertion order, which would make hashes depend on
 * object construction. Keys are sorted instead so the same event content always
 * produces the same digest.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export { sha256Hex, toHex } from "@/core/crypto";

export const GENESIS_HASH = "0".repeat(64);
