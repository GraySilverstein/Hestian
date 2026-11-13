import { redactValue } from "@/core/logging/redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

const SEVERITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Receives one fully-redacted log line. */
export type LogSink = (line: Readonly<Record<string, unknown>>) => void;

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `info`. */
  level?: LogLevel;
  /** Fields merged into every line, for example `{ moduleId: "financial-core" }`. */
  fields?: Readonly<Record<string, unknown>>;
  /** Destination. Defaults to one JSON object per line on stdout. */
  sink?: LogSink;
  /** Clock, injectable for deterministic tests. */
  now?: () => Date;
  /** Included in every line when known; one identifier per request is enough. */
  service?: string;
}

export interface Logger {
  readonly level: LogLevel;
  readonly fields: Readonly<Record<string, unknown>>;
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
  /** Returns a logger with additional fields bound to it. */
  child(fields: Readonly<Record<string, unknown>>): Logger;
}

const consoleSink: LogSink = (line) => {
  // Workers provides `console.log`; a single JSON string per line keeps logs
  // machine-parseable and avoids platform-specific console formatting.
  console.log(JSON.stringify(line));
};

/**
 * Structured logger.
 *
 * Every line carries a stable `event` name (for example
 * `financial-core.entry.posted`) so operational queries do not depend on free
 * text. Sensitive keys are redacted before the sink is called.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const baseFields = options.fields ?? {};
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const service = options.service ?? "hestian";

  function emit(
    recordLevel: LogLevel,
    event: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): void {
    if (SEVERITY[recordLevel] < SEVERITY[level]) return;

    const raw: Record<string, unknown> = {
      time: now().toISOString(),
      level: recordLevel,
      service,
      event,
      ...baseFields,
      ...fields,
    };

    sink(redactValue(raw) as Readonly<Record<string, unknown>>);
  }

  const logger: Logger = {
    level,
    fields: baseFields,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (fields) =>
      createLogger({
        level,
        fields: { ...baseFields, ...fields },
        sink,
        now,
        service,
      }),
  };

  return logger;
}
