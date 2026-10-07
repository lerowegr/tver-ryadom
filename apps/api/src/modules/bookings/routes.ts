import { bookingCancelSchema, bookingCreateSchema, bookingListFilterSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { rateLimit, rateLimits } from '../../lib/rate-limit';
import { ok, paginated } from '../../lib/respond';
import { requireCaptchaForGuest } from '../../lib/turnstile';
import { requireAuth, resolveOptionalUser } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { cancelBooking, createBooking, listMyBookings } from './service';

export const bookingRoutes = new Hono<AppEnv>()
  // Гостевое бронирование разрешено: user подставляется, если есть токен.
  // Протухшая/отозванная сессия — уже гость, а не владелец чужого аккаунта.
  .post('/', rateLimit(rateLimits.bookingCreate), validate('json', bookingCreateSchema), async (c) => {
    const input = c.req.valid('json');
    await requireCaptchaForGuest(c, input.cfToken);
    const user = await resolveOptionalUser(c.get('db'), c.get('user'));
    const booking = await createBooking(c.get('db'), input, user, c.env.SITE_URL);
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
