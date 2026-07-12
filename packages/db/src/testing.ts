import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Db } from './index';
import * as schema from './schema';

// .toString(): глобальный тип URL в Workers-окружении несовместим с node:url.URL
const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url).toString());

/**
 * In-memory SQLite с применёнными миграциями — для тестов пакетов и API.
 * По API запросов совместим с D1-типом Db.
 */
export function createTestDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`Не найдены миграции в ${migrationsDir} — запустите pnpm db:generate`);
  }
  for (const file of files) {
    sqlite.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return drizzle(sqlite, { schema }) as unknown as Db;
}
