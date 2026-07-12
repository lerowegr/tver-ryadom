import type { Db } from '@tver/db';
import { reviews, tours } from '@tver/db';
import { REVIEW_STATUSES, paginationSchema, reviewModerateSchema } from '@tver/shared';
import { and, avg, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { notFound } from '../../lib/errors';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const listFilterSchema = paginationSchema.extend({
  status: z.enum(REVIEW_STATUSES).optional(),
});

/** Пересчитывает денормализованный рейтинг тура по одобренным отзывам. */
async function recalcTourRating(db: Db, tourId: string) {
  const [row] = await db
    .select({ avgRating: avg(reviews.rating), total: count() })
    .from(reviews)
    .where(and(eq(reviews.tourId, tourId), eq(reviews.status, 'approved')));

  const ratingCount = row?.total ?? 0;
  const ratingAvg = ratingCount > 0 ? Math.round(Number(row?.avgRating ?? 0) * 10) / 10 : 0;
  await db.update(tours).set({ ratingAvg, ratingCount }).where(eq(tours.id, tourId));
}

export const adminReviewRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');
    const where = filter.status ? eq(reviews.status, filter.status) : undefined;

    const [totalRow] = await db.select({ total: count() }).from(reviews).where(where);
    const rows = await db.query.reviews.findMany({
      where,
      with: { tour: { columns: { id: true, slug: true, title: true } } },
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });
    return paginated(c, rows, totalRow?.total ?? 0, filter.page, filter.limit);
  })

  .patch('/:id', validate('json', reviewModerateSchema), async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = c.get('db');

    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, id) });
    if (!review) throw notFound('Отзыв не найден');

    await db.update(reviews).set({ status: input.status }).where(eq(reviews.id, id));
    await recalcTourRating(db, review.tourId);
    return ok(c, { id, status: input.status });
  });
