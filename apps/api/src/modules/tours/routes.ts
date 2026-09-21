import { paginationSchema, tourFilterSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { imagesBaseOf } from '../../lib/images';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import {
  getTourBySlug,
  listBadges,
  listTourReviews,
  listTours,
  listUpcomingSchedules,
} from './service';

export const tourRoutes = new Hono<AppEnv>()
  .get('/', validate('query', tourFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const { items, total } = await listTours(c.get('db'), filter, imagesBaseOf(c));
    return paginated(c, items, total, filter.page, filter.limit);
  })

  .get('/:slug', async (c) => {
    return ok(c, await getTourBySlug(c.get('db'), c.req.param('slug'), imagesBaseOf(c)));
  })

  .get('/:slug/reviews', validate('query', paginationSchema), async (c) => {
    const pagination = c.req.valid('query');
    const { items, total } = await listTourReviews(c.get('db'), c.req.param('slug'), pagination);
    return paginated(c, items, total, pagination.page, pagination.limit);
  });

export const badgeRoutes = new Hono<AppEnv>().get('/', async (c) => {
  return ok(c, await listBadges(c.get('db')));
});

/** Расписание сборных экскурсий: ближайшие открытые слоты по всем маршрутам. */
export const scheduleRoutes = new Hono<AppEnv>().get('/', async (c) => {
  return ok(c, { items: await listUpcomingSchedules(c.get('db'), imagesBaseOf(c)) });
});
