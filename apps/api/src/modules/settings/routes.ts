import { settings } from '@tver/db';
import { Hono } from 'hono';
import { like, or } from 'drizzle-orm';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';

/** Публичные настройки сайта: контакты, соцсети, название и слоган компании. */
export const settingsRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const rows = await c
    .get('db')
    .select()
    .from(settings)
    .where(or(like(settings.key, 'contacts.%'), like(settings.key, 'company.%')));

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return ok(c, result);
});
