import { contactRequests } from '@tver/db';
import { CONTACT_REQUEST_STATUSES, paginationSchema } from '@tver/shared';
import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { notFound } from '../../lib/errors';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const listFilterSchema = paginationSchema.extend({
  status: z.enum(CONTACT_REQUEST_STATUSES).optional(),
});

const updateSchema = z.object({ status: z.enum(CONTACT_REQUEST_STATUSES) });

export const adminRequestRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');
    const where = filter.status ? eq(contactRequests.status, filter.status) : undefined;

    const [totalRow] = await db.select({ total: count() }).from(contactRequests).where(where);
    const rows = await db.query.contactRequests.findMany({
      where,
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });
    return paginated(c, rows, totalRow?.total ?? 0, filter.page, filter.limit);
  })

  .patch('/:id', validate('json', updateSchema), async (c) => {
    const id = c.req.param('id');
    const db = c.get('db');
    const existing = await db.query.contactRequests.findFirst({
      where: eq(contactRequests.id, id),
      columns: { id: true },
    });
    if (!existing) throw notFound('Заявка не найдена');

    await db
      .update(contactRequests)
      .set({ status: c.req.valid('json').status })
      .where(eq(contactRequests.id, id));
    return ok(c, { id });
  });
