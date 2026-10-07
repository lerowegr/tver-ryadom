import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Количество изменённых строк независимо от драйвера:
 * D1 кладёт его в meta.changes, better-sqlite3 (тесты) — в changes.
 */
export function affectedRows(result: unknown): number {
  const r = result as {
    meta?: { changes?: number };
    changes?: number;
    rowsAffected?: number;
  };
  return r.meta?.changes ?? r.changes ?? r.rowsAffected ?? 0;
}

/**
 * `LIKE %ввод%`, где `%_` из ввода — литералы (L1).
 * SQLite понимает экранирование только с явным `ESCAPE '\'`.
 */
export function likeContains(column: SQLiteColumn, value: string): SQL {
  const escaped = value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return sql`${column} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
}