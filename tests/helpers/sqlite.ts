import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import type { Database, DatabaseResult, DatabaseStatement } from "@/config/bindings";

type SqlValue = string | number | bigint | null | Uint8Array;

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

export interface TestDatabase {
  /** D1-shaped adapter used by application code. */
  readonly db: Database;
  /** Raw connection for assertions and the Better Auth adapter. */
  readonly raw: DatabaseSync;
  close(): void;
}

class NodeSqliteStatement implements DatabaseStatement {
  constructor(
    private readonly connection: DatabaseSync,
    private readonly sql: string,
    private readonly values: readonly SqlValue[] = [],
  ) {}

  bind(...values: readonly unknown[]): DatabaseStatement {
    return new NodeSqliteStatement(this.connection, this.sql, values as SqlValue[]);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.connection.prepare(this.sql).get(...this.values);
    return row === undefined ? null : (row as T);
  }

  async all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>> {
    const rows = this.connection.prepare(this.sql).all(...this.values) as T[];
    return { results: rows, success: true };
  }

  async run(): Promise<DatabaseResult> {
    const info = this.connection.prepare(this.sql).run(...this.values);
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
}

class NodeSqliteDatabase implements Database {
  constructor(private readonly connection: DatabaseSync) {}

  prepare(sql: string): DatabaseStatement {
    return new NodeSqliteStatement(this.connection, sql);
  }

  async batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseResult[]> {
    this.connection.exec("BEGIN");
    try {
      const results: DatabaseResult[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.connection.exec("COMMIT");
      return results;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string): Promise<unknown> {
    this.connection.exec(sql);
    return undefined;
  }
}

/**
 * Creates an in-memory SQLite database with the production migrations applied.
 *
 * This is a test double for the D1 *binding shape*, not a replacement for
 * production persistence: it runs the same SQL, constraints and triggers as D1's
 * SQLite engine, while `wrangler dev` verifies behaviour in workerd.
 */
export function createTestDatabase(): TestDatabase {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    raw.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    db: new NodeSqliteDatabase(raw),
    raw,
    close: () => raw.close(),
  };
}

export function insertUser(
  raw: DatabaseSync,
  user: { id: string; email: string; name?: string },
): void {
  const now = new Date().toISOString();
  raw
    .prepare(
      `INSERT INTO identity_user (id, name, email, emailVerified, image, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, NULL, ?, ?)`,
    )
    .run(user.id, user.name ?? "Test User", user.email, now, now);
}
