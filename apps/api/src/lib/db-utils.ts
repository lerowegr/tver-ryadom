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
