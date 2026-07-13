import { bookingCancelSchema, bookingCreateSchema, bookingListFilterSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { ok, paginated } from '../../lib/respond';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { cancelBooking, createBooking, listMyBookings } from './service';

export const bookingRoutes = new Hono<AppEnv>()
  // Гостевое бронирование разрешено: user подставляется, если есть токен.
  .post('/', validate('json', bookingCreateSchema), async (c) => {
    const booking = await createBooking(c.get('db'), c.req.valid('json'), c.get('user'), c.env.SITE_URL);
    return ok(c, booking, 201);
  })

  .get('/my', requireAuth, validate('query', bookingListFilterSchema), async (c) => {
    const user = c.get('user')!;
    const filter = c.req.valid('query');
    const { items, total } = await listMyBookings(c.get('db'), user.id, filter);
    return paginated(c, items, total, filter.page, filter.limit);
  })

  .post('/:id/cancel', requireAuth, validate('json', bookingCancelSchema), async (c) => {
    const user = c.get('user')!;
    await cancelBooking(c.get('db'), user.id, c.req.param('id'), c.req.valid('json').reason);
    return ok(c, { cancelled: true });
  });
