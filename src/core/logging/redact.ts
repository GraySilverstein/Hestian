export const REDACTED = "[redacted]";

/**
 * Keys whose values are never written to logs. Redaction is a defence in depth:
 * callers must not pass secrets to the logger in the first place.
 */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|phrase)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|session|bearer|signature)/i;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 50;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function truncate(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH)}…[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Produces a JSON-safe, size-bounded copy of `value` with sensitive keys
 * replaced and unsafe structures described rather than serialised.
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null) return null;

  switch (typeof value) {
    case "undefined":
      return undefined;
    case "string":
      return truncate(value);
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "symbol":
      return "[symbol]";
    case "function":
      return "[function]";
    default:
      break;
  }

  const object = value as object;

  if (depth >= MAX_DEPTH) return "[max-depth]";
  if (seen.has(object)) return "[circular]";
  seen.add(object);

  if (object instanceof Date) return object.toISOString();
  if (object instanceof Error) {
    return {
      type: "Error",
      name: object.name,
      message: truncate(object.message),
    };
  }
  if (Array.isArray(object)) {
    const limited = object.slice(0, MAX_ARRAY_LENGTH).map((item) => redactValue(item, depth + 1, seen));
    return object.length > MAX_ARRAY_LENGTH
      ? [...limited, `[${object.length - MAX_ARRAY_LENGTH} more items]`]
      : limited;
  }
  if (!isPlainObject(object)) {
    return { type: "unsupported-object", tag: Object.prototype.toString.call(object) };
  }

  const entries = Object.entries(object as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  for (const [key, entry] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(entry, depth + 1, seen);
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    result["[truncated-keys]"] = entries.length - MAX_OBJECT_KEYS;
  }
  return result;
}
