import { outbox } from '@tver/db';
import { OUTBOX_STATUSES, paginationSchema } from '@tver/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { notFound } from '../../lib/errors';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const listFilterSchema = paginationSchema.extend({
  status: z.enum(OUTBOX_STATUSES).default('failed'),
});

function publicView(row: typeof outbox.$inferSelect) {
  // Токены из payload (например, resetUrl сброса пароля) админке ни к чему:
  // для диагностики достаточно шаблона, получателя и ошибки.
  const { resetUrl: _resetUrl, ...safePayload } = (row.payload ?? {}) as Record<string, unknown>;
  void _resetUrl;
  return { ...row, payload: safePayload };
}

/**
 * Dead letter очереди уведомлений: что не доставилось и почему.
 * Без этого упавшие письма (сброс пароля, подтверждения) видны только в логах.
 */
export const adminOutboxRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');
    const where = eq(outbox.status, filter.status);
    const [totalRow] = await db.select({ total: count() }).from(outbox).where(where);
    const rows = await db.query.outbox.findMany({
      where,
      orderBy: [desc(outbox.createdAt)],
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });
    return paginated(
      c,
      rows.map(publicView),
      totalRow?.total ?? 0,
      filter.page,
      filter.limit,
    );
  })

  /** Перепоставить failed-задачу в очередь (счётчик попыток с нуля). */
  .post('/:id/retry', async (c) => {
    const db = c.get('db');
    const row = await db.query.outbox.findFirst({
      where: and(eq(outbox.id, c.req.param('id')), eq(outbox.status, 'failed')),
      columns: { id: true },
    });
    if (!row) throw notFound('Неудавшаяся задача не найдена');
    await db
      .update(outbox)
      .set({ status: 'pending', attempts: 0, lastError: null, sentAt: null, scheduledAt: new Date() })
      .where(eq(outbox.id, row.id));
    return ok(c, { retried: true });
  });
