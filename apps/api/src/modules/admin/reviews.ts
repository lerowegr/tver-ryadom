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

/**
 * Отзыв, заведённый вручную из админки. Экскурсовод получает их в мессенджерах
 * и по телефону, поэтому нужен способ внести отзыв, минуя форму на сайте.
 * По умолчанию сразу опубликован: модерировать собственную запись незачем.
 */
const adminReviewCreateSchema = z.object({
  tourId: z.string().trim().min(1),
  authorName: z.string().trim().min(2).max(100),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(10, 'Отзыв должен быть не короче 10 символов').max(2000),
  status: z.enum(REVIEW_STATUSES).default('approved'),
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

  .post('/', validate('json', adminReviewCreateSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.get('db');

    const tour = await db.query.tours.findFirst({
      where: eq(tours.id, input.tourId),
      columns: { id: true },
    });
    if (!tour) throw notFound('Экскурсия не найдена');

    const id = crypto.randomUUID();
    await db.insert(reviews).values({
      id,
      tourId: input.tourId,
      authorName: input.authorName,
      rating: input.rating,
      text: input.text,
      status: input.status,
    });
    await recalcTourRating(db, input.tourId);
    return ok(c, { id, status: input.status }, 201);
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
