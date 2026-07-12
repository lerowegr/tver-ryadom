import { settings } from '@tver/db';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const updateSchema = z.object({
  entries: z.record(z.string().min(1).max(100), z.string().max(2000)),
});

export const adminSettingsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.get('db').select().from(settings);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return ok(c, result);
  })

  .put('/', validate('json', updateSchema), async (c) => {
    const { entries } = c.req.valid('json');
    const db = c.get('db');
    for (const [key, value] of Object.entries(entries)) {
      await db
        .insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(value), updatedAt: new Date() },
        });
    }
    return ok(c, { saved: Object.keys(entries).length });
  });
