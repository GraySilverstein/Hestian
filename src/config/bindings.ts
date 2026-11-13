/**
 * Structural types for the platform bindings Hestian actually uses.
 *
 * These mirror the subset of the Cloudflare D1 API that the application relies
 * on, rather than importing ambient worker globals. That keeps the domain code
 * testable against any SQLite-compatible implementation (including the Node
 * `node:sqlite` adapter used in the test suite) and avoids relying on globals
 * that differ between `next dev`, workerd and unit tests.
 */

export interface DatabaseResult<T = Record<string, unknown>> {
  readonly results: T[];
  readonly success?: boolean;
  readonly meta?: {
    readonly changes?: number;
    readonly last_row_id?: number;
  };
}

export interface DatabaseStatement {
  bind(...values: readonly unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run(): Promise<DatabaseResult>;
}

export interface Database {
  prepare(sql: string): DatabaseStatement;
  batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseResult[]>;
  exec(sql: string): Promise<unknown>;
}

/** Environment bindings declared in `wrangler.jsonc`. */
export interface HestianBindings {
  readonly DB: Database;
  readonly HESTIAN_ENV?: string;
  readonly BETTER_AUTH_SECRET?: string;
  readonly BETTER_AUTH_URL?: string;
  readonly EMAIL_FROM?: string;
  readonly RESEND_API_KEY?: string;
}
